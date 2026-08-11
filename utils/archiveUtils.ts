import { db } from "../firebase";
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  writeBatch,
  addDoc,
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
  console.log("🗂️ Iniciando arquivamento local (45 dias)...");

  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - INTERVAL_DAYS);
  const dataLimiteISO = dataLimite.toISOString();

  let totalProcessado = 0;

  for (const colecao of COLLECTIONS_TO_ARCHIVE) {
    try {
      const q = query(
        collection(db, colecao.name),
        where(colecao.dateField, "<=", dataLimiteISO),
        limit(BATCH_SIZE)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.log(`✅ Coleção '${colecao.name}' já está limpa.`);
        continue;
      }

      const batch = writeBatch(db);

      for (const docSnap of snapshot.docs) {
        const dadosOriginais = docSnap.data();

        // 1. Archive to historico_geral BEFORE deleting
        await addDoc(collection(db, "historico_geral"), {
          origem: colecao.name,
          idOriginal: docSnap.id,
          ...dadosOriginais,
          arquivadoEm: new Date().toISOString(),
        });

        // 2. Stage deletion
        batch.delete(docSnap.ref);
        totalProcessado++;
      }

      // 3. Execute the batch delete
      await batch.commit();
      console.log(`📦 ${snapshot.size} itens de '${colecao.name}' arquivados.`);

    } catch (erro) {
      console.error(`❌ Erro ao arquivar coleção '${colecao.name}':`, erro);
    }
  }

  markArchiveDone();
  console.log(`✅ Arquivamento concluído. Total: ${totalProcessado} documentos movidos.`);
  return totalProcessado;
}
