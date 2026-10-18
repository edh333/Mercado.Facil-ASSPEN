import { WalletTransaction } from '../types';

export type DirecaoTransacao = 'credito' | 'debito';

/**
 * Direção (entrada/saída) de uma transação de carteira, decidida pelo SINAL do
 * valor — não pelo `type`. Antes o AdminUserDetailsModal tratava tudo que não
 * fosse `withdrawal` como crédito (verde/`+`), então uma compra ou devolução de
 * alvará aparecia somando no extrato. O sinal é a fonte da verdade.
 */
export function direcaoTransacao(tx: Pick<WalletTransaction, 'type' | 'amount'>): DirecaoTransacao {
  const amount = Number(tx?.amount) || 0;
  if (amount < 0) return 'debito';
  if (amount > 0) return 'credito';
  return tx?.type === 'deposit' ? 'credito' : 'debito';
}

/** Rótulo em português para o tipo cru da transação (deposit/withdrawal/...). */
export function labelTransacao(tipo: string | undefined): string {
  switch (tipo) {
    case 'deposit': return 'Crédito';
    case 'purchase': return 'Compra';
    case 'withdrawal': return 'Retirada';
    case 'alvara_return': return 'Devolvido (alvará)';
    case 'refund': return 'Estorno';
    case 'correction': return 'Ajuste';
    default: return tipo || '—';
  }
}
