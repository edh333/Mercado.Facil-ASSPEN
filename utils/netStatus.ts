import { enableNetwork } from 'firebase/firestore';
import { db } from '../firebase';

// Detecção de ALCANCABILIDADE real, não apenas "a interface de rede está up".
//
// `navigator.onLine` só diz se existe uma interface de rede ativa. Em Wi-Fi de
// presa, hotspot ou portal cativo, ele retorna `true` com a internet
// inacessível. O consequência no PDV era grave: o app se declarava "Online",
// a sincronização tentava, falhava, e TODAS as vendas da fila viravam `error`
// terminal — justamente no pior cenário (sinal dentro da gaiola, sem internet).
//
// O probe usa `enableNetwork()` do próprio SDK do Firestore, que resolve só
// quando o backend responde. Sem endpoint externo, sem CORS, sem polling
// configurável. O resultado é cacheado por 5s para não custar uma ida ao
// backend a cada verificação.

const TTL_CACHE_MS = 5000;
const TIMEOUT_PADRAO_MS = 4000;

let cache: { valor: boolean; emMs: number } | null = null;

export async function verificarInternetReal(
  agora = Date.now(),
  timeoutMs: number = TIMEOUT_PADRAO_MS
): Promise<boolean> {
  if (cache && agora - cache.emMs < TTL_CACHE_MS) return cache.valor;

  // Sem rede segundo o próprio SO: resposta definitiva, sem gastar probe.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    cache = { valor: false, emMs: agora };
    return false;
  }

  let valor = false;
  try {
    await Promise.race([
      enableNetwork(db),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('probe-timeout')), timeoutMs)),
    ]);
    valor = true;
  } catch {
    valor = false;
  }

  cache = { valor, emMs: agora };
  return valor;
}

/** Limpa o cache do probe (usado em testes). */
export function limparCacheRede(): void {
  cache = null;
}
