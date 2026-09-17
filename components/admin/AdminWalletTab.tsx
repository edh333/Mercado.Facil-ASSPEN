import React from 'react';
import { CreditCard, Search, CheckCircle, XCircle, Clock, Download, ChevronRight, Users, Wallet, TrendingDown, Printer } from 'lucide-react';
import { formatarMoeda } from '../../utils';
import { getCustomerAccounts } from '../../utils/customerUtils';

// Data LOCAL (fuso do dispositivo) — sem o bug de toISOString (UTC) que
// deslocava depósitos feitos entre 00:00 e 03:00 para o dia anterior.
const localDateStr = (d: Date | string | undefined | null) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

interface AdminWalletTabProps {
  walletTx: any[];
  userSearch: string;
  setUserSearch: (val: string) => void;
  financeFilters: { start: string; end: string; };
  setFinanceFilters: (filters: any) => void;
  loadingWallet: boolean;
  approveWalletTransaction?: (id: string) => Promise<void>;
  rejectWalletTransaction?: (id: string) => Promise<void>;
  showNotification?: (msg: string, type: string) => void;
  onSelectTransaction?: (tx: any) => void;
  users?: any[];
}

export const AdminWalletTab: React.FC<AdminWalletTabProps> = ({
  walletTx, userSearch, setUserSearch, financeFilters, setFinanceFilters, loadingWallet,
  approveWalletTransaction, rejectWalletTransaction, showNotification, onSelectTransaction, users = []
}) => {
  const [activeSubTab, setActiveSubTab] = React.useState<'ALL' | 'DEPOSITS' | 'WITHDRAWALS' | 'SALDOS'>('ALL');
  const [quickDateFilter, setQuickDateFilter] = React.useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [fiadoAccounts, setFiadoAccounts] = React.useState<any[]>([]);
  const [fiadoLoading, setFiadoLoading] = React.useState(false);
  const [saldosAtualizadoEm, setSaldosAtualizadoEm] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (activeSubTab !== 'SALDOS' || fiadoAccounts.length > 0) return;
    setFiadoLoading(true);
    getCustomerAccounts().then(data => { setFiadoAccounts(data); setSaldosAtualizadoEm(new Date()); }).catch(console.error).finally(() => setFiadoLoading(false));
  }, [activeSubTab, fiadoAccounts.length]);

  const applyQuickDate = (filter: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => {
    const today = localDateStr(new Date());
    const defaultFilters = { start: '', end: '' };
    if (filter === 'ALL') {
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: '', end: '' });
    } else if (filter === 'TODAY') {
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: today, end: today });
    } else if (filter === 'WEEK') {
      const weekAgo = localDateStr(new Date(Date.now() - 7 * 86400000));
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: weekAgo, end: today });
    } else if (filter === 'MONTH') {
      const monthAgo = localDateStr(new Date(Date.now() - 30 * 86400000));
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: monthAgo, end: today });
    }
    setQuickDateFilter(filter);
  };

  const stats = React.useMemo(() => {
    const today = localDateStr(new Date());
    return {
      pendingAmount: (walletTx || []).filter(tx => tx.status === 'pending' && tx.type === 'deposit').reduce((s, tx) => s + (tx.amount || 0), 0),
      pendingCount: (walletTx || []).filter(tx => tx.status === 'pending' && tx.type === 'deposit').length,
      totalApprovedToday: (walletTx || []).filter(tx => {
        if (tx.status !== 'approved' || tx.type !== 'deposit') return false;
        return localDateStr(tx.createdAt) === today;
      }).reduce((s, tx) => s + (tx.amount || 0), 0)
    };
  }, [walletTx]);

  const filteredTx = (walletTx || []).filter(tx => {
    const termo = (userSearch || '').toLowerCase();
    const matchSearch = String(tx.userName || '').toLowerCase().includes(termo) ||
                       String(tx.inmateCpf || '').includes(userSearch || '') ||
                       String(tx.payerName || '').toLowerCase().includes(termo) ||
                       String(tx.inmateName || '').toLowerCase().includes(termo);

    const isPending = tx.status === 'pending';
    let matchDate = true;
    if (!isPending) {
      const txDateStr = localDateStr(tx.createdAt || tx.date || '');
      const startFilter = financeFilters?.start;
      const endFilter = financeFilters?.end;
      if (startFilter && endFilter) {
        matchDate = txDateStr >= startFilter && txDateStr <= endFilter;
      } else if (startFilter) {
        matchDate = txDateStr >= startFilter;
      } else if (endFilter) {
        matchDate = txDateStr <= endFilter;
      }
    }

    const matchType = activeSubTab === 'ALL' ||
                     (activeSubTab === 'DEPOSITS' && tx.type === 'deposit') ||
                     (activeSubTab === 'WITHDRAWALS' && (tx.type === 'withdrawal' || tx.type === 'purchase'));

    return matchSearch && matchDate && matchType;
  }).sort((a, b) => {
    const aPending = a.status === 'pending' ? 1 : 0;
    const bPending = b.status === 'pending' ? 1 : 0;
    if (aPending !== bPending) return bPending - aPending;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  const exportWalletToCSV = () => {
    const headers = ['Data/Hora', 'Usuário', 'Interno', 'Tipo', 'Valor', 'Status'];
    const rows = filteredTx.map(tx => [
      new Date(tx.createdAt || tx.date || 0).toLocaleString('pt-BR'),
      tx.userName || tx.payerName || '',
      tx.inmateName || '',
      tx.type === 'deposit' ? 'Depósito' : tx.type === 'withdrawal' ? 'Saque' : 'Compra',
      (tx.amount || 0).toFixed(2).replace('.', ','),
      tx.status === 'approved' ? 'Aprovado' : tx.status === 'rejected' ? 'Rejeitado' : 'Pendente'
    ]);

    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carteira_${localDateStr(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportSaldosCSV = () => {
    const withCredits = (users || []).filter(u => Number(u.walletBalance || 0) > 0);
    const withDebt = fiadoAccounts.filter(a => Number(a.currentDebt || 0) > 0);
    const rows: string[] = ['TIPO;NOME;CPF;VALOR;STATUS'];
    withCredits.forEach(u => rows.push(`CARTEIRA;"${u.name || ''}";"${u.cpf || ''}";${(Number(u.walletBalance) || 0).toFixed(2).replace('.', ',')};${u.status || ''}`));
    withDebt.forEach(a => rows.push(`FIADO;"${a.nome || a.name || ''}";"${a.cpf || ''}";${(Number(a.currentDebt) || 0).toFixed(2).replace('.', ',')};${a.status || ''}`));
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `saldos_${localDateStr(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printSaldos = () => {
    const withCredits = (users || [])
      .filter(u => (Number(u.walletBalance) || 0) > 0)
      .sort((a, b) => (Number(b.walletBalance) || 0) - (Number(a.walletBalance) || 0));
    const totalCredits = withCredits.reduce((s, u) => s + (Number(u.walletBalance) || 0), 0);
    const withDebt = fiadoAccounts
      .filter(a => (Number(a.currentDebt) || 0) > 0)
      .sort((a, b) => (Number(b.currentDebt) || 0) - (Number(a.currentDebt) || 0));
    const totalDebt = withDebt.reduce((s, a) => s + (Number(a.currentDebt) || 0), 0);
    const hoje = new Date().toLocaleDateString('pt-BR');
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = formatarMoeda;

    const creditRows = withCredits.map((u, i) => `<tr><td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${String(i + 1).padStart(2, '0')}</td><td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-transform:uppercase;">${esc(u.name)}</td><td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(u.cpf || 'N/A')}</td><td style="text-align:right;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#059669;">R$ ${fmt(Number(u.walletBalance) || 0)}</td><td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${u.status === 'active' ? 'Ativo' : u.status || '—'}</td></tr>`).join('');

    const debtRows = withDebt.map((a, i) => {
      const divida = Number(a.currentDebt) || 0;
      const limite = Number(a.creditLimit) || 0;
      return `<tr><td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${String(i + 1).padStart(2, '0')}</td><td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-transform:uppercase;">${esc(a.nome || a.name || '')}</td><td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${esc(a.cpf || 'N/A')}</td><td style="text-align:right;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:#ef4444;">R$ ${fmt(divida)}</td><td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${limite > 0 ? `R$ ${fmt(limite)}` : '—'}</td><td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${a.status === 'blocked' ? 'Bloqueado' : 'Ativo'}</td></tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório de Saldos — Carteira e Fiado</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; color:#0f172a; padding:32px; background:#fff; }
    .cabecalho { border-bottom:3px solid #059669; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-end; }
    .cabecalho h1 { font-size:20px; text-transform:uppercase; letter-spacing:1px; color:#059669; }
    .cabecalho p { font-size:12px; color:#64748b; margin-top:4px; }
    .meta { text-align:right; font-size:11px; color:#64748b; }
    .cards { display:flex; gap:12px; margin-bottom:22px; }
    .card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
    .card .titulo { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; }
    .card .valor { font-size:18px; font-weight:800; }
    h2 { font-size:14px; text-transform:uppercase; letter-spacing:1px; color:#0f172a; margin:24px 0 10px; padding-bottom:6px; border-bottom:2px solid #e2e8f0; }
    table { width:100%; border-collapse:collapse; }
    thead th { background:#0f172a; color:#fff; padding:10px; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; }
    tfoot td { padding:10px; font-weight:800; font-size:12px; background:#f8fafc; border-top:2px solid #0f172a; }
    .assinatura { margin-top:48px; display:flex; justify-content:space-between; }
    .assinatura div { width:40%; border-top:1px solid #64748b; padding-top:8px; font-size:10px; text-transform:uppercase; text-align:center; color:#475569; }
    .rodape { margin-top:22px; text-align:center; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
    @media print { @page { size: A4; margin: 15mm 12mm; } body { padding:16px; } }
</style>
</head>
<body>
    <div class="cabecalho">
        <div>
            <h1>Relatório de Saldos — Carteira e Fiado</h1>
            <p>Mercado Fácil — Gestão Penitenciária de Alta Performance</p>
        </div>
        <div class="meta">
            <p>Emitido em: <b>${hoje}</b></p>
            <p>${withCredits.length} com crédito · ${withDebt.length} em fiado</p>
        </div>
    </div>
    <div class="cards">
        <div class="card"><p class="titulo">Total em Carteira</p><p class="valor" style="color:#059669">R$ ${fmt(totalCredits)}</p></div>
        <div class="card"><p class="titulo">Total em Fiado</p><p class="valor" style="color:#ef4444">R$ ${fmt(totalDebt)}</p></div>
        <div class="card"><p class="titulo">Saldo Líquido</p><p class="valor" style="color:${totalCredits - totalDebt >= 0 ? '#059669' : '#ef4444'}">R$ ${fmt(totalCredits - totalDebt)}</p></div>
    </div>
    <h2>Créditos de Carteira — ${withCredits.length} familiar(es)</h2>
    ${withCredits.length > 0 ? `<table>
        <thead><tr><th style="text-align:center;width:36px;">#</th><th>Familiar</th><th style="text-align:center;">CPF</th><th style="text-align:right;">Saldo</th><th style="text-align:center;">Status</th></tr></thead>
        <tbody>${creditRows}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right;">TOTAL</td><td style="text-align:right;">R$ ${fmt(totalCredits)}</td><td></td></tr></tfoot>
    </table>` : '<p style="font-size:12px;color:#94a3b8;text-align:center;padding:20px;">Nenhum familiar com crédito na carteira.</p>'}
    <h2>Dívidas de Fiado — ${withDebt.length} conta(s)</h2>
    ${withDebt.length > 0 ? `<table>
        <thead><tr><th style="text-align:center;width:36px;">#</th><th>Cliente</th><th style="text-align:center;">CPF</th><th style="text-align:right;">Dívida</th><th style="text-align:center;">Limite</th><th style="text-align:center;">Status</th></tr></thead>
        <tbody>${debtRows}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right;">TOTAL</td><td style="text-align:right;">R$ ${fmt(totalDebt)}</td><td></td><td></td></tr></tfoot>
    </table>` : '<p style="font-size:12px;color:#94a3b8;text-align:center;padding:20px;">Nenhuma dívida de fiado registrada.</p>'}
    <div class="assinatura">
        <div>Emitido por: Administração</div>
        <div>Assinatura / Carimbo</div>
    </div>
    <p class="rodape">Documento gerado pelo sistema Mercado Fácil — uso interno</p>
</body>
</html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      // print() síncrono logo após document.write() imprime PÁGINA EM BRANCO
      // no Chromium (snapshot antes de o layout terminar). O atraso curto
      // espera a renderização sem abrir diálogo duplicado.
      setTimeout(() => { try { printWindow.print(); } catch { /* janela fechou */ } }, 350);
    }
  };

  return (
    <div className="animate-slideUp space-y-6 pb-20">

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm border-l-4 border-l-amber-500 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent pointer-events-none" />
          <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-1 relative z-10">Aportes Pendentes</p>
          <div className="flex items-end justify-between relative z-10">
            <h3 className="text-3xl font-black text-amber-500 tracking-tighter group-hover:scale-105 transition-transform origin-left">R$ {formatarMoeda(stats.pendingAmount)}</h3>
            <span className="text-[10px] font-black bg-amber-100 text-amber-600 px-3 py-1.5 rounded-xl border border-amber-200">{stats.pendingCount} Itens</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm border-l-4 border-l-emerald-500 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent pointer-events-none" />
          <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-1 relative z-10">Aprovados Hoje</p>
          <h3 className="text-3xl font-black text-emerald-600 tracking-tighter group-hover:scale-105 transition-transform origin-left relative z-10">R$ {formatarMoeda(stats.totalApprovedToday)}</h3>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm border-l-4 border-l-blue-500 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] mb-1">Sistema de Créditos</p>
            <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-none">Fluxo de Carteira</h3>
          </div>
          <CreditCard size={40} className="text-blue-500/30 relative z-10 transform group-hover:rotate-12 transition-transform duration-500" />
        </div>
      </div>

      {/* ─── Header & Sub-Tabs ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <div className="p-2 bg-emerald-100 rounded-xl">
            <CreditCard size={20} className="text-emerald-600" />
          </div>
          Movimentações
        </h2>
        <div className="flex bg-slate-100 rounded-2xl p-1.5 w-full md:w-auto border border-slate-200">
          <button onClick={() => setActiveSubTab('ALL')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeSubTab === 'ALL' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Todos</button>
          <button onClick={() => setActiveSubTab('DEPOSITS')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeSubTab === 'DEPOSITS' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Depósitos</button>
          <button onClick={() => setActiveSubTab('WITHDRAWALS')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeSubTab === 'WITHDRAWALS' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Saídas e Compras</button>
          <button onClick={() => setActiveSubTab('SALDOS')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeSubTab === 'SALDOS' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Saldos</button>
        </div>
        <button onClick={exportWalletToCSV} className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-105 active:scale-95 border border-slate-200">
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      {/* ─── Search & Date Filters ─── */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-[2] relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 transition-colors z-10 text-slate-400 group-focus-within:text-emerald-500">
              <Search size={20} />
            </div>
            <input
              className="w-full pl-14 pr-6 py-4 rounded-[1.5rem] bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none font-bold text-sm text-slate-900 transition-all placeholder:text-slate-400 uppercase tracking-widest"
              placeholder="BUSCAR POR NOME OU CPF"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 flex flex-wrap gap-3">
            <div className="flex bg-slate-100 rounded-2xl p-1.5 border border-slate-200 flex-1 overflow-hidden">
              <button onClick={() => applyQuickDate('ALL')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Todas</button>
              <button onClick={() => applyQuickDate('TODAY')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'TODAY' ? 'bg-emerald-100 text-emerald-700' : 'text-emerald-600/70 hover:text-emerald-600'}`}>Hoje</button>
              <button onClick={() => applyQuickDate('WEEK')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'WEEK' ? 'bg-blue-100 text-blue-700' : 'text-blue-600/70 hover:text-blue-600'}`}>Semana</button>
              <button onClick={() => applyQuickDate('MONTH')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'MONTH' ? 'bg-indigo-100 text-indigo-700' : 'text-indigo-600/70 hover:text-indigo-600'}`}>30 Dias</button>
            </div>
            <input type="date" className="w-36 flex-1 min-w-[120px] px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl text-[11px] font-black uppercase text-slate-900 outline-none" value={financeFilters?.start || ''} onChange={e => { setFinanceFilters({...financeFilters, start: e.target.value}); setQuickDateFilter('ALL'); }} />
            <input type="date" className="w-36 flex-1 min-w-[120px] px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl text-[11px] font-black uppercase text-slate-900 outline-none" value={financeFilters?.end || ''} onChange={e => { setFinanceFilters({...financeFilters, end: e.target.value}); setQuickDateFilter('ALL'); }} />
          </div>
        </div>
      </div>

      {/* ─── SALDOS: quem tem crédito na carteira + dívidas de fiado ─── */}
      {activeSubTab === 'SALDOS' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-xl">
                <Wallet size={20} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Saldos e Créditos</h2>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">
                  Quem tem crédito na carteira e quem deve no fiado — visão consolidada
                  {saldosAtualizadoEm && <span className="text-emerald-600 ml-2">· Atualizado {saldosAtualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={exportSaldosCSV} className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:scale-105 active:scale-95 border border-slate-200">
                <Download size={16} /> Exportar CSV
              </button>
              <button onClick={printSaldos} className="px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 hover:scale-105 active:scale-95 shadow-md">
                <Printer size={16} /> Imprimir PDF
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CARTEIRA */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-br from-emerald-50/80 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500 text-white rounded-xl"><Users size={18} /></div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Créditos de Carteira</h3>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Usuários com saldo positivo</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Total</p>
                  <p className="text-lg font-black text-emerald-600">
                    R$ {formatarMoeda((users || []).reduce((s, u) => s + (Number(u.walletBalance || 0) > 0 ? Number(u.walletBalance || 0) : 0), 0))}
                  </p>
                </div>
              </div>
              <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100">
                {(() => {
                  const termo = (userSearch || '').toLowerCase();
                  const lista = (users || [])
                    .filter(u => (Number(u.walletBalance) || 0) > 0)
                    .filter(u => !termo || String(u.name || '').toLowerCase().includes(termo) || String(u.cpf || '').includes(userSearch))
                    .sort((a, b) => (Number(b.walletBalance) || 0) - (Number(a.walletBalance) || 0));
                  if (lista.length === 0) return (
                    <div className="p-10 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.3em]">
                      {fiadoLoading ? 'Carregando...' : 'Ninguém com crédito na carteira.'}
                    </div>
                  );
                  return lista.map(u => (
                    <div key={u.id} className="p-5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 text-sm uppercase tracking-tight truncate">{u.name || '—'}</p>
                        <p className="text-[9px] text-slate-400 font-black tracking-widest mt-1">
                          CPF: <span className="font-mono">{u.cpf || 'N/A'}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-emerald-600">R$ {formatarMoeda(Number(u.walletBalance) || 0)}</p>
                        <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${u.status === 'active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-500 border-red-200'}`}>
                          {u.status === 'active' ? 'Ativo' : u.status || '—'}
                        </span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* FIADO */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3 bg-gradient-to-br from-red-50/80 to-transparent">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-500 text-white rounded-xl"><TrendingDown size={18} /></div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Dívidas de Fiado</h3>
                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Contas de clientes em aberto</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Total</p>
                  <p className="text-lg font-black text-red-600">
                    R$ {formatarMoeda(fiadoAccounts.reduce((s, a) => s + (Number(a.currentDebt || 0) > 0 ? Number(a.currentDebt || 0) : 0), 0))}
                  </p>
                </div>
              </div>
              <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100">
                {(() => {
                  const termo = (userSearch || '').toLowerCase();
                  const lista = fiadoAccounts
                    .filter(a => (Number(a.currentDebt) || 0) > 0)
                    .filter(a => !termo || String(a.nome || a.name || '').toLowerCase().includes(termo) || String(a.cpf || '').includes(userSearch))
                    .sort((a, b) => (Number(b.currentDebt) || 0) - (Number(a.currentDebt) || 0));
                  if (lista.length === 0) return (
                    <div className="p-10 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.3em]">
                      {fiadoLoading ? 'Carregando...' : 'Nenhuma dívida de fiado.'}
                    </div>
                  );
                  return lista.map(a => {
                    const divida = Number(a.currentDebt) || 0;
                    const limite = Number(a.creditLimit) || 0;
                    const pct = limite > 0 ? Math.min(100, Math.round((divida / limite) * 100)) : 0;
                    return (
                      <div key={a.id} className="p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 text-sm uppercase tracking-tight truncate">{a.nome || a.name || '—'}</p>
                            <p className="text-[9px] text-slate-400 font-black tracking-widest mt-1">
                              CPF: <span className="font-mono">{a.cpf || 'N/A'}</span>
                              {limite > 0 && <span className="ml-3">LIMITE: R$ {formatarMoeda(limite)}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-red-600">R$ {formatarMoeda(divida)}</p>
                            <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${a.status === 'blocked' ? 'bg-red-50 text-red-500 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                              {a.status === 'blocked' ? 'Bloqueado' : 'Ativo'}
                            </span>
                          </div>
                        </div>
                        {limite > 0 && (
                          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Transaction Table ─── */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 font-black text-[10px] uppercase tracking-[0.2em] border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="p-6">Data/Hora</th>
                <th className="p-6">Usuário / Beneficiário</th>
                <th className="p-6 text-center">Tipo</th>
                <th className="p-6 text-right">Valor</th>
                <th className="p-6 text-center">Status</th>
                <th className="p-6 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingWallet ? (
                <tr><td colSpan={6} className="p-20 text-center"><div className="flex flex-col items-center gap-3 text-slate-300"><CreditCard size={48} className="animate-pulse"/><p className="text-xs font-black uppercase tracking-[0.3em]">Sincronizando Dados...</p></div></td></tr>
              ) : filteredTx.length === 0 ? (
                <tr><td colSpan={6} className="p-20 text-center text-slate-300 font-black uppercase tracking-[0.3em] text-xs">Nenhuma movimentação.</td></tr>
              ) : filteredTx.map(tx => (
                <tr
                  key={tx.id}
                  className={`transition-all hover:bg-slate-50 group ${tx.status === 'pending' && tx.type === 'deposit' ? 'bg-amber-50/60' : ''}`}
                >
                  <td className="p-6">
                    <div className="text-[10px] text-slate-900 font-black leading-tight tracking-widest">
                      {new Date(tx.createdAt).toLocaleDateString('pt-BR')}<br/>
                      <span className="text-slate-400">{new Date(tx.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="font-black text-slate-900 text-sm uppercase tracking-tight truncate max-w-[250px] group-hover:text-emerald-600 transition-colors">{tx.userName || tx.payerName || '—'}</div>
                    <div className="text-[9px] text-slate-400 font-black mt-1 tracking-widest">
                      CPF: <span className="font-mono">{tx.inmateCpf || tx.cpf || 'N/A'}</span>
                      {tx.description && <span className="ml-3 italic opacity-60 font-normal normal-case tracking-normal">• {tx.description}</span>}
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border ${tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-500 border-red-200'}`}>
                      {tx.type === 'deposit' ? '↑ Crédito' : tx.type === 'purchase' ? '↓ Compra' : '↓ Retirada'}
                    </span>
                  </td>
                  <td className="p-6 text-right font-black text-base">
                    <span className={tx.amount > 0 ? 'text-emerald-600' : 'text-red-500'}>
                      {tx.amount > 0 ? '+' : ''} R$ {(Math.abs(tx.amount) || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border inline-flex items-center gap-1.5 ${
                      tx.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                      tx.status === 'pending'  ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                                 'bg-red-50 text-red-500 border-red-200'
                    }`}>
                      {tx.status === 'approved' ? <CheckCircle size={12}/> : tx.status === 'pending' ? <Clock size={12} className="animate-pulse"/> : <XCircle size={12}/>}
                      {tx.status === 'approved' ? 'Confirmado' : tx.status === 'pending' ? 'Pendente' : 'Recusado'}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    {tx.type === 'deposit' ? (
                      <div className="flex items-center justify-center gap-2">
                        {tx.status === 'pending' && (
                          <button
                            onClick={() => onSelectTransaction?.(tx)}
                            className="px-4 py-2 min-h-[44px] rounded-xl text-[9px] font-black uppercase tracking-[0.2em] bg-emerald-500 text-white shadow-md hover:bg-emerald-600 active:scale-95 transition-all"
                          >
                            Validar
                          </button>
                        )}
                        <button
                          onClick={() => onSelectTransaction?.(tx)}
                          className="px-4 py-2 min-h-[44px] rounded-xl text-[9px] font-black uppercase tracking-[0.2em] bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all border border-slate-200"
                        >
                          Detalhes
                        </button>
                      </div>
                    ) : tx.type === 'withdrawal' || tx.type === 'refund' ? (
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => onSelectTransaction?.(tx)}
                          className="px-4 py-2 min-h-[44px] rounded-xl text-[9px] font-black uppercase tracking-[0.2em] bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all border border-slate-200"
                        >
                          Detalhes
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-black">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-slate-100">
          {loadingWallet ? (
            <div className="p-10 text-center text-slate-300"><CreditCard size={40} className="mx-auto mb-3 animate-pulse"/><p className="text-[10px] font-black uppercase tracking-[0.3em]">Sincronizando...</p></div>
          ) : filteredTx.length === 0 ? (
            <div className="p-10 text-center text-slate-300 text-[10px] font-black uppercase tracking-[0.3em]">Nenhuma movimentação.</div>
          ) : filteredTx.map(tx => (
            <div
              key={tx.id}
              className={`p-6 flex flex-col gap-5 ${tx.status === 'pending' && tx.type === 'deposit' ? 'bg-amber-50/60' : ''}`}
            >
              <div className="flex justify-between items-start">
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  {new Date(tx.createdAt).toLocaleDateString('pt-BR')} • {new Date(tx.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                </div>
                <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-500 border-red-200'}`}>
                  {tx.type === 'deposit' ? '↑ Crédito' : '↓ Débito'}
                </span>
              </div>

              <div>
                <p className="font-black text-slate-900 text-base uppercase tracking-tight truncate">{tx.userName || tx.payerName || '—'}</p>
                <p className="text-[10px] text-slate-400 font-black mt-1 tracking-widest">CPF: <span className="font-mono">{tx.inmateCpf || tx.cpf || 'N/A'}</span></p>
                {tx.description && <p className="text-[10px] text-slate-400 italic mt-2 truncate">{tx.description}</p>}
              </div>

              <div className="flex justify-between items-center mt-2 border-t border-slate-100 pt-4">
                <div className="flex flex-col">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Valor Total</p>
                  <p className={`font-black text-xl tracking-tighter ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''} R$ {(Math.abs(tx.amount) || 0).toFixed(2).replace('.', ',')}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 mb-3 ${
                    tx.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                    tx.status === 'pending'  ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                               'bg-red-50 text-red-500 border-red-200'
                  }`}>
                    {tx.status === 'approved' ? <CheckCircle size={10}/> : tx.status === 'pending' ? <Clock size={10} className="animate-pulse"/> : <XCircle size={10}/>}
                    {tx.status === 'approved' ? 'Confirmado' : tx.status === 'pending' ? 'Pendente' : 'Recusado'}
                  </span>
                  {tx.type === 'deposit' && (
                    <div className="flex items-center gap-2">
                      {tx.status === 'pending' && (
                        <button
                          onClick={() => onSelectTransaction?.(tx)}
                          className="flex items-center gap-1 text-[9px] font-black text-white uppercase cursor-pointer bg-emerald-500 px-4 py-2 min-h-[44px] rounded-xl active:scale-95 transition-all"
                        >
                          Validar <ChevronRight size={14}/>
                        </button>
                      )}
                      <button
                        onClick={() => onSelectTransaction?.(tx)}
                        className="flex items-center gap-1 text-[9px] font-black text-slate-700 uppercase cursor-pointer bg-slate-100 hover:bg-slate-200 px-4 py-2 min-h-[44px] rounded-xl border border-slate-200 active:scale-95 transition-all"
                      >
                        Detalhes <ChevronRight size={14}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
