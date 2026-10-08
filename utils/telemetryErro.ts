import { getFunctions, httpsCallable } from 'firebase/functions';

/**
 * Telemetria LOCAL de erros — captura no navegador, guarda num buffer local
 * (sobrevive à tela branca/refresh) e envia para `client_errors` no Firestore
 * via callable. Permite diagnosticar remotamente falhas como a "tela branca"
 * sem depender do Sentry.
 *
 * Regras de robustez:
 *  - NUNCA quebra a UI: todo trecho está protegido (a telemetria é descartável).
 *  - Dedupe por (mensagem+origem): um loop de render que lança toda hora envia
 *    o erro UMA vez a cada ~10s, não spam de requests.
 *  - Buffer local limitado (20), flush limitado (10s), envio fire-and-forget;
 *    se o ambiente não tiver rede/sessão, o buffer fica guardado para a próxima.
 */
const KEY = 'mf_erros_captura';
const MAX_LOCAL = 20;
const MAX_POR_FLUSH = 20;
const INTERVALO_FLUSH_MS = 10_000;

let ultimoFlush = 0;
let flushando = false;
let chamada: ReturnType<typeof httpsCallable> | null = null;

export function obterBufferLocal(): any[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function salvarBuffer(arr: any[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX_LOCAL)));
  } catch {
    /* quota/privacidade indisponível — ignora */
  }
}

function normalizar(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

export function rastrearErroCliente(dados: {
  mensagem?: unknown;
  stack?: unknown;
  componente?: unknown;
  origem: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = {
      t: new Date().toISOString(),
      m: normalizar(dados.mensagem, 500),
      s: normalizar(dados.stack, 4000),
      c: normalizar(dados.componente, 2000),
      o: normalizar(dados.origem, 40) || 'desconhecida',
      h: normalizar(window.location.href, 300),
    };
    if (!payload.m) return;

    const buf = obterBufferLocal();
    const ultimo = buf[buf.length - 1];
    if (ultimo && ultimo.m === payload.m && ultimo.o === payload.o && Date.now() - new Date(ultimo.t).getTime() < INTERVALO_FLUSH_MS) {
      return; // dedupe — mesmo erro repetido não vira lixo
    }
    buf.push(payload);
    salvarBuffer(buf);
    agendarFlush();
  } catch {
    /* telemetria nunca quebra a UI */
  }
}

export function tentarEnviarErrosPendentes(): void {
  if (typeof window === 'undefined') return;
  try {
    agendarFlush();
  } catch {
    /* ignora */
  }
}

function agendarFlush(): void {
  try {
    if (typeof navigator === 'undefined' || navigator.onLine === false) return;
    const agora = Date.now();
    if (flushando || agora - ultimoFlush < INTERVALO_FLUSH_MS) return;
    ultimoFlush = agora;
    flushando = true;
    flush()
      .catch(() => {
        /* mantém o buffer para a próxima tentativa */
      })
      .finally(() => {
        flushando = false;
      });
  } catch {
    flushando = false;
  }
}

async function flush(): Promise<void> {
  const buf = obterBufferLocal();
  if (buf.length === 0) return;
  if (typeof navigator === 'undefined' || navigator.onLine === false) return;
  try {
    if (!chamada) {
      chamada = httpsCallable(getFunctions(), 'registrarErroCliente');
    }
    const payload = {
      erros: buf.slice(0, MAX_POR_FLUSH).map((e: any) => ({
        t: e.t, m: e.m, s: e.s, c: e.c, o: e.o, h: e.h,
      })),
    };
    const res: any = await chamada(payload);
    if (res?.data?.ok === true) {
      salvarBuffer([]);
    } else {
      salvarBuffer(buf.slice(MAX_POR_FLUSH));
    }
  } catch {
    /* sem sessão/rede — o buffer permanece para o próximo flush */
  }
}