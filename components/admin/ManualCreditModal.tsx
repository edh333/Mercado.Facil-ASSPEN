import React, { useEffect, useState } from 'react';
import { PlusCircle, Check, Wallet, ShieldCheck, AlertTriangle } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { User } from '../../types';
import { formatarMoeda } from '../../utils';

interface ManualCreditModalProps {
  user: User | null;
  onClose: () => void;
  onConfirm: (userId: string, valor: number, motivo: string) => Promise<void>;
}

export const ManualCreditModal: React.FC<ManualCreditModalProps> = ({ user, onClose, onConfirm }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setAmount('');
      setReason('');
      setError('');
      setLoading(false);
    }
  }, [user?.id]);

  if (!user) return null;

  const valor = Number(amount.replace(',', '.'));
  const isValido = isFinite(valor) && valor > 0;

  const handleConfirm = async () => {
    if (!isValido || loading) return;
    setLoading(true);
    setError('');
    try {
      await onConfirm(user.id, valor, reason.trim() || 'Crédito inserido manualmente');
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Erro ao processar o crédito.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={loading ? () => {} : onClose}
      title="Aporte Manual de Crédito"
      subtitle="Somente o administrador principal"
      icon={<PlusCircle size={22}/>}
      size="sm"
    >
      <div className="p-8 space-y-6">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 rounded-2xl shadow-lg shadow-emerald-500/20 text-white">
          <p className="text-[9px] font-black text-emerald-100 uppercase mb-1 opacity-80">Beneficiário</p>
          <p className="font-black text-base uppercase tracking-tight truncate">{user.name}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {user.cpf && <span className="text-[10px] font-bold text-emerald-100 font-mono">CPF: {user.cpf}</span>}
            <span className="px-2.5 py-0.5 bg-white/15 rounded-full text-[9px] font-black uppercase tracking-widest">{user.role === 'ADMIN' ? 'Admin' : 'Familiar'}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200">
            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Saldo Atual</p>
            <p className="font-black text-slate-900 text-lg tracking-tight">R$ {formatarMoeda(user.walletBalance || 0)}</p>
          </div>
          <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200">
            <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Status</p>
            <p className={`font-black text-sm uppercase tracking-tight ${user.status === 'active' ? 'text-emerald-600' : user.status === 'pending' ? 'text-amber-600' : 'text-red-500'}`}>{user.status || '—'}</p>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest mb-3 block">Valor do Crédito (R$)</label>
            <div className="relative group">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-2xl">R$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-full pl-16 pr-5 py-5 bg-slate-100 border-2 border-slate-200 group-focus-within:border-emerald-500 group-focus-within:ring-4 group-focus-within:ring-emerald-500/20 rounded-2xl font-black text-3xl text-slate-900 outline-none transition-all placeholder:text-slate-400"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
              />
            </div>
            {isValido && (
              <p className="mt-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                <Wallet size={12}/> Novo saldo: R$ {formatarMoeda((user.walletBalance || 0) + valor)}
              </p>
            )}
          </div>
          <div>
            <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest mb-3 block">Motivo / Observação</label>
            <textarea
              className="w-full p-5 bg-slate-100 border-2 border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 rounded-2xl font-black text-slate-900 text-sm outline-none h-24 resize-none placeholder:text-slate-400 uppercase"
              placeholder="Descreva o motivo do aporte..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            ></textarea>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 animate-fadeIn">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5"/>
            <p className="text-[11px] font-black text-red-600 uppercase tracking-wide leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-1">
          <button
            onClick={handleConfirm}
            disabled={!isValido || loading}
            className="w-full py-5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 uppercase text-[11px] tracking-widest transition-all active:scale-[0.98] touch-target disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
            ) : (
              <Check size={20}/>
            )}
            {loading ? 'Processando...' : `Confirmar Crédito de R$ ${formatarMoeda(valor)}`}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all touch-target active:scale-[0.98] disabled:opacity-40"
          >
            Cancelar
          </button>
          <p className="flex items-center justify-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest pt-1">
            <ShieldCheck size={12}/> Operação registrada com auditoria
          </p>
        </div>
      </div>
    </ModalShell>
  );
};
