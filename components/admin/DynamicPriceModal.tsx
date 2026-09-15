import React from 'react';
import { Plus, Tag } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { Product } from '../../types';

interface DynamicPriceModalProps {
  produto: Product | null;
  preco: string;
  corPrincipal?: string;
  onPrecoChange: (preco: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Preço dinâmico para produtos de valor livre, padronizado com o ModalShell.
 */
export const DynamicPriceModal: React.FC<DynamicPriceModalProps> = ({
  produto, preco, corPrincipal = '#10b981', onPrecoChange, onConfirm, onCancel,
}) => (
  <ModalShell
    open={!!produto}
    onClose={onCancel}
    title="Preço Dinâmico"
    subtitle="Produto sem valor fixo"
    icon={<Tag size={18} />}
    tone="primary"
    size="sm"
    footer={
      <div className="flex gap-3 w-full">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3.5 rounded-2xl bg-white border-2 border-slate-200 hover:bg-slate-100 font-black text-[10px] uppercase tracking-[0.2em] text-slate-600 transition-all active:scale-95"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 py-3.5 rounded-2xl text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 shadow-md"
          style={{ backgroundColor: corPrincipal }}
        >
          <Plus size={14} className="inline-block mr-1" /> Adicionar ao Carrinho
        </button>
      </div>
    }
  >
    <div className="p-6 space-y-4">
      <p className="font-black text-xs uppercase tracking-widest text-slate-700 truncate">{produto?.name || 'Produto'}</p>
      <div className="relative">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-lg text-emerald-600">R$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          autoFocus
          placeholder="0,00"
          className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 pl-14 pr-4 py-4 rounded-2xl font-black text-2xl tnum outline-none transition-colors"
          value={preco}
          onChange={e => onPrecoChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(); }}
        />
      </div>
    </div>
  </ModalShell>
);

export default DynamicPriceModal;