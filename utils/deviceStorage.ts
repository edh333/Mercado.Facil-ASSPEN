import { listPendingUploads } from '../services/localStorageService';

// Marcações de cache do Service Worker (mesmo contrato do index.tsx)
export const SW_CACHE_ATUAL = 'mercado-facil-v21';

export interface MetricaArmazenamento {
  usadoBytes: number | null;
  cotaBytes: number | null;
  percentual: number | null;
  keysLocalStorage: number;
  bytesLocalStorage: number;
  cachesArmazenados: number;
  swRegistrados: number;
  bancosIdb: string[];
  uploadsPendentes: number;
}

export interface ResultadoLimpeza {
  modo: 'cache' | 'total';
  chavesLocalStorageRemovidas: number;
  sessoesLimpas: boolean;
  cachesRemovidos: string[];
  swDesregistrados: number;
  bancosIdbRemovidos: string[];
  reiniciar: boolean;
}

const NOMES_IDB_PADRAO = ['firebaseLocalStorageDb', 'firestore', 'mercado_facil_uploads'];

const listarBancosIdb = async (): Promise<string[]> => {
  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      const nomes = (dbs || []).map((d) => d.name).filter((n): n is string => !!n);
      return [...new Set([...nomes, ...NOMES_IDB_PADRAO])];
    }
  } catch { /* navegador sem suporte — usa lista conhecida */ }
  return [...NOMES_IDB_PADRAO];
};

const medirBytesLocalStorage = (): number => {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const v = localStorage.getItem(k);
    total += (k.length + (v ? v.length : 0)) * 2; // UTF-16
  }
  return total;
};

const estimarUsoNavegador = async (): Promise<{ usado: number | null; cota: number | null }> => {
  try {
    const est = await (navigator as any).storage?.estimate?.();
    return { usado: est?.usage ?? null, cota: est?.quota ?? null };
  } catch {
    return { usado: null, cota: null };
  }
};

export const medirArmazenamento = async (): Promise<MetricaArmazenamento> => {
  const [est, bancos] = await Promise.all([estimarUsoNavegador(), listarBancosIdb()]);
  let swCount = 0;
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      swCount = regs.length;
    }
  } catch { /* indisponível */ }
  let cachesNames: string[] = [];
  try {
    if ('caches' in window) cachesNames = await caches.keys();
  } catch { /* indisponível */ }
  let uploads = 0;
  try {
    uploads = (await listPendingUploads()).length;
  } catch { /* banco inexistente */ }

  const usadoBytes = est.usado;
  const cotaBytes = est.cota;
  return {
    usadoBytes,
    cotaBytes,
    percentual: cotaBytes && usadoBytes !== null ? Math.min(100, Math.round((usadoBytes / cotaBytes) * 100)) : null,
    keysLocalStorage: localStorage.length,
    bytesLocalStorage: medirBytesLocalStorage(),
    cachesArmazenados: cachesNames.length,
    swRegistrados: swCount,
    bancosIdb: bancos,
    uploadsPendentes: uploads,
  };
};

/** Limpeza leve: remove apenas caches de builds antigos do Service Worker.
 *  NÃO derruba a sessão nem apaga carrinho/configurações. Seguro para uso
 *  diário no caixa. */
export const limparCachesLegados = async (): Promise<ResultadoLimpeza> => {
  const removidos: string[] = [];
  try {
    if ('caches' in window) {
      const nomes = await caches.keys();
      for (const nome of nomes) {
        if (nome !== SW_CACHE_ATUAL) {
          await caches.delete(nome).catch(() => {});
          removidos.push(nome);
        }
      }
    }
  } catch { /* indisponível */ }
  return { modo: 'cache', chavesLocalStorageRemovidas: 0, sessoesLimpas: false, cachesRemovidos: removidos, swDesregistrados: 0, bancosIdbRemovidos: [], reiniciar: false };
};

/** Limpeza TOTAL: apaga localStorage, sessionStorage, todos os caches, todos
 *  os bancos IndexedDB e desregistra todos os Service Workers. O usuário é
 *  desconectado (auth também fica no dispositivo) e precisa entrar de novo.
 *  Deve ser usada como último recurso (troca de operador, erro persistente). */
export const limparTodosDadosLocais = async (): Promise<ResultadoLimpeza> => {
  const chavesRemovidas = localStorage.length;
  let swRemovidos = 0;
  let cachesRemovidos: string[] = [];
  let bancosIdb: string[] = [];

  try { localStorage.clear(); sessionStorage.clear(); } catch { /* bloqueado */ }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        await r.unregister().catch(() => {});
        swRemovidos++;
      }
    }
  } catch { /* indisponível */ }

  try {
    if ('caches' in window) {
      cachesRemovidos = await caches.keys();
      await Promise.all(cachesRemovidos.map((n) => caches.delete(n).catch(() => {})));
    }
  } catch { /* indisponível */ }

  try {
    bancosIdb = await listarBancosIdb();
    for (const nome of bancosIdb) {
      try { await indexedDB.deleteDatabase(nome); } catch { /* em uso — fecha depois */ }
    }
  } catch { /* indisponível */ }

  return {
    modo: 'total',
    chavesLocalStorageRemovidas: chavesRemovidas,
    sessoesLimpas: true,
    cachesRemovidos,
    swDesregistrados: swRemovidos,
    bancosIdbRemovidos: bancosIdb,
    reiniciar: true,
  };
};

export const formatarBytes = (b: number | null | undefined): string => {
  if (b === null || b === undefined || isNaN(b)) return '--';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
};