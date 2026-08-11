import React from 'react';
import { CreditCard, Search, CheckCircle, XCircle, Clock, Download, ChevronRight } from 'lucide-react';
import { formatarMoeda } from '../../utils';

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
}

export const AdminWalletTab: React.FC<AdminWalletTabProps> = ({
  walletTx, userSearch, setUserSearch, financeFilters, setFinanceFilters, loadingWallet,
  approveWalletTransaction, rejectWalletTransaction, showNotification, onSelectTransaction
}) => {
  const [activeSubTab, setActiveSubTab] = React.useState<'ALL' | 'DEPOSITS' | 'WITHDRAWALS'>('ALL');
  const [quickDateFilter, setQuickDateFilter] = React.useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');

  const applyQuickDate = (filter: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => {
    const today = new Date().toISOString().split('T')[0];
    const defaultFilters = { start: '', end: '' };
    if (filter === 'ALL') {
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: '', end: '' });
    } else if (filter === 'TODAY') {
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: today, end: today });
    } else if (filter === 'WEEK') {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: weekAgo, end: today });
    } else if (filter === 'MONTH') {
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      setFinanceFilters({ ...defaultFilters, ...financeFilters, start: monthAgo, end: today });
    }
    setQuickDateFilter(filter);
  };

  const stats = React.useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return {
      pendingAmount: (walletTx || []).filter(tx => tx.status === 'pending' && tx.type === 'deposit').reduce((s, tx) => s + (tx.amount || 0), 0),
      pendingCount: (walletTx || []).filter(tx => tx.status === 'pending' && tx.type === 'deposit').length,
      totalApprovedToday: (walletTx || []).filter(tx => {
        if (tx.status !== 'approved' || tx.type !== 'deposit') return false;
        const txDate = tx.createdAt ? new Date(tx.createdAt).toISOString().split('T')[0] : null;
        return txDate === today;
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
      const d = new Date(tx.createdAt || '');
      const txDateStr = d.toISOString().split('T')[0];
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
    link.download = `carteira_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none">Fluxo de Carteira</h3>
          </div>
          <CreditCard size={40} className="text-blue-500/30 relative z-10 transform group-hover:rotate-12 transition-transform duration-500" />
        </div>
      </div>

      {/* ─── Header & Sub-Tabs ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-3 uppercase tracking-tight">
          <div className="p-2 bg-emerald-100 rounded-xl">
            <CreditCard size={20} className="text-emerald-600" />
          </div>
          Movimentações
        </h2>
        <div className="flex bg-slate-100 rounded-2xl p-1.5 w-full md:w-auto border border-slate-200">
          <button onClick={() => setActiveSubTab('ALL')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeSubTab === 'ALL' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Todos</button>
          <button onClick={() => setActiveSubTab('DEPOSITS')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeSubTab === 'DEPOSITS' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Depósitos</button>
          <button onClick={() => setActiveSubTab('WITHDRAWALS')} className={`flex-1 md:flex-none px-6 py-2.5 rounded-[1.25rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeSubTab === 'WITHDRAWALS' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}>Débitos</button>
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
          <div className="flex-1 flex gap-3">
            <div className="flex bg-slate-100 rounded-2xl p-1.5 border border-slate-200 flex-1 overflow-hidden">
              <button onClick={() => applyQuickDate('ALL')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>Todas</button>
              <button onClick={() => applyQuickDate('TODAY')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'TODAY' ? 'bg-emerald-100 text-emerald-700' : 'text-emerald-600/70 hover:text-emerald-600'}`}>Hoje</button>
              <button onClick={() => applyQuickDate('WEEK')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'WEEK' ? 'bg-blue-100 text-blue-700' : 'text-blue-600/70 hover:text-blue-600'}`}>Sem</button>
              <button onClick={() => applyQuickDate('MONTH')} className={`flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${quickDateFilter === 'MONTH' ? 'bg-indigo-100 text-indigo-700' : 'text-indigo-600/70 hover:text-indigo-600'}`}>Mês</button>
            </div>
            <input type="date" className="w-36 px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl text-[11px] font-black uppercase text-slate-900 outline-none" value={financeFilters?.start || ''} onChange={e => { setFinanceFilters({...financeFilters, start: e.target.value}); setQuickDateFilter('ALL'); }} />
            <input type="date" className="w-36 px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 rounded-2xl text-[11px] font-black uppercase text-slate-900 outline-none" value={financeFilters?.end || ''} onChange={e => { setFinanceFilters({...financeFilters, end: e.target.value}); setQuickDateFilter('ALL'); }} />
          </div>
        </div>
      </div>

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
                    <span className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-[0.2em] border ${tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-500 border-red-200'}`}>
                      {tx.type === 'deposit' ? '↑ Crédito' : tx.type === 'purchase' ? '↓ Compra' : '↓ Retirada'}
                    </span>
                  </td>
                  <td className="p-6 text-right font-black text-base">
                    <span className={tx.amount > 0 ? 'text-emerald-600' : 'text-red-500'}>
                      {tx.amount > 0 ? '+' : ''} R$ {(Math.abs(tx.amount) || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <span className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-[0.2em] border inline-flex items-center gap-1.5 ${
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
                    ) : tx.type === 'deposit' ? (
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
                <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${tx.type === 'deposit' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-500 border-red-200'}`}>
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
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Valor Total</p>
                  <p className={`font-black text-xl tracking-tighter ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.amount > 0 ? '+' : ''} R$ {(Math.abs(tx.amount) || 0).toFixed(2).replace('.', ',')}
                  </p>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border flex items-center gap-1.5 mb-3 ${
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
