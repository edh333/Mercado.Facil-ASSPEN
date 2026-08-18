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
  paymentMethod: 'PIX' | 'WALLET' | 'CASH' | 'MIXED' | 'FIADO';
  payments?: { method: string; amount: number }[];
  change?: number;
  customerAccountId?: string;
  total: number;
  status: 'pending' | 'error';
  error?: string;
  tryCount: number;
}

const KEY = 'mf_vendas_offline';

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

function gravar(lista: VendaOffline[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lista.slice(-200)));
  } catch { /* storage cheio/indisponível — a fila fica só em memória */ }
}

export function listarVendasOffline(): VendaOffline[] {
  return ler();
}

export function salvarVendaOffline(venda: VendaOffline): void {
  const lista = ler().filter((v) => v.id !== venda.id);
  lista.push(venda);
  gravar(lista);
}

export function removerVendaOffline(id: string): void {
  gravar(ler().filter((v) => v.id !== id));
}

export function marcarErroVendaOffline(id: string, erro: string): void {
  const lista = ler();
  const v = lista.find((x) => x.id === id);
  if (!v) return;
  v.status = 'error';
  v.error = erro;
  v.tryCount = (v.tryCount || 0) + 1;
  gravar(lista);
}

export function limparErrosVendaOffline(): void {
  gravar(ler().filter((v) => v.status === 'pending'));
}