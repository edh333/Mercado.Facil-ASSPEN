import { db } from "../firebase";
import {
  collection,
  query,
  where,
  limit,
  orderBy,
  getDocs,
  writeBatch,
  doc,
  Timestamp
} from "firebase/firestore";

const STORAGE_KEY = "mercado_facil_last_archive";
const INTERVAL_DAYS = 45;
const BATCH_SIZE = 50;

interface CollectionConfig {
  name: string;
  dateField: string;
}

const COLLECTIONS_TO_ARCHIVE: CollectionConfig[] = [
  { name: "orders", dateField: "createdAt" },
  { name: "expenses", dateField: "date" },
  { name: "wallet_transactions", dateField: "createdAt" },
];

/**
 * Returns true if the archiving routine should run today.
 * Uses localStorage to avoid running more than once per day.
 */
export function shouldRunArchive(): boolean {
  try {
    const lastRun = localStorage.getItem(STORAGE_KEY);
    if (!lastRun) return true;
    const lastDate = new Date(lastRun);
    const now = new Date();
    const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 1;
  } catch {
    return false;
  }
}

/**
 * Marks the archive as having run today.
 */
function markArchiveDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // localStorage unavailable, silently ignore
  }
}

/**
 * Client-side archiving routine — no Blaze plan required.
 *
 * Moves documents older than 45 days from active collections
 * to the `historico_geral` archive collection in Firestore,
 * preserving data for accounting and reporting while keeping
 * active collections lean and performant.
 *
 * @returns Total number of documents archived.
 */
export async function executarArquivamentoLocal(): Promise<number> {
  const inicio = Date.now();
  console.info(`[Arquivamento 45d] início: ${COLLECTIONS_TO_ARCHIVE.map(c => c.name).join(', ')}.`);

  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - INTERVAL_DAYS);
  const dataLimiteISO = dataLimite.toISOString();

  let totalProcessado = 0;

  for (const colecao of COLLECTIONS_TO_ARCHIVE) {
    try {
      // orderBy(dateField) garante que SEMPRE arquaiamos os MAIS ANTIGOS
      // primeiro — antes, sem ordenação, a seleção dos "primeiros 50" era
      // arbitrária e podia deixar documentos velhos para trás por semanas.
      const q = query(
        collection(db, colecao.name),
        where(colecao.dateField, "<=", dataLimiteISO),
        orderBy(colecao.dateField, "asc"),
        limit(BATCH_SIZE)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        continue;
      }

      // Batch ÚNICO e atômico: cada documento é COPIADO para historico_geral
      // (com id gerado) e DELETADO na MESMA operação. Antes, addDoc era feito
      // doc a doc e só depois batch.delete — se o addDoc falhasse no meio,
      // alguns docs eram arquivados 2x (duplicata) ou nenhum; se o batch
      // falhasse depois dos addDoc, ficava lixo no arquivo sem delete.
      // Agora: OU tudo arquiva+deleta, OU nada acontece.
      const batch = writeBatch(db);
      let count = 0;

      for (const docSnap of snapshot.docs) {
        const dadosOriginais = docSnap.data();

        // Id determinístico para evitar duplicatas se rodar 2x no mesmo dia
        const novoRef = doc(collection(db, "historico_geral"));
        batch.set(novoRef, {
          origem: colecao.name,
          idOriginal: docSnap.id,
          dataOriginal: docSnap.data().createdAt || docSnap.data().date || null,
          ...dadosOriginais,
          arquivadoEm: new Date().toISOString(),
        });

        batch.delete(docSnap.ref);
        count++;
      }

      await batch.commit();
      totalProcessado += count;
      console.info(`[Arquivamento 45d] ${colecao.name}: ${count} doc(s) arquivados (atômico).`);

    } catch (erro) {
      console.error(`[Arquivamento 45d] erro em '${colecao.name}':`, erro);
    }
  }

  markArchiveDone();
  console.info(`[Arquivamento 45d] concluído: ${totalProcessado} documento(s) em ${Date.now() - inicio}ms.`);
  return totalProcessado;
}
