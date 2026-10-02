import { useEffect, useState } from 'react';
import {
  collection, query, where, orderBy, limit, startAfter, getDocs,
  getDocsFromServer, DocumentData, QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';

const PAGINA = 500;
// Teto de segurança: se o período tiver mais pedidos que isso, o relatório
// avisa que está truncado em vez de mentir mostrando um total incompleto.
const TETO_TOTAL = 10000;

const comId = (d: QueryDocumentSnapshot<DocumentData>): any => ({ ...d.data(), id: d.id });

async function carregarPeriodo(
  nomeColecao: string,
  campoData: 'createdAt' | 'date',
  inicioIso: string,
  fimIso: string
): Promise<{ itens: any[]; truncado: boolean; erro: string }> {
  const col = collection(db, nomeColecao);
  const itens: any[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  let erro = '';

  try {
    for (;;) {
      const q = cursor
        ? query(col,
            where(campoData, '>=', inicioIso), where(campoData, '<=', fimIso),
            orderBy(campoData, 'desc'), startAfter(cursor), limit(PAGINA))
        : query(col,
            where(campoData, '>=', inicioIso), where(campoData, '<=', fimIso),
            orderBy(campoData, 'desc'), limit(PAGINA));

      // getDocsFromServer: o relatório é uma leitura pontual e DEFINITIVA.
      // onSnapshot/cache poderia devolver um resultado parcial do cache local e
      // gerar um PDF com totais errados sem nenhum aviso.
      const snap = await getDocsFromServer(q);
      if (snap.empty) break;

      snap.docs.forEach((d) => {
        const o = comId(d);
        if (o.deleted !== true) itens.push(o);
      });

      if (snap.size < PAGINA) break;
      cursor = snap.docs[snap.docs.length - 1];
      if (itens.length >= TETO_TOTAL) break;
    }
  } catch (e: any) {
    // Erro de índice ausente é o caso comum: a query é nova e o índice ainda
    // não foi publicado. Devolve o que leu, MAS marca a falha para o chamador
    // avisar — antes, o catch engolia e o PDF saía com total errado em silêncio.
    console.warn('[useReportData] falha ao carregar', nomeColecao, e);
    erro = String(e?.message || 'Falha na leitura dos dados do período.');
  }

  return { itens, truncado: itens.length >= TETO_TOTAL, erro };
}

/** Converte 'YYYY-MM-DD' em ISO no FUSO LOCAL, não UTC.
 *  new Date('2026-09-28') é interpretado como UTC meia-noite (= 21h do dia
 *  anterior no Brasil) e truncaria o último dia do relatório. */
function limitesDoPeriodo(startDate?: string, endDate?: string) {
  const hoje = new Date();
  const padrao = hoje.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const ini = startDate || padrao;
  const fim = endDate || padrao;
  // Folga de 2 dias: o filtro final do relatório usa o campo `date`, que pode
  // divergir do `createdAt` em pedidos lancados com data retroativa.
  const comFolga = (d: string, dias: number) => {
    const t = new Date(d + 'T00:00:00').getTime() + dias * 86400000;
    return new Date(t).toISOString();
  };
  return { inicioIso: comFolga(ini, -2), fimIso: comFolga(fim, 2) };
}

interface Estado {
  pedidos: any[] | null;
  despesas: any[] | null;
  carregando: boolean;
  truncadoPedidos: boolean;
  /** Falha real de leitura (índice ausente, permissão, rede). Nunca esconder:
   *  um relatório gerado com dados parciais sem aviso é pior que um erro. */
  erro: string;
}

/**
 * Carrega TODOS os pedidos/despesas do período do relatório, direto do
 * servidor, paginado.
 *
 * Motivo: o AdminDashboard mantém `orders` limitado a 50 no cliente por
 * performance. O relatório, porém, precisa do histórico COMPLETO do período —
 * senão o PDF sai com totais subestimados sem nenhum aviso, o que é pior que
 * um relatório lento.
 */
export function useReportData(ativo: boolean, startDate?: string, endDate?: string): Estado {
  const [estado, setEstado] = useState<Estado>({
    pedidos: null, despesas: null, carregando: false, truncadoPedidos: false, erro: '',
  });

  useEffect(() => {
    if (!ativo) {
      setEstado({ pedidos: null, despesas: null, carregando: false, truncadoPedidos: false, erro: '' });
      return;
    }

    let cancelado = false;
    setEstado((e) => ({ ...e, carregando: true, erro: '' }));

    const { inicioIso, fimIso } = limitesDoPeriodo(startDate, endDate);
    (async () => {
      const [p, d] = await Promise.all([
        // Pedidos são filtrados por `createdAt` (data de lançamento).
        carregarPeriodo('orders', 'createdAt', inicioIso, fimIso),
        // Despesas usam `date`, não `createdAt` — mesmo campo que o relatório
        // filtra, então a folga cobre a diferença de timezone.
        carregarPeriodo('expenses', 'date', inicioIso, fimIso),
      ]);
      if (cancelado) return;
      // Falha de QUALQUER uma das coleções invalida o relatório inteiro: o
      // total de vendas e o de despesas precisam vir ambos completos.
      const erros = [p.erro && `Pedidos: ${p.erro}`, d.erro && `Despesas: ${d.erro}`]
        .filter(Boolean).join(' | ');
      setEstado({
        pedidos: p.itens,
        despesas: d.itens,
        carregando: false,
        truncadoPedidos: p.truncado || d.truncado,
        erro: erros,
      });
    })();

    return () => { cancelado = true; };
  }, [ativo, startDate, endDate]);

  return estado;
}

/** Versão avulsa de `carregarPeriodo`, para quem precisar dos pedidos sem
 *  montar o modal (ex.: exportação de CSV direto). */
export async function carregarPedidosDoPeriodo(startDate?: string, endDate?: string) {
  const { inicioIso, fimIso } = limitesDoPeriodo(startDate, endDate);
  return carregarPeriodo('orders', 'createdAt', inicioIso, fimIso);
}

export { getDocs };
