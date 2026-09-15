import React from 'react';
import { PauseCircle } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { formatarMoeda } from '../../utils';

export interface SuspendedCart {
  id: string;
  items: any[];
  clienteId: string;
  clienteNome: string;
  total: number;
  createdAt: string;
}

interface SuspendedCartsModalProps {
  isOpen: boolean;
  carts: SuspendedCart[];
  onClose: () => void;
  onRetomar: (id: string) => void;
  onDescartar: (id: string) => void;
}

/**
 * Lista de carrinhos suspensos do PDV (retomar ou descartar), padronizada
 * com o ModalShell (tom âmbar de aviso).
 */
export const SuspendedCartsModal: React.FC<SuspendedCartsModalProps> = ({
  isOpen, carts, onClose, onRetomar, onDescartar,
}) => (
  <ModalShell
    open={isOpen}
    onClose={onClose}
    title="Vendas Suspensas"
    subtitle="Retome ou descarte carrinhos salvos"
    icon={<PauseCircle size={20} />}
    tone="warning"
    size="lg"
    footer={
      <div className="w-full flex justify-end">
        <button
          onClick={onClose}
          className="px-8 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
        >
          Fechar
        </button>
      </div>
    }
  >
    <div className="p-5">
      {carts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <PauseCircle size={28} className="text-slate-400" />
          </div>
          <p className="font-black text-slate-500 uppercase tracking-widest text-xs">Nenhuma venda suspensa</p>
        </div>
      )}
      {carts.map(sc => (
        <div key={sc.id} className="mb-3 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-slate-900 text-xs uppercase truncate">{sc.clienteNome}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                  {sc.items.reduce((s: number, i: any) => s + (i.quantity || 0), 0)} itens · {new Date(sc.createdAt).toLocaleString('pt-BR')}
                </p>
              </div>
              <span className="font-black text-emerald-600 text-sm shrink-0">R$ {formatarMoeda(sc.total)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sc.items.slice(0, 6).map((item: any, idx: number) => (
                <span key={idx} className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                  {item.name} ×{item.quantity}
                </span>
              ))}
              {sc.items.length > 6 && (
                <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">+{sc.items.length - 6} itens</span>
              )}
            </div>
          </div>
          <div className="flex border-t border-slate-100">
            <button
              onClick={() => onDescartar(sc.id)}
              className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
            >
              Descartar
            </button>
            <button
              onClick={() => onRetomar(sc.id)}
              className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 transition-all border-l border-slate-100"
            >
              Retomar Venda
            </button>
          </div>
        </div>
      ))}
    </div>
  </ModalShell>
);

export default SuspendedCartsModal;