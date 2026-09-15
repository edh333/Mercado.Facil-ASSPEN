import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lock, Eye, EyeOff, Loader2, ShieldCheck, CheckCircle } from 'lucide-react';
import { Order } from '../../types';
import { formatarMoeda, formatCPF } from '../../utils';

/**
 * CORPO REUTILIZÁVEL da confirmação financeira irreversível (estorno/cancelamento),
 * com estado de formulário e botões de ação próprios:
 *  1) Alerta da ação
 *  2) Resumo do pedido
 *  3) Motivo OBRIGATÓRIO (vai para notificação do familiar e auditoria)
 *  4) Senha do admin (mestra) — segunda camada, quando exigida
 *  5) Botões Cancelar / Confirmar (tonalidade por ação)
 * O painel NÃO executa nada: apenas coleta (motivo, senha) e devolve ao host.
 * Usado pelo AdminRefundPasswordModal (aba Ordens) e RefundSaleModal (PDV).
 */
interface RefundPasswordPanelProps {
  acao: 'estorno' | 'cancelar';
  order: Order | null;
  exigirSenha: boolean;
  processando: boolean;
  erro: string;
  onCancel: () => void;
  onConfirm: (motivo: string, senha: string) => void;
}

const DESCRICAO: Record<'estorno' | 'cancelar', string> = {
  estorno: 'O valor do pedido será devolvido para a carteira do familiar, o estoque será restituído e a venda sairá do faturamento do caixa.',
  cancelar: 'O pedido será cancelado, o estoque será restituído e o valor devolvido. O familiar receberá uma notificação com o motivo.',
};

export const RefundPasswordPanel: React.FC<RefundPasswordPanelProps> = ({
  acao, order, exigirSenha, processando, erro, onCancel, onConfirm
}) => {
  const [motivo, setMotivo] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  useEffect(() => {
    setMotivo(acao === 'cancelar' ? 'Cancelado pelo administrador' : 'Devolução administrativa');
    setSenha('');
    setMostrarSenha(false);
  }, [acao, order?.id]);

  const valido = motivo.trim().length > 0 && (!exigirSenha || senha.trim().length > 0);

  const handleConfirmar = () => {
    if (processando || !valido) return;
    onConfirm(motivo.trim(), senha.trim());
  };

  return (
    <div className="p-6 space-y-5">
      {/* Alerta da ação */}
      <div className={`flex items-start gap-3 rounded-2xl border p-4 ${
        acao === 'cancelar'
          ? 'bg-rose-50 border-rose-200 text-rose-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}>
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-black uppercase tracking-wider">Atenção — ação financeira irreversível</p>
          <p className="text-[11px] font-bold leading-relaxed mt-1">{DESCRICAO[acao]}</p>
        </div>
      </div>

      {/* Resumo do pedido */}
      {order && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cliente</span>
            <span className="text-xs font-black text-slate-900 truncate">
              {order.userName || '—'} · {formatCPF(order.userCpf)}
            </span>
          </div>
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Interno</span>
            <span className="text-xs font-black text-slate-900 truncate">{order.inmateName || '—'}</span>
          </div>
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pagamento</span>
            <span className="text-xs font-black text-slate-900 uppercase">
              {order.paymentMethod === 'WALLET' ? 'Carteira' : order.paymentMethod === 'CASH' ? 'Dinheiro' : order.paymentMethod === 'FIADO' ? 'Fiado' : order.paymentMethod === 'CARD' ? 'Cartão' : order.paymentMethod === 'MIXED' ? 'Misto' : 'PIX'}
            </span>
          </div>
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Itens</span>
            <span className="text-xs font-black text-slate-900">{(order.items || []).length} produto(s)</span>
          </div>
          <div className="flex justify-between items-center gap-3 pt-2.5 border-t border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Valor Total</span>
            <span className="text-xl font-black text-[var(--text-main)] tracking-tighter">
              R$ {formatarMoeda(Number(order.total))}
            </span>
          </div>
        </div>
      )}

      {/* Motivo */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
          Motivo <span className="text-red-500">*</span>
        </label>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          disabled={processando}
          autoFocus
          maxLength={200}
          rows={3}
          placeholder="Descreva o motivo — será exibido ao familiar e gravado na auditoria"
          className="w-full bg-slate-50 border-2 border-slate-200 focus:border-[var(--border-color)] p-4 rounded-2xl text-sm font-bold text-slate-900 outline-none resize-none disabled:opacity-60"
        />
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 text-right">{motivo.length}/200</p>
      </div>

      {/* Senha do admin */}
      {exigirSenha && (
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
            <Lock size={12} /> Senha do administrador <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={mostrarSenha ? 'text' : 'password'}
              value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && valido && !processando) handleConfirmar(); }}
              disabled={processando}
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full bg-slate-50 border-2 border-slate-200 focus:border-[var(--border-color)] p-4 pr-12 rounded-2xl text-sm font-black text-slate-900 outline-none transition-colors disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha(v => !v)}
              disabled={processando}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-1.5 flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-500" /> Requer a senha mestra para liberar a operação
          </p>
        </div>
      )}

      {erro && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-rose-600 text-xs font-black uppercase tracking-wider">
          {erro}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={processando}
          className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-[0.2em] transition-all disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={!valido || processando}
          className={`flex-1 px-8 py-3 rounded-xl text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-40 disabled:pointer-events-none ${
            acao === 'cancelar'
              ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/25'
              : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25'
          }`}
        >
          {processando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
          {processando ? 'Processando…' : acao === 'cancelar' ? 'Confirmar Cancelamento' : 'Confirmar Estorno'}
        </button>
      </div>

      <p className="text-[10px] font-bold text-slate-400 flex items-center gap-2 bg-slate-50 rounded-xl p-3">
        <ShieldCheck size={14} className="text-slate-500 shrink-0" />
        Esta ação restaura estoque e devolve valores automaticamente, e fica registrada na auditoria de segurança.
      </p>
    </div>
  );
};

export default RefundPasswordPanel;