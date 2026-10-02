// Fila local de vendas feitas SEM INTERNET (PDV offline).
// Quando o mercado vende sem conexão, a venda cai aqui (caderno digital no
// próprio dispositivo) e é sincronizada automaticamente quando a rede volta.
// O id da venda vira o clientToken da chamada ao servidor → idempotência:
// se a sincronização falhar no meio e repetir, o servidor não cria duplicata.

export interface VendaOffline {
  id: string;
  createdAt: string;
  targetUserId: string;
  items: { productId: string; name: string; price: number; quantity: number }[];
  paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30';
  payments?: { method: string; amount: number }[];
  change?: number;
  cardBrand?: string;
  customerAccountId?: string;
  sessaoCaixaId?: string;
  total: number;
  // 'ajustada' = venda sincronizada com valor DIFERENTE do registrado offline
  // (preço mudou no servidor). Já foi contabilizada lá — fica apenas para
  // conferência, NUNCA deve ser reenviada (status terminal de sync).
  status: 'pending' | 'error' | 'ajustada';
  error?: string;
  tryCount: number;
  /** Epoch ms da última tentativa de sincronização. Usado para o backoff. */
  ultimaTentativa?: number;
  /** Epoch ms da última mudança de status (para ordenar por, não por ordem de inserção). */
  atualizadoEm?: number;
}

const KEY = 'mf_vendas_offline';

/**
 * Teto da fila. Antes 200 — e ao estourar, as MAIS ANTIGAS (que são justamente
 * as `pending` ainda não sincronizadas, já cobradas do cliente e já com cupom
 * impresso) eram silenciosamente descartadas. Perda de receita com um toast
 * efêmero como único aviso. 1000 dá folga de ~8x para um dia de PDV alto sem
 * ameaçar a cota do localStorage (~5MB; cada registro ≈ 0,5–1KB).
 */
export const LIMITE_FILA = 1000;

/** Após N tentativas automáticas a venda para de tentar sozinha e exige ação humana. */
export const MAX_TENTATIVAS_AUTOMATICAS = 8;

/** Backoff exponencial: 1, 2, 4, 8, 16, 30, 30... minutos. */
export function atrasoParaRetry(tryCount: number): number {
  const n = Math.max(0, Math.floor(Number(tryCount) || 0));
  const minutos = Math.min(Math.pow(2, n), 30);
  return minutos * 60 * 1000;
}

/**
 * A venda pode ser (re)enviada agora?
 * - 'pending': sempre.
 * - 'ajustada': nunca (terminal de sync).
 * - 'error': só depois do intervalo de backoff e enquanto não esgotar as
 *   tentativas automáticas.
 */
export function podeTentarSync(v: VendaOffline, agora = Date.now()): boolean {
  if (v.status === 'ajustada') return false;
  if (v.status === 'pending') return true;
  const tentativas = Math.max(0, Math.floor(Number(v.tryCount) || 0));
  if (tentativas >= MAX_TENTATIVAS_AUTOMATICAS) return false;
  if (!v.ultimaTentativa) return true;
  return v.ultimaTentativa + atrasoParaRetry(tentativas) <= agora;
}

function ler(): VendaOffline[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Grava a fila INTEIRA. Nunca descarta venda: se estourar o teto ou a cota do
 * storage, os dados ficam intactos e a falha é sinalizada por evento — o
 * chamador decide o que fazer (bloquear nova venda, pedir sincronização).
 */
function gravar(lista: VendaOffline[]): boolean {
  try {
    if (lista.length > LIMITE_FILA) {
      console.warn(
        `[PDV OFFLINE] Fila acima do teto (${LIMITE_FILA}) — gravação cancelada para não perder venda.`,
      );
      try {
        window.dispatchEvent(new CustomEvent('offline-queue-full', { detail: { total: lista.length, limite: LIMITE_FILA } }));
      } catch { /* noop */ }
      return false;
    }
    localStorage.setItem(KEY, JSON.stringify(lista));
    return true;
  } catch (e) {
    // Cota do localStorage estourada ou storage indisponível: NÃO descarta nada.
    console.error('[PDV OFFLINE] Falha ao gravar a fila — vendas mantidas em memória nesta sessão.', e);
    try {
      window.dispatchEvent(new CustomEvent('offline-queue-full', { detail: { total: lista.length, limite: LIMITE_FILA, quota: true } }));
    } catch { /* noop */ }
    return false;
  }
}

export function listarVendasOffline(): VendaOffline[] {
  return ler();
}

/** Vendas sincronizadas com preço divergente — precisam de conferência do operador. */
export function listarVendasOfflineAjustadas(): VendaOffline[] {
  return ler().filter((v) => v.status === 'ajustada');
}

/**
 * Salva uma venda offline.
 * @returns true se foi gravada; false se a fila está cheia/indisponível.
 *          No caso de false a venda NÃO foi salva — o chamador precisa avisar
 *          o operador em vez de fingir sucesso (a venda já foi cobrada).
 */
export function salvarVendaOffline(venda: VendaOffline): boolean {
  const lista = ler().filter((v) => v.id !== venda.id);
  lista.push(venda);
  return gravar(lista);
}

export function removerVendaOffline(id: string): void {
  gravar(ler().filter((v) => v.id !== id));
}

/**
 * Descarta uma venda com erro que o operador decidiunão recuperar
 * (ex.: cliente sem saldo, venda irrecuperável). A remoção é explícita e
 * auditada pelo operador — nunca automática.
 */
export function descartarVendaOffline(id: string): void {
  removerVendaOffline(id);
}

/** Devolve uma venda com erro para nova tentativa (zera o contador e o backoff). */
export function rearmarVendaOffline(id: string): void {
  const lista = ler();
  const v = lista.find((x) => x.id === id);
  if (!v) return;
  v.status = 'pending';
  v.error = undefined;
  v.tryCount = 0;
  delete v.ultimaTentativa;
  v.atualizadoEm = Date.now();
  gravar(lista);
}

export function marcarErroVendaOffline(id: string, erro: string): void {
  const lista = ler();
  const v = lista.find((x) => x.id === id);
  if (!v) return;
  v.status = 'error';
  v.error = erro;
  v.tryCount = (v.tryCount || 0) + 1;
  v.ultimaTentativa = Date.now();
  v.atualizadoEm = Date.now();
  gravar(lista);
}

export function marcarAjustadaVendaOffline(id: string, erro: string): void {
  const lista = ler();
  const v = lista.find((x) => x.id === id);
  if (!v) return;
  v.status = 'ajustada';
  v.error = erro;
  v.atualizadoEm = Date.now();
  gravar(lista);
}

/**
 * Remove APENAS as vendas com erro que o operador não conseguiu recuperar.
 * NÃO toca em 'pending' (ainda não sincronizadas = receita não registrada) nem
 * em 'ajustada' (já contabilizadas no servidor, guardadas para conferência).
 *
 * A implementação anterior era `filter(v => v.status === 'pending')`, que
 * mantinha só as pending — ou seja, APAGAVA as ajustadas, que são registro de
 * venda já cobrada. Sem uso no projeto desde que o painel passou a tratar cada
 * venda individualmente (descartarVendaOffline / rearmarVendaOffline).
 */
export function limparErrosVendaOffline(): void {
  const lista = ler();
  const restantes = lista.filter((v) => v.status !== 'error');
  if (restantes.length === lista.length) return; // nada a limpar
  gravar(restantes);
}
