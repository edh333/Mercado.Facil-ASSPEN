import React, { useState, useMemo, useEffect } from 'react';
import {
  DollarSign, Landmark, ArrowDownCircle, Printer, Search, Filter, Plus, X, Check, ArrowRightCircle,
  Calendar, FileText, TrendingUp, TrendingDown, Receipt, Download, Upload, Wallet, AlertTriangle, Loader2
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { Expense, Order, Supplier } from '../../types';
import { ModalShell } from '../ui/ModalShell';
import { getRecentSessions, CashSession } from '../../utils/cashSession';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';
import { parseMoeda } from '../../utils';
import { ehReceita } from './adminUtils';

interface AdminFinanceTabProps {
  expenses: Expense[];
  orders: Order[];
  isMaster: boolean;
  suppliers: Supplier[];
  financeFilters: {
    start: string;
    end: string;
    term: string;
  };
  setFinanceFilters: (filters: any) => void;
  handleOpenReceipt: (item: any) => void;
  totalEntries: number;
  totalExits: number;
  settings: any;
  addExpense: (e: Expense) => Promise<void>;
  resetFinance: () => Promise<void>;
  resetCredits: () => Promise<void>;
  showNotification: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  loadMoreExpenses?: () => void;
}

export const AdminFinanceTab: React.FC<AdminFinanceTabProps> = ({
  expenses, orders, isMaster, suppliers, financeFilters, setFinanceFilters,
  handleOpenReceipt, totalEntries, totalExits, settings, addExpense, resetFinance, resetCredits, showNotification, loadMoreExpenses
}) => {
  const { colors } = useTheme();
  const [activeSubTab, setActiveSubTab] = useState<'ALL' | 'ENTRIES' | 'EXITS'>('ALL');
  const [confirmacao, setConfirmacao] = useState<null | 'FINANCEIRO' | 'CREDITOS'>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<any>(null);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);

  useEffect(() => {
    let ativo = true;
    getRecentSessions(60)
      .then((s) => { if (ativo) setCashSessions(s); })
      .catch(() => {});
    return () => { ativo = false; };
  }, [financeFilters.start, financeFilters.end]);

  const [expenseForm, setExpenseForm] = useState<any>({
    description: '',
    amount: '',
    recipientName: '',
    recipientCpf: '',
    category: 'Manutenção',
    type: 'OPERATIONAL',
    observation: '',
    debitAccount: 'CAIXA'
  });

  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingExpense) return; // trava anti-duplo-clique: nunca registra duas vezes
    setIsSubmittingExpense(true);
    try {
        const amountNum = parseMoeda(String(expenseForm.amount));
        if (isNaN(amountNum) || amountNum <= 0) {
            showNotification("Por favor, insira um valor válido.", "error");
            return;
        }

        const generatedDoc = `REC-${Date.now().toString().slice(-6)}`;

        const expenseData = {
            ...expenseForm,
            amount: amountNum,
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            status: 'PAID',
            paidBy: settings?.institutionName || 'ASSPEN',
            paidByDoc: settings?.cnpj || '',
            paymentMethod: expenseForm.debitAccount || 'CAIXA',
            recipientDoc: generatedDoc,
            auditDocNumber: generatedDoc
        } as Expense & { auditDocNumber: string };

        await addExpense(expenseData);
        setShowExpenseModal(false);
        setExpenseForm({ description: '', amount: '', recipientName: '', recipientCpf: '', category: 'Manutenção', type: 'OPERATIONAL', observation: '', debitAccount: 'CAIXA' });
        setPrintReceipt(expenseData);
        showNotification("Lançamento efetuado com sucesso!", "success");
    } catch (err: any) {
        showNotification(err?.message || "Erro ao processar lançamento.", "error");
    } finally {
        setIsSubmittingExpense(false);
    }
  };

  // Data de HOJE no fuso do Brasil, nunca no UTC (que virava "amanhã" após 21h).
  const hojeStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const getLocalDateString = (dateInput: string | Date | undefined | null) => {
    if (!dateInput) return hojeStr();
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return hojeStr();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Pedidos pendentes/cancelados/estornados/rejeitados NÃO são entrada de caixa:
  // dinheiro ainda não entrou (ou foi devolvido, ou o pedido foi recusado).
  const statusValido = (s?: string) => {
    const st = String(s || '').toLowerCase();
    if (['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'reembolsado', 'pending', 'pending_payment', 'pendente', 'rejected', 'rejeitado'].includes(st)) return false;
    // Unifica com cards do painel: 'saiu p/ entrega' também é receita.
    return ['paid', 'pago', 'preparing', 'separacao', 'separação', 'out_for_delivery', 'saiu', 'delivered', 'entregue'].some(k => st === k || st.includes(k));
  };

  const filteredData = useMemo(() => {
    const startStr = financeFilters?.start || hojeStr();
    const endStr = financeFilters?.end || hojeStr();

    const filteredExpenses = (expenses || []).filter(e => {
        const dateStr = getLocalDateString(e.date);
        const matchDate = dateStr >= startStr && dateStr <= endStr;
        const termo = (financeFilters.term || '').toLowerCase();
        const matchTerm = !financeFilters.term ||
            (e.description || '').toLowerCase().includes(termo) ||
            (e.recipientName || '').toLowerCase().includes(termo);
        return matchDate && matchTerm;
    }).map(e => ({ ...e, type: 'EXIT', amount: -Math.abs(e.amount), name: e.description, person: e.recipientName }));

    const filteredOrders = (orders || []).filter(o => {        const dateStr = getLocalDateString(o.date);
        const matchDate = dateStr >= startStr && dateStr <= endStr;
        const termo = (financeFilters.term || '').toLowerCase();
        const matchTerm = !financeFilters.term ||
            (o.userName || '').toLowerCase().includes(termo) ||
            (o.inmateName || '').toLowerCase().includes(termo);
        return matchDate && matchTerm && statusValido(o.status);
    }).map(o => ({ ...o, type: 'ENTRY', amount: o.total || 0, name: `Venda #${(o.id || '').slice(0,6).toUpperCase()}`, person: o.userName || '' }));

    let combined = [];
    if (activeSubTab === 'ALL') combined = [...filteredExpenses, ...filteredOrders];
    else if (activeSubTab === 'ENTRIES') combined = filteredOrders;
    else combined = filteredExpenses;

    return combined.sort((a,b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [expenses, orders, activeSubTab, financeFilters]);

  const cashInPeriod = useMemo(() => {
    const startStr = financeFilters?.start || hojeStr();
    const endStr = financeFilters?.end || hojeStr();
    return (cashSessions || []).filter((s) => {
      const d = s.openedAt?.toDate ? s.openedAt.toDate() : new Date(s.openedAt as any);
      if (isNaN(d.getTime())) return false;
      const dateStr = getLocalDateString(d);
      return dateStr >= startStr && dateStr <= endStr;
    });
  }, [cashSessions, financeFilters]);

  const cashTotais = useMemo(() => ({    // Sessão aberta: saldo vivo (currentBalance). Fechada: contagem física (closedBalance).
    saldoFisico: cashInPeriod.reduce((s, x) => {
      if (String(x.status || '').toLowerCase() === 'open') return s + Number(x.currentBalance ?? 0);
      return s + Number(x.closedBalance ?? 0);
    }, 0),
    abertas: cashInPeriod.filter((x) => x.status === 'open').length,
    discrepanciaCount: cashInPeriod.filter((x) => x.hasDiscrepancy).length,
    totalDiscrepancias: cashInPeriod.filter((x) => x.hasDiscrepancy)
      .reduce((s, x) => s + Math.abs(Number(x.cashDifference ?? x.balanceDiff ?? 0)), 0),
  }), [cashInPeriod]);

  // Gráfico 7 dias — useMemo HOISTADO para o topo do componente.
  // Era React.useMemo dentro do JSX condicional {isMaster && ...}: se isMaster
  // mudasse após o mount, a ordem dos hooks mudava → crash do React.
  const ultimos7Dias = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000);
      const dateStr = getLocalDateString(date.toISOString());
      const dayExpenses = expenses.filter(e => getLocalDateString(e.date) === dateStr).reduce((sum, e) => sum + (e.amount || 0), 0);
      const dayOrders = orders.filter(o => statusValido(o.status) && getLocalDateString(o.date) === dateStr).reduce((sum, o) => sum + (o.total || 0), 0);
      const maxVal = Math.max(dayExpenses, dayOrders, 1);
      const dayName = date.toLocaleDateString('pt-BR', { weekday: 'short' });
      days.push({ dayName, dayExpenses, dayOrders, maxVal, dateStr });
    }
    return days;
  }, [expenses, orders, financeFilters]);

  const exportFinanceToCSV = () => {
    const headers = ['Data', 'Tipo', 'Descrição', 'Pessoa', 'Valor'];
    const rows = filteredData.map(item => [
      new Date(item.date || 0).toLocaleDateString('pt-BR'),
      item.type === 'ENTRY' ? 'Entrada' : 'Saída',
      item.name || item.description || '',
      item.person || item.recipientName || '',
      (item.amount || 0).toFixed(2).replace('.', ',')
    ]);

    const totalEntries = filteredData.filter(i => i.type === 'ENTRY').reduce((s, i) => s + (i.amount || 0), 0);
    const totalExits = filteredData.filter(i => i.type === 'EXIT').reduce((s, i) => s + Math.abs(i.amount || 0), 0);

    const summaryRows = [
      ['', '', 'TOTAL ENTRADAS', '', totalEntries.toFixed(2).replace('.', ',')],
      ['', '', 'TOTAL SAÍDAS', '', totalExits.toFixed(2).replace('.', ',')],
      ['', '', 'SALDO DO PERÍODO', '', (totalEntries - totalExits).toFixed(2).replace('.', ',')]
    ];

    const csvContent = [headers, ...rows, ...summaryRows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financeiro_${hojeStr()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-slideUp pb-20">
      {/* Upper Dashboard */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-600 rounded-full blur-[60px] -ml-16 -mt-16 opacity-10"></div>
        <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2 tracking-tight relative z-10">
            <DollarSign size={24} className="text-emerald-600"/> Painel Financeiro
        </h2>
        <div className="flex flex-wrap gap-3 w-full md:w-auto relative z-10">
            <button onClick={() => setShowExpenseModal(true)} className="flex-1 md:flex-none bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all">
                <Plus size={18}/> Novo Lançamento
            </button>
            <button onClick={exportFinanceToCSV} className="flex-1 md:flex-none bg-[var(--text-main)] text-[var(--bg-card)] px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all">
                <Download size={18}/> Exportar
            </button>
            {isMaster && (
              <>
                <button
                  onClick={() => setConfirmacao('FINANCEIRO')}
                  className="flex-1 md:flex-none bg-red-50 text-red-600 border border-red-200 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 hover:bg-red-100 active:scale-95 transition-all"
                  title="Apagar todos os lançamentos de despesas e caixa"
                >
                  <X size={18}/> Zerar Lançamentos
                </button>
                <button
                  onClick={() => setConfirmacao('CREDITOS')}
                  className="flex-1 md:flex-none bg-amber-50 text-amber-700 border border-amber-200 px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 hover:bg-amber-100 active:scale-95 transition-all"
                  title="Zerar o saldo da carteira de todos os familiares"
                >
                  <X size={18}/> Zerar Créditos
                </button>
              </>
            )}
            <div className="flex bg-[var(--bg-main)] rounded-xl p-1 border border-[var(--border-color)] flex-1 md:flex-none">
                <button onClick={() => setActiveSubTab('ALL')} className={`flex-1 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'ALL' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)]'}`}>Tudo</button>
                <button onClick={() => setActiveSubTab('ENTRIES')} className={`flex-1 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'ENTRIES' ? 'bg-emerald-600 text-white shadow-sm' : 'text-[var(--text-muted)]'}`}>Entradas</button>
                <button onClick={() => setActiveSubTab('EXITS')} className={`flex-1 px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'EXITS' ? 'bg-red-600 text-white shadow-sm' : 'text-[var(--text-muted)]'}`}>Saídas</button>
            </div>
        </div>
      </div>

{/* Stats Overview */}
        {isMaster && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-[var(--border-color)] shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600 opacity-5 rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform"></div>
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] mb-2">Saldo Consolidado</p>
              <h3 className="text-4xl font-black text-[var(--text-main)] tracking-tighter">
                <span className="text-sm opacity-30 mr-1">R$</span>
                {(totalEntries - totalExits).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
              <div className="mt-4 flex items-center gap-2">
                  <div className="p-1.5 bg-[var(--bg-main)] rounded-lg border border-[var(--border-color)] text-[var(--text-muted)]"><Landmark size={14}/></div>
                  <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest truncate">{settings?.institutionName}</span>
              </div>
            </div>

          <div className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-emerald-500/20 shadow-xl flex flex-col justify-between group">
            <div>
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-2 flex items-center gap-2">
                <TrendingUp size={14}/> Total Entradas
              </p>
              <h3 className="text-3xl font-black text-emerald-600 tracking-tighter">R$ {totalEntries.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="h-1.5 w-full bg-emerald-500/10 rounded-full mt-4 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min(100, (totalEntries/(totalEntries+totalExits || 1))*100)}%` }}/>
            </div>
          </div>

          <div className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-red-500/20 shadow-xl flex flex-col justify-between group">
            <div>
              <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] mb-2 flex items-center gap-2">
                <TrendingDown size={14}/> Total Saídas
              </p>
              <h3 className="text-3xl font-black text-red-600 tracking-tighter">R$ {totalExits.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            </div>
            <div className="h-1.5 w-full bg-red-500/10 rounded-full mt-4 overflow-hidden">
                <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${Math.min(100, (totalExits/(totalEntries+totalExits || 1))*100)}%` }}/>
            </div>
          </div>
        </div>
      )}

      {/* Simple Visual Chart - Daily Breakdown */}
      {isMaster && (
        <div className="bg-[var(--bg-card)] p-6 rounded-[2.5rem] border border-[var(--border-color)] shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={16}/> Resumo dos Últimos 7 Dias
            </h3>
          </div>
          <div className="flex items-end justify-between gap-2 h-32 px-2">
            {ultimos7Dias.map((d, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="w-full flex flex-col-reverse gap-1 h-24 items-end justify-end">
                  <div
                    className="w-full bg-emerald-400 rounded-t-lg transition-all group-hover:bg-emerald-500"
                    style={{ height: `${(d.dayOrders / (d.maxVal || 1)) * 100}%`, minHeight: d.dayOrders > 0 ? '4px' : '0' }}
                    title={`Entradas: R$ ${d.dayOrders.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  />
                  <div
                    className="w-full bg-red-400 rounded-t-lg transition-all group-hover:bg-red-500"
                    style={{ height: `${(d.dayExpenses / (d.maxVal || 1)) * 100}%`, minHeight: d.dayExpenses > 0 ? '4px' : '0' }}
                    title={`Saídas: R$ ${d.dayExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  />
                </div>
                <span className="text-[10px] font-black text-[var(--text-muted)] uppercase">{d.dayName}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-[var(--border-color)]">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
              <span className="text-[9px] font-black text-[var(--text-muted)] uppercase">Entradas</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-[9px] font-black text-[var(--text-muted)] uppercase">Saídas</span>
            </div>
          </div>
        </div>
      )}

      {/* Caixa Físico — Sessões do Período */}
      <div className="bg-[var(--bg-card)] p-6 rounded-[2.5rem] border border-[var(--border-color)] shadow-lg">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-xs font-black text-[var(--text-main)] uppercase tracking-widest flex items-center gap-2">
            <Wallet size={16}/> Caixa Físico — Sessões do Período
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">
              Saldo físico: <span className="text-emerald-600 text-xs">R$ {cashTotais.saldoFisico.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </span>
            {cashTotais.discrepanciaCount > 0 && (
              <span className="flex items-center gap-1.5 text-[9px] font-black text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-xl uppercase tracking-widest">
                <AlertTriangle size={12}/> {cashTotais.discrepanciaCount} quebra(s): R$ {cashTotais.totalDiscrepancias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            )}
            {cashTotais.abertas > 0 && (
              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl uppercase tracking-widest">
                {cashTotais.abertas} caixa(s) aberto(s)
              </span>
            )}
          </div>
        </div>
        {cashInPeriod.length === 0 ? (
          <p className="text-[10px] font-black uppercase text-[var(--text-muted)] opacity-40 text-center py-6">Nenhuma sessão de caixa no período.</p>
        ) : (
          <div className="hidden lg:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm table-as-cards">
              <thead className="text-left uppercase text-[10px] font-black tracking-widest text-[var(--text-muted)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="p-4">Operador</th>
                  <th className="p-4">Abertura</th>
                  <th className="p-4">Fechamento</th>
                  <th className="p-4 text-right">Esperado</th>
                  <th className="p-4 text-right">Contado</th>
                  <th className="p-4 text-right">Diferença</th>
                  <th className="p-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {cashInPeriod.map((s) => {
                  const diff = Number(s.cashDifference ?? s.balanceDiff ?? 0);
                  const aberta = s.status === 'open';
                  return (
                    <tr key={s.id} className="hover:bg-[var(--bg-main)]/50 transition-all">
                      <td className="p-4 font-bold uppercase text-sm text-[var(--text-main)]">{s.operatorName || s.operatorId || '—'}</td>
                      <td className="p-4 text-[11px] font-bold text-[var(--text-muted)]">{s.openedAt?.toDate ? s.openedAt.toDate().toLocaleString('pt-BR') : '—'}</td>
                      <td className="p-4 text-[11px] font-bold text-[var(--text-muted)]">{s.closedAt?.toDate ? s.closedAt.toDate().toLocaleString('pt-BR') : '—'}</td>
                      <td className="p-4 text-right font-black text-[var(--text-main)]">R$ {Number(s.expectedBalance ?? s.currentBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right font-black text-[var(--text-main)]">R$ {Number(s.closedBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className={`p-4 text-right font-black ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>
                        {diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${aberta ? 'bg-emerald-100 text-emerald-700' : s.autoClosed ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {aberta ? 'Aberto' : s.autoClosed ? 'Auto-fechado' : 'Fechado'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="lg:hidden divide-y divide-[var(--border-color)]">
          {cashInPeriod.map((s) => {
            const diff = Number(s.cashDifference ?? s.balanceDiff ?? 0);
            const aberta = s.status === 'open';
            return (
              <div key={s.id} className="py-4 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase text-sm text-[var(--text-main)]">{s.operatorName || s.operatorId || '—'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${aberta ? 'bg-emerald-100 text-emerald-700' : s.autoClosed ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                    {aberta ? 'Aberto' : s.autoClosed ? 'Auto-fechado' : 'Fechado'}
                  </span>
                </div>
                <div className="text-[10px] font-bold text-[var(--text-muted)]">
                  {s.openedAt?.toDate ? s.openedAt.toDate().toLocaleString('pt-BR') : '—'} → {s.closedAt?.toDate ? s.closedAt.toDate().toLocaleString('pt-BR') : '—'}
                </div>
                <div className="flex gap-4 text-[11px] font-black text-[var(--text-main)]">
                  <span>Esp.: R$ {Number(s.expectedBalance ?? s.currentBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span>Cont.: R$ {Number(s.closedBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span className={diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-600' : ''}>
                    {diff !== 0 ? `Dif: ${diff > 0 ? '+' : ''}${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Dif: —'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-[var(--bg-card)] rounded-[3rem] shadow-2xl border border-[var(--border-color)] overflow-hidden flex flex-col">
        <div className="p-8 border-b border-[var(--border-color)] bg-[var(--bg-main)]/50">
          <div className="flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1 space-y-2 w-full">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-[0.2em] ml-2">Período de Análise</label>
                <div className="flex gap-3">
                    <input type="date" className="flex-1 p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl text-sm font-bold text-[var(--text-main)] outline-none" value={financeFilters.start} onChange={e => setFinanceFilters({...financeFilters, start: e.target.value})} />
                    <input type="date" className="flex-1 p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl text-sm font-bold text-[var(--text-main)] outline-none" value={financeFilters.end} onChange={e => setFinanceFilters({...financeFilters, end: e.target.value})} />
                </div>
            </div>
            <div className="flex-[2] space-y-2 w-full">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-[0.2em] ml-2">Pesquisa Inteligente</label>
                <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-[var(--bg-card)] p-2 rounded-xl border border-[var(--border-color)] group-focus-within:bg-[var(--text-main)] group-focus-within:border-[var(--text-main)] transition-all duration-300 z-10 shadow-sm">
                        <Search className="text-[var(--text-muted)] group-focus-within:text-white transition-colors" size={20} />
                    </div>
                    <input
                        placeholder="NOME, CPF OU DESCRIÇÃO..."
                        className="w-full pl-16 pr-6 py-4.5 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-[2.5rem] text-sm font-bold text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest shadow-inner"
                        value={financeFilters.term}
                        onChange={e => setFinanceFilters({...financeFilters, term: e.target.value.toUpperCase()})}
                    />
                </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm table-as-cards">
              <thead className="text-left uppercase text-[10px] font-black tracking-widest text-[var(--text-muted)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="p-6">Data/Hora</th>
                  <th className="p-6">Descrição</th>
                  <th className="p-6">Pessoa / Origem</th>
                  <th className="p-6 text-right">Valor</th>
                  <th className="p-6 text-center">Recibo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredData.length === 0 ? (
                  <tr><td colSpan={5} className="p-20 text-center font-black uppercase text-xs opacity-70"><Search size={40} className="mx-auto mb-4"/> Sem registros.</td></tr>
                ) : filteredData.map((item: any) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-main)]/50 transition-all group">
                    <td className="p-6 whitespace-nowrap">
                      <div className="text-[10px] font-black text-[var(--text-main)] border-l-4 border-emerald-600 pl-4">
                          {item?.date ? new Date(item.date).toLocaleDateString('pt-BR') : '—'}<br/>
                          <span className="text-[var(--text-muted)]">{item?.date ? new Date(item.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '—'}</span>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl ${item.type === 'ENTRY' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                              {item.type === 'ENTRY' ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
                          </div>
                          <div>
                              <div className="font-bold uppercase text-sm text-[var(--text-main)] tracking-tight">{item?.name || 'Sem descrição'}</div>
                              <div className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mt-0.5">{item.category || (item.type === 'ENTRY' ? 'Venda PDV' : 'Operacional')}</div>
                          </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="font-bold text-sm text-[var(--text-main)] uppercase tracking-tight">{item.person || 'Não identificado'}</div>
                      <div className="text-[9px] font-mono text-[var(--text-muted)] font-bold mt-0.5">{item.userCpf || item.recipientCpf || 'S/ DOCUMENTO'}</div>
                    </td>
                    <td className={`p-6 text-right font-black text-base tracking-tighter ${item?.type === 'ENTRY' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item?.type === 'ENTRY' ? '+' : ''} R$ {Number(item?.amount || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </td>
                    <td className="p-6 text-center">
                      <div className="flex items-center justify-center gap-3">
                        {item?.type === 'EXIT' && item.recipientDoc && (
                          <span className="hidden xl:inline-block text-[9px] font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">
                            {item.recipientDoc}
                          </span>
                        )}
                        <button onClick={() => handleOpenReceipt(item)} className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-emerald-600 hover:border-emerald-600 rounded-xl shadow-sm transition-all group-hover:scale-110 active:scale-95" title="Visualizar Comprovante">
                          <Printer size={20}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {loadMoreExpenses && filteredData.length >= 50 && (
                <tfoot>
                    <tr>
                        <td colSpan={5} className="p-6 text-center">
                            <button
                                onClick={loadMoreExpenses}
                                className="px-8 py-4 bg-[var(--bg-main)] border-2 border-[var(--border-color)] text-[var(--text-main)] font-black rounded-2xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all text-[10px] uppercase tracking-widest shadow-sm active:scale-95"
                            >
                                Carregar Mais Despesas
                            </button>
                        </td>
                    </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="lg:hidden divide-y divide-[var(--border-color)]">
            {filteredData.length === 0 ? (
                <div className="p-10 text-center font-black uppercase text-[10px] opacity-70">Sem registros.</div>
            ) : filteredData.map((item: any) => (
                <div key={item.id} className="p-6 flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-2xl ${item.type === 'ENTRY' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                                {item.type === 'ENTRY' ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
                            </div>
                            <div>
                                <h4 className="font-bold text-sm uppercase text-[var(--text-main)] tracking-tight">{item?.name || 'Sem descrição'}</h4>
                                <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                                  {item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '—'} • {item.date ? new Date(item.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '—'}
                                </p>
                            </div>
                        </div>
                        <div className={`font-black text-lg tracking-tighter ${item?.type === 'ENTRY' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {item?.type === 'ENTRY' ? '+' : ''} R$ {(item?.amount || 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </div>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-[var(--border-color)]">
                        <div className="flex items-center gap-3 min-w-0">
                            <div>
                                <p className="text-[10px] font-black uppercase text-[var(--text-main)] tracking-tight truncate max-w-[200px]">{item.person}</p>
                                <p className="text-[9px] font-mono text-[var(--text-muted)] font-bold">{item.userCpf || item.recipientCpf || 'S/ DOCUMENTO'}</p>
                            </div>
                            {item?.type === 'EXIT' && item.recipientDoc && (
                                <span className="shrink-0 text-[9px] font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg">{item.recipientDoc}</span>
                            )}
                        </div>
                        <button onClick={() => handleOpenReceipt(item)} className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] rounded-xl active:scale-95 transition-all" title="Visualizar Comprovante">
                            <Printer size={20}/>
                        </button>
                    </div>
                </div>
            ))}
          </div>
          {loadMoreExpenses && filteredData.length >= 50 && (
            <div className="p-6 text-center border-t border-[var(--border-color)]">
                <button
                    onClick={loadMoreExpenses}
                    className="px-8 py-4 bg-[var(--bg-main)] border-2 border-[var(--border-color)] text-[var(--text-main)] font-black rounded-2xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all text-[10px] uppercase tracking-widest shadow-sm active:scale-95 w-full"
                >
                    Carregar Mais Despesas
                </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: NEW EXPENSE */}
      {showExpenseModal && (
        <ModalShell
          open
          onClose={() => setShowExpenseModal(false)}
          title="Novo Lançamento de Saída"
          subtitle="Registro de despesa operacional com recibo oficial"
          icon={<ArrowRightCircle size={22} className="text-red-300" />}
          size="lg"
          headerColor="from-red-600 via-rose-700 to-red-800"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black uppercase text-[10px] tracking-widest transition-all active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmittingExpense}
                onClick={() => { if (isSubmittingExpense) return; const f = document.getElementById('expense-form-submit') as HTMLButtonElement; f?.click(); }}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-500/25 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmittingExpense ? <><Loader2 size={16} className="animate-spin" /> Registrando...</> : <><Check size={16} /> Registrar Despesa</>}
              </button>
            </>
          }
        >
          <form id="expense-form" onSubmit={handleExpenseSubmit} className="p-8 space-y-8">
            <button type="submit" id="expense-form-submit" className="hidden" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 p-6 rounded-3xl border-2 border-red-200 bg-white focus-within:border-red-500 transition-all shadow-sm">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase mb-3 block tracking-widest ml-1">Finalidade da Despesa *</label>
                <input
                  className="w-full bg-transparent font-black text-xl text-[var(--text-main)] focus:outline-none uppercase placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:tracking-widest"
                  required
                  placeholder="EX: MANUTENÇÃO PREDIAL"
                  value={expenseForm.description}
                  onChange={e => setExpenseForm({...expenseForm, description: e.target.value.toUpperCase()})}
                />
              </div>

              <div className="p-6 rounded-3xl border-2 border-red-200 bg-white focus-within:border-red-500 transition-all shadow-sm">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase mb-2 block tracking-widest ml-1">Valor Total (R$) *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full bg-transparent font-black text-3xl text-[var(--text-main)] focus:outline-none tracking-tighter placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:tracking-widest"
                  required
                  placeholder="0,00"
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm({...expenseForm, amount: e.target.value.replace(/[^0-9.,]/g, '')})}
                />
              </div>

              <div className="p-6 rounded-3xl border-2 border-red-200 bg-white focus-within:border-red-500 transition-all shadow-sm">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase mb-2 block tracking-widest ml-1">Categoria de Custo</label>
                <select
                  className="w-full bg-transparent font-black text-sm text-[var(--text-main)] focus:outline-none uppercase appearance-none cursor-pointer"
                  value={expenseForm.category}
                  onChange={e => setExpenseForm({...expenseForm, category: e.target.value, type: e.target.value === 'Fornecedor' ? 'SUPPLIER' : 'OPERATIONAL'})}
                >
                  <option value="Manutenção">Manutenção Geral</option>
                  <option value="Fornecedor">Pagamento Fornecedor</option>
                  <option value="Serviços">Serviços Terceirizados</option>
                  <option value="Outros">Outras Despesas</option>
                </select>
              </div>

              <div className="p-6 rounded-3xl border-2 border-red-200 bg-white focus-within:border-red-500 transition-all shadow-sm">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase mb-2 block tracking-widest ml-1">Nome do Recebedor *</label>
                <input
                  className="w-full bg-transparent font-black text-sm text-[var(--text-main)] focus:outline-none uppercase placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:tracking-widest"
                  required
                  placeholder="NOME OU EMPRESA"
                  value={expenseForm.recipientName}
                  onChange={e => setExpenseForm({...expenseForm, recipientName: e.target.value.toUpperCase()})}
                />
              </div>

              <div className="p-6 rounded-3xl border-2 border-red-200 bg-white focus-within:border-red-500 transition-all shadow-sm">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase mb-2 block tracking-widest ml-1">Documento do Recebedor (CPF/CNPJ)</label>
                <input
                  className="w-full bg-transparent font-black text-sm text-[var(--text-main)] focus:outline-none uppercase placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:tracking-widest"
                  placeholder="OPCIONAL — 000.000.000-00"
                  value={expenseForm.recipientCpf}
                  onChange={e => setExpenseForm({...expenseForm, recipientCpf: e.target.value.toUpperCase()})}
                />
              </div>

              <div className="p-6 rounded-3xl border-2 border-red-200 bg-white focus-within:border-red-500 transition-all shadow-sm">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase mb-2 block tracking-widest ml-1">Conta Débito</label>
                <select
                  className="w-full bg-transparent font-black text-sm text-[var(--text-main)] focus:outline-none uppercase appearance-none cursor-pointer"
                  value={expenseForm.debitAccount}
                  onChange={e => setExpenseForm({...expenseForm, debitAccount: e.target.value})}
                >
                  <option value="CAIXA">Caixa Físico</option>
                  <option value="BANCO">Conta Bancária</option>
                  <option value="PIX">PIX da Instituição</option>
                </select>
              </div>

              <div className="md:col-span-2 p-6 rounded-3xl border-2 border-red-200 bg-white focus-within:border-red-500 transition-all shadow-sm">
                <label className="text-[var(--text-main)] font-black text-[10px] uppercase mb-2 block tracking-widest ml-1">Observações Adicionais</label>
                <textarea
                  className="w-full bg-transparent font-black text-sm text-[var(--text-main)] focus:outline-none h-24 resize-none placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:tracking-widest uppercase"
                  placeholder="DETALHES IMPORTANTES DO LANÇAMENTO..."
                  value={expenseForm.observation}
                  onChange={e => setExpenseForm({...expenseForm, observation: e.target.value.toUpperCase()})}
                />
              </div>
            </div>
          </form>
        </ModalShell>
      )}

      {/* PROMPT: IMPRIMIR AGORA OU DEPOIS */}
      {printReceipt && (
        <ModalShell
          open
          onClose={() => setPrintReceipt(null)}
          title="Despesa Lançada com Sucesso"
          subtitle="Recibo oficial gerado e arquivado"
          icon={<Check size={22} className="text-emerald-300" />}
          size="sm"
          headerColor="from-emerald-600 via-emerald-700 to-teal-800"
        >
          <div className="p-8 space-y-6">
            <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-black uppercase text-emerald-600 text-[9px] tracking-widest">Descrição</span>
                <span className="font-bold text-slate-900 uppercase text-right">{printReceipt.description}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-black uppercase text-emerald-600 text-[9px] tracking-widest">Valor</span>
                <span className="font-black text-red-600">R$ {(printReceipt.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-black uppercase text-emerald-600 text-[9px] tracking-widest">Recibo</span>
                <span className="font-mono font-bold text-slate-900">#{printReceipt.auditDocNumber || printReceipt.recipientDoc}</span>
              </div>
            </div>

            <p className="text-center text-sm font-black uppercase tracking-widest text-slate-500">Deseja imprimir o recibo agora?</p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setPrintReceipt(printReceipt);
                  setTimeout(() => { window.print(); setPrintReceipt(null); }, 400);
                }}
                className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-3 uppercase text-[11px] tracking-[0.2em] transition-all hover:brightness-110 active:scale-95"
              >
                <Printer size={20}/> Imprimir Agora
              </button>
              <button
                onClick={() => setPrintReceipt(null)}
                className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
              >
                Imprimir Depois
              </button>
              <p className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-400">
                O recibo ficará disponível na listagem (ícone de impressora) para reimpressão.
              </p>
            </div>
          </div>
        </ModalShell>
      )}

      {printReceipt && (
        <div className="cupom-gerencial-print" style={{ position: 'absolute', left: '-9999px', top: 0, width: '80mm', padding: '3mm', fontFamily: 'Courier New, monospace', fontSize: '10px', color: '#000', background: '#fff' }}>
          <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
            <strong style={{ fontSize: '12px' }}>{settings?.institutionName || 'ASSOCIAÇÃO ASSPEN'}</strong><br />
            <span style={{ fontSize: '8px' }}>RECIBO DE PAGAMENTO</span>
          </div>
          <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '2mm 0', marginBottom: '2mm' }}>
            <strong>RECIBO #{printReceipt.auditDocNumber || printReceipt.recipientDoc}</strong><br />
            <span>Data: {new Date(printReceipt.date).toLocaleString('pt-BR')}</span><br />
            <span>Recebedor: {printReceipt.recipientName || 'N/I'}</span><br />
            <span>Finalidade: {printReceipt.description || 'N/I'}</span><br />
            {printReceipt.observation && <span>Obs: {printReceipt.observation}</span>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: 'bold', margin: '2mm 0' }}>
            R$ {(printReceipt.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ textAlign: 'center', marginTop: '3mm', fontSize: '8px' }}>
            ________________________________<br />
            Assinatura do Recebedor
          </div>
          <div style={{ borderTop: '1px dashed #000', marginTop: '3mm', paddingTop: '1mm', fontSize: '7px', textAlign: 'center' }}>
            {settings?.customReceiptText || ''}<br />
            ID: {printReceipt.id?.slice(0, 8) || ''}
          </div>
          <div className="fim-do-cupom-corte" style={{ height: '1px', marginTop: '4mm' }}></div>
        </div>
      )}

      <ConfirmacaoDestrutiva
        isOpen={confirmacao === 'FINANCEIRO'}
        titulo="Zerar Todo o Financeiro"
        descricao="Isso apaga TODOS os lançamentos de despesas e sessões de caixa registradas no sistema. Os relatórios e a prestação de contas perderão o histórico. Esta ação NÃO pode ser desfeita."
        onConfirm={() => { setConfirmacao(null); resetFinance(); }}
        onClose={() => setConfirmacao(null)}
      />
      <ConfirmacaoDestrutiva
        isOpen={confirmacao === 'CREDITOS'}
        titulo="Zerar Créditos dos Familiares"
        descricao="Isso zera o SALDO DA CARTEIRA de TODOS os usuários de uma vez. Famíliares ficarão sem créditos para compras. Esta ação NÃO pode ser desfeita."
        palavraChave="ZERAR CREDITOS"
        onConfirm={() => { setConfirmacao(null); resetCredits(); }}
        onClose={() => setConfirmacao(null)}
      />
    </div>
  );
};
