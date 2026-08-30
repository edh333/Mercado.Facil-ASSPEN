import React from 'react';
import { UserRound, ShoppingBag } from 'lucide-react';
import { Order } from '../../types';
import { formatarMoeda } from '../../utils';
import { toDate } from '../../utils/dateUtils';
import { ModalShell } from '../ui/ModalShell';

interface AdminOrderHistoryModalProps {
  open: boolean;
  cpf: string;
  name: string;
  orders: Order[];
  onClose: () => void;
}

const norm = (s?: string) => String(s || '').toLowerCase();

const translate = (s?: string): string => {
  const st = norm(s);
  if (['pending', 'pendente', 'aguardando'].includes(st)) return 'Aguardando Pagamento';
  if (['paid', 'pago', 'aprovado'].includes(st)) return 'Pagamento Aprovado';
  if (['preparing', 'separacao'].includes(st)) return 'Em Separação';
  if (['delivered', 'entregue'].includes(st)) return 'Entregue';
  if (['cancelled', 'cancelado'].includes(st)) return 'Cancelado';
  if (['refunded', 'devolvido', 'reembolsado', 'estornado'].includes(st)) return 'Estornado';
  return 'Desconhecido';
};

const color = (s?: string): string => {
  const st = norm(s);
  if (['pending', 'pendente', 'aguardando'].includes(st)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (['paid', 'pago', 'aprovado'].includes(st)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['preparing', 'separacao'].includes(st)) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (['delivered', 'entregue'].includes(st)) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (['cancelled', 'cancelado'].includes(st)) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (['refunded', 'devolvido', 'reembolsado', 'estornado'].includes(st)) return 'bg-purple-50 text-purple-700 border-purple-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

const payment = (o: Order): string => {
  const m = norm(o.paymentMethod);
  if (m.includes('cash')) return 'Dinheiro';
  if (m.includes('pix')) return 'PIX';
  if (m.includes('wallet') || m.includes('credito') || m.includes('saldo')) return 'Saldo Interno';
  if (m.includes('boleto')) return 'Boleto';
  return m || '—';
};

export const AdminOrderHistoryModal: React.FC<AdminOrderHistoryModalProps> = ({ open, cpf, name, orders, onClose }) => {
  const cleanCpf = String(cpf || '').replace(/\D/g, '');
  const history = (orders || [])
    .filter(o => String(o.userCpf || '').replace(/\D/g, '') === cleanCpf || String(o.inmateCpf || '').replace(/\D/g, '') === cleanCpf)
    .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));

  const totalGasto = history
    .filter(o => ['paid', 'pago', 'preparing', 'separacao', 'delivered', 'entregue'].includes(norm(o.status)))
    .reduce((acc, o) => acc + (Number(o.total) || 0), 0);

  return (
    <ModalShell
      open={open}
      title="Histórico de Compras"
      subtitle={name ? `${name} • ${cpf}` : cpf}
      icon={<UserRound size={18} />}
      onClose={onClose}
      size="md"
    >
      <div className="px-5 py-4">
        <div className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 mb-4">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Total de compras</span>
          <span className="text-lg font-black text-emerald-600">{formatarMoeda(totalGasto)}</span>
        </div>

        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
              <ShoppingBag size={28} className="text-slate-400" />
            </div>
            <p className="text-sm font-black text-slate-700 uppercase tracking-wide mb-1">Nenhum pedido encontrado</p>
            <p className="text-xs text-slate-400 font-bold">Nenhum pedido registrado para este CPF.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-[55vh] overflow-y-auto pr-1">
            {history.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-slate-300 transition-colors">
                <div className="min-w-0">
                  <p className="font-black text-[11px] text-slate-900 truncate">
                    Pedido #{String(o.id).slice(0, 8).toUpperCase()}
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    {o.date ? toDate(o.date)?.toLocaleString('pt-BR') || '' : '—'} • {payment(o)}
                  </p>
                  {o.items && (
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate">
                      {o.items.map((i: any) => i.productName || i.name).filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-sm font-black text-slate-900">{formatarMoeda(Number(o.total) || 0)}</span>
                  <span className={`text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full border ${color(o.status)}`}>
                    {translate(o.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end">
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-700 active:scale-95 transition-all"
        >
          Fechar
        </button>
      </div>
    </ModalShell>
  );
};
