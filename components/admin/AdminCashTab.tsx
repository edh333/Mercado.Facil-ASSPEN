import React, { useState, useEffect, useCallback } from 'react';
import {
  openCashSession,
  addSupplement,
  addWithdrawal,
  closeCashSession,
  getActiveSession,
  getRecentSessions,
  CashSession,
  CashMovement,
} from '../../utils/cashSession';
import { Timestamp } from 'firebase/firestore';
import {
  LogIn, LogOut, Plus, Minus, Lock, Unlock, RefreshCw,
  Clock, DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, ChevronDown, ChevronUp, Printer
} from 'lucide-react';
import { gerarCupomFechamento, imprimirCupom } from '../../utils/printUtils';

// ----------------------------------------------
// Helpers
// ----------------------------------------------

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtTs = (ts: Timestamp | null) => {
  if (!ts) return '—';
  return ts.toDate().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

// ----------------------------------------------
// Sub-components
// ----------------------------------------------

const Stat: React.FC<{ label: string; value: string; color?: string; icon?: React.ReactNode }> = ({
  label, value, color = 'text-slate-900', icon
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow">
    {icon && <div className="shrink-0">{icon}</div>}
    <div>
      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  </div>
);

const MovementRow: React.FC<{ m: CashMovement; type: 'in' | 'out' }> = ({ m, type }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
    <div className="flex items-center gap-2">
      {type === 'in'
        ? <TrendingUp size={14} className="text-[var(--primary-color)] shrink-0" />
        : <TrendingDown size={14} className="text-red-500 shrink-0" />
      }
      <div>
        <p className="text-sm font-medium text-slate-800">{m.reason}</p>
        <p className="text-[10px] text-slate-400">{fmtTs(m.timestamp)}</p>
      </div>
    </div>
    <span className={`font-bold text-sm ${type === 'in' ? 'text-[var(--primary-color)]' : 'text-red-600'}`}>
      {type === 'in' ? '+' : '-'}{fmt(m.amount)}
    </span>
  </div>
);

// ----------------------------------------------
// Main Component
// ----------------------------------------------

interface AdminCashTabProps {
  operatorId: string;
  operatorName: string;
  primaryColor?: string;
  settings?: any;
}

type Modal = 'open' | 'supplement' | 'withdrawal' | 'close' | null;

export const AdminCashTab: React.FC<AdminCashTabProps> = ({
  operatorId,
  operatorName,
  primaryColor = '#10b981',
  settings,
}) => {
  const [session, setSession] = useState<CashSession | null>(null);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [closedBalance, setClosedBalance] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [expandHistory, setExpandHistory] = useState(false);
  const [closeResult, setCloseResult] = useState<{ diff: number; expected: number } | null>(null);
  const [closeSessionSnapshot, setCloseSessionSnapshot] = useState<any>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [active, recent] = await Promise.all([
        getActiveSession(operatorId),
        getRecentSessions(15)
      ]);
      setSession(active);
      setHistory(recent);
    } catch (e) {
      showToast('Erro ao carregar sessão de caixa.', 'error');
    } finally {
      setLoading(false);
    }
  }, [operatorId]);

  useEffect(() => { reload(); }, [reload]);

  // -- Actions --

  const handleOpen = async () => {
    // Aceita 0 (gaveta vazia), mas rejeita vazio/NaN/negativo — o min="0"
    // do HTML não impede digitação de "-50".
    const valor = Number(initialBalance);
    if (initialBalance === '' || isNaN(valor) || !(valor >= 0)) {
      showToast('Informe um saldo inicial zero ou positivo.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      await openCashSession(operatorId, operatorName, Number(initialBalance));
      showToast('Caixa aberto com sucesso!', 'success');
      setModal(null);
      setInitialBalance('');
      reload();
    } catch (e: any) {
      showToast(e.message || 'Erro ao abrir caixa.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSupplement = async () => {
    if (!session || !amount || !reason) return;
    setActionLoading(true);
    try {
      await addSupplement(session.id, Number(amount), reason);
      showToast('Suprimento registrado!', 'success');
      setModal(null);
      setAmount(''); setReason('');
      reload();
    } catch (e: any) {
      showToast(e.message || 'Erro ao registrar suprimento.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!session || !amount || !reason) return;
    setActionLoading(true);
    try {
      await addWithdrawal(session.id, Number(amount), reason);
      showToast('Sangria registrada!', 'success');
      setModal(null);
      setAmount(''); setReason('');
      reload();
    } catch (e: any) {
      showToast(e.message || 'Erro ao registrar sangria.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    if (!session || !closedBalance) return;
    // Espelha a guarda do servidor: contagem física negativa/NaN não existe.
    const contado = Number(closedBalance);
    if (isNaN(contado) || !(contado >= 0)) {
      showToast('Valor contado deve ser zero ou positivo.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const result = await closeCashSession(session.id, Number(closedBalance));
      setCloseResult(result);
      setCloseSessionSnapshot({
        operatorId,
        operatorName,
        openedAt: session.openedAt,
        closedAt: Timestamp.now(),
        initialBalance: session.initialBalance,
        expectedBalance: result.expected,
        closedBalance: Number(closedBalance),
        cashDifference: result.diff,
      });
      showToast('Caixa fechado!', 'success');
      setClosedBalance('');
      reload();
    } catch (e: any) {
      showToast(e.message || 'Erro ao fechar caixa.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Print receipt using gerarCupomFechamento
  const handlePrint = (dados?: any) => {
    const data = dados || session || closeSessionSnapshot;
    if (!data) return;
    const content = gerarCupomFechamento(data, settings);
    imprimirCupom(content);
  };

  // -- Render --

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="animate-spin text-slate-400" size={32} />
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-lg text-white text-sm font-semibold transition-all ${toast.type === 'success' ? 'bg-[var(--primary-color)]' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Controle de Caixa</h2>
          <p className="text-slate-500 text-sm mt-1">Abertura, Suprimento, Sangria e Fechamento</p>
        </div>
        <button onClick={reload} className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 transition-all">
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Close Audit Result Banner */}
      {closeResult && (
        <div className={`mb-5 p-4 rounded-2xl border flex items-start gap-3 ${closeResult.diff === 0 ? 'bg-[var(--primary-color)]/50 border-[var(--primary-color)]/20' : closeResult.diff < 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          {closeResult.diff === 0
            ? <CheckCircle className="text-[var(--primary-color)] mt-0.5 shrink-0" size={20} />
            : <AlertTriangle className={`${closeResult.diff < 0 ? 'text-red-500' : 'text-amber-500'} mt-0.5 shrink-0`} size={20} />
          }
          <div className="flex-1">
            <p className="font-bold text-slate-800">Auditoria de Fechamento</p>
            <p className="text-sm text-slate-600">Esperado: <strong>{fmt(closeResult.expected)}</strong> · Contado: <strong>{fmt(closeResult.expected + closeResult.diff)}</strong></p>
            <p className={`text-sm font-bold mt-1 ${closeResult.diff === 0 ? 'text-[var(--primary-color)]' : closeResult.diff < 0 ? 'text-red-600' : 'text-amber-600'}`}>
              {closeResult.diff === 0 ? 'Caixa conferido e correto!' : closeResult.diff > 0 ? `Sobra de ${fmt(closeResult.diff)}` : `Falta de ${fmt(Math.abs(closeResult.diff))}`}
            </p>
          </div>
          <button onClick={() => handlePrint(closeSessionSnapshot)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shrink-0">
            <Printer size={16} /> Imprimir Fechamento
          </button>
        </div>
      )}

      {session ? (
        /* -------------- OPEN SESSION VIEW -------------- */
        <>
          {/* Status Badge */}
          <div className="flex items-center gap-2 mb-5">
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--primary-color)]/100 text-emerald-700 rounded-full text-xs font-bold">
              <span className="w-2 h-2 bg-[var(--primary-color)] rounded-full animate-pulse" />
              CAIXA ABERTO
            </span>
            <span className="text-slate-400 text-xs">desde {fmtTs(session.openedAt)}</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <Stat label="Valor Inicial" value={fmt(session.initialBalance)} icon={<DollarSign size={20} className="text-slate-400" />} />
            <Stat label="Suprimentos" value={`+${fmt((session.supplements || []).reduce((a, s) => a + s.amount, 0))}`} color="text-[var(--primary-color)]" icon={<TrendingUp size={20} className="text-emerald-400" />} />
            <Stat label="Sangrias" value={`-${fmt((session.withdrawals || []).reduce((a, w) => a + w.amount, 0))}`} color="text-red-600" icon={<TrendingDown size={20} className="text-red-400" />} />
          </div>

          <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 mb-6 text-white flex items-center justify-between shadow-xl">
            <div>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Saldo Atual na Gaveta</p>
              <p className="text-3xl font-black mt-1">{fmt(session.currentBalance)}</p>
            </div>
            <Lock size={36} className="text-slate-600" />
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <button onClick={() => setModal('supplement')}
              className="flex flex-col items-center gap-1.5 p-4 bg-[var(--primary-color)]/50 hover:bg-[var(--primary-color)]/100 border border-[var(--primary-color)]/20 rounded-2xl text-emerald-700 font-semibold text-sm transition-all active:scale-95">
              <Plus size={22} />
              Suprimento
            </button>
            <button onClick={() => setModal('withdrawal')}
              className="flex flex-col items-center gap-1.5 p-4 bg-red-50 hover:bg-red-100 border border-red-200 rounded-2xl text-red-700 font-semibold text-sm transition-all active:scale-95">
              <Minus size={22} />
              Sangria
            </button>
            <button onClick={() => setModal('close')}
              className="flex flex-col items-center gap-1.5 p-4 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-2xl text-slate-700 font-semibold text-sm transition-all active:scale-95 col-span-2 sm:col-span-1">
              <LogOut size={22} />
              Fechar Caixa
            </button>
          </div>

          {/* Movements */}
          {((session.supplements || []).length > 0 || (session.withdrawals || []).length > 0) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
              <p className="text-sm font-bold text-slate-700 mb-3">Movimentações</p>
              {(session.supplements || []).map((m, i) => <MovementRow key={`s${i}`} m={m} type="in" />)}
              {(session.withdrawals || []).map((m, i) => <MovementRow key={`w${i}`} m={m} type="out" />)}
            </div>
          )}
        </>
      ) : (
        /* -------------- NO SESSION VIEW -------------- */
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <Unlock size={36} className="text-slate-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Caixa Fechado</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-xs">Abra o caixa para começar a registrar as movimentações do dia.</p>
          <button
            onClick={() => setModal('open')}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold shadow-lg hover:brightness-110 transition-all active:scale-95"
            style={{ backgroundColor: primaryColor }}
          >
            <LogIn size={20} /> Abrir Caixa
          </button>
        </div>
      )}

      {/* -- History -- */}
      {history.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setExpandHistory(h => !h)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Clock size={16} />
            Histórico de Sessões ({history.length})
            {expandHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {expandHistory && (
            <div className="mt-3 space-y-2">
              {history.map(s => (
                <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">{fmtTs(s.openedAt)} ? {fmtTs(s.closedAt)}</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">Inicial: {fmt(s.initialBalance)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.status === 'open' ? 'bg-[var(--primary-color)]/100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.status === 'open' ? 'Aberto' : 'Fechado'}
                    </span>
                    {s.status === 'closed' && (s.cashDifference ?? s.balanceDiff) !== undefined && (
                      <p className={`text-xs font-bold mt-1 ${(s.cashDifference ?? s.balanceDiff) === 0 ? 'text-[var(--primary-color)]' : (s.cashDifference ?? s.balanceDiff) < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        Diff: {(s.cashDifference ?? s.balanceDiff) >= 0 ? '+' : ''}{fmt(s.cashDifference ?? s.balanceDiff!)}
                      </p>
                    )}
                  </div>
                  {s.status === 'closed' && (
                    <button onClick={() => handlePrint(s)} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                      <Printer size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------------- MODALS -------------- */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4 sm:pb-0" onClick={() => setModal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>

            {modal === 'open' && (
              <>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Abrir Caixa</h3>
                <p className="text-sm text-slate-500 mb-4">Informe o valor inicial (fundo de troco) na gaveta.</p>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor Inicial (R$)</label>
                <input type="number" min="0" step="0.01" value={initialBalance}
                  onChange={e => setInitialBalance(e.target.value)}
                  placeholder="Ex: 100.00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 mb-4" />
              </>
            )}

            {(modal === 'supplement' || modal === 'withdrawal') && (
              <>
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  {modal === 'supplement' ? <><Plus size={16} className="text-[var(--primary-color)]" /> Suprimento</> : <><Minus size={16} className="text-red-500" /> Sangria de Segurança</>}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  {modal === 'supplement' ? 'Entrada de dinheiro no caixa.' : 'Retirada de dinheiro do caixa.'}
                </p>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor (R$)</label>
                <input type="number" min="0.01" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 mb-3" />
                <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo</label>
                <input type="text" value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Ex: Troco inicial, Retirada p/ cofre..."
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 mb-4" />
              </>
            )}

            {modal === 'close' && (
              <>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Fechar Caixa</h3>
                <p className="text-sm text-slate-500 mb-1">Valor esperado no caixa:</p>
                <p className="text-2xl font-black text-slate-800 mb-4">{session ? fmt(session.currentBalance) : '—'}</p>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Valor Contado Fisicamente (R$)</label>
                <input type="number" min="0" step="0.01" value={closedBalance}
                  onChange={e => setClosedBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-400 mb-4" />
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setModal(null); setAmount(''); setReason(''); }}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button
                onClick={
                  modal === 'open' ? handleOpen
                    : modal === 'supplement' ? handleSupplement
                    : modal === 'withdrawal' ? handleWithdrawal
                    : handleClose
                }
                disabled={actionLoading}
                className="flex-1 py-3 rounded-2xl text-white font-bold text-sm shadow-md hover:brightness-110 transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: modal === 'close' ? '#ef4444' : modal === 'withdrawal' ? '#ef4444' : primaryColor }}
              >
                {actionLoading ? '...' : modal === 'open' ? 'Abrir Caixa' : modal === 'supplement' ? 'Registrar' : modal === 'withdrawal' ? 'Registrar Sangria' : 'Confirmar Fechamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

