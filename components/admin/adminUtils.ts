import { OrderStatus } from '../../types';

export const translateStatus = (status: string | undefined) => {
    if (!status) return 'Indefinido';
    const s = String(status); 
    const map: Record<string, string> = {
        'pending': 'Em Análise (Verificando Pagamento)',
        'PENDING': 'Em Análise (Verificando Pagamento)',
        'pending_payment': 'Aguardando Pagamento',
        'paid': 'Pago (Liberado)',
        'preparing': 'A INICIAR SEPARAÇÃO',
        'out_for_delivery': 'Saiu p/ Entrega',
        'delivered': 'Entregue',
        'cancelled': 'Reprovado / Cancelado'
    };
    return map[s] || s;
};

export const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('paid') || s.includes('pago')) return 'bg-green-100 text-green-800 border-green-200';
    if (s.includes('pending') || s.includes('pendente') || s.includes('aguardando') || s.includes('análise')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (s.includes('delivered') || s.includes('entregue')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (s.includes('preparing') || s.includes('separa')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (s.includes('cancel')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
};

export const getLocalDateStr = (dateInput?: string | Date | null) => {
    let d: Date;
    if (!dateInput) {
        d = new Date();
    } else {
        d = new Date(dateInput);
        if (isNaN(d.getTime())) {
            d = new Date();
        }
    }
    const offset = d.getTimezoneOffset() * 60000;
    return (new Date(d.getTime() - offset)).toISOString().slice(0, 10);
};

/** Estoque "baixo/crítico" — fonte ÚNICA de verdade.
 *  Um produto é crítico quando: sem estoque definido (registro incompleto)
 *  OU stock <= minStock (minStock default 5). Antes havia 3 definições
 *  diferentes (Home <=5 fixo, Products stats <=5 fixo, StockAlerts minStock)
 *  e as telas divergiam entre si. Use SEMPRE esta função. */
export const estoqueCritico = (stock: number | null | undefined, minStock?: number | null): boolean => {
    if (stock === null || stock === undefined) return true;
    return stock <= (minStock || 5);
};

/** Fonte ÚNICA de verdade para "este pedido conta como receita?".
 *  Antes havia 4 definições diferentes (cards do painel, financeiro, home e
 *  extratos) — os totais das telas não batiam entre si. */
export const ehReceita = (status: string | undefined | null): boolean => {
    const s = String(status || '').toLowerCase();
    if (!s) return false;
    // Reprovados/estornados/pendentes NUNCA são receita.
    if (s.includes('cancel') || s.includes('rejeitad') || s.includes('rejected')) return false;
    if (s.includes('refund') || s.includes('estornad') || s.includes('devolvid') || s.includes('reembols')) return false;
    if (s === 'pending' || s === 'pendente' || s === 'pending_payment' || s.includes('aguardando')) return false;
    // Pipeline aprovado: pago → preparação → saiu → entregue.
    return ['paid', 'pago', 'preparing', 'separacao', 'separação', 'out_for_delivery', 'saiu', 'delivered', 'entregue'].some(k => s === k || s.includes(k));
};
