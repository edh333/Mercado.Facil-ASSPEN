import React from 'react';
import {
  ShoppingCart, Search, Grid, List, Clock, Printer, DollarSign, ArrowRight, UserCheck, ShieldCheck, Download, XCircle, CheckCircle, CalendarDays, Eye
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/StoreContext';
import { Order, OrderStatus } from '../../types';
import { getLocalDateStr } from './adminUtils';
import { toDate } from '../../utils/dateUtils';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';

interface AdminOrdersTabProps {
  orders: Order[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  translateStatus: (status: string | undefined) => string;
  getStatusColor: (status: string) => string;
  setSelectedOrderDetails: (order: Order) => void;
  setPrintOrder: (order: Order) => void;
  setViewingReceipt: (data: any) => void;
  loadMoreOrders?: () => void;
  ordersLimit?: number;
}

export const AdminOrdersTab: React.FC<AdminOrdersTabProps> = ({
  orders, searchTerm, setSearchTerm, viewMode, setViewMode,
  translateStatus, getStatusColor, setSelectedOrderDetails,
  setPrintOrder, setViewingReceipt, loadMoreOrders, ordersLimit
}) => {
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [dateFilter, setDateFilter] = React.useState<string>('ALL');
  const [specificDate, setSpecificDate] = React.useState<string>(getLocalDateStr());
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest');
  const { colors } = useTheme();
  const { aprovarPedido, showNotification } = useApp();
  const [confirmarAprovId, setConfirmarAprovId] = React.useState<string | null>(null);
  const [aprovarId, setAprovarId] = React.useState<string | null>(null);
  const [confirmarAprovErro, setConfirmarAprovErro] = React.useState('');
  const [agruparPorDia, setAgruparPorDia] = React.useState(false);

  // Status de pedido ainda em fluxo de pagamento (pendente de aprovação).
  // Usado tanto no filtro quanto nos botões — evita 'pago_pendente' sem ação.
  const isPending = (status: string) => ['pendente', 'pending_payment', 'pending', 'pago_pendente'].includes(String(status || '').toLowerCase());

  // Contagens por situação no acervo atual — para badges nos filtros.
  const contagens = React.useMemo(() => {
    const pend = (orders || []).filter(o => isPending(o.status)).length;
    const conc = (orders || []).filter(o => ['paid', 'delivered', 'preparing', 'out_for_delivery', 'approved', 'entregue', 'preparando'].includes(String(o.status || '').toLowerCase())).length;
    const canc = (orders || []).filter(o => ['cancelled', 'cancelado', 'cancelada'].includes(String(o.status || '').toLowerCase())).length;
    const dev = (orders || []).filter(o => ['refunded', 'devolvido', 'reembolsado'].includes(String(o.status || '').toLowerCase())).length;
    return { pend, conc, canc, dev };
  }, [orders]);

  // Aprovação direta pelo card: valida comprovante, pede confirmação e
  // finaliza a compra em um clique — sem reabrir a janela de detalhes.
  const handleQuickApprove = async (order: Order) => {
    const temComprovante = order.paymentMethod === 'WALLET' ||
      !!(order.paymentProofUrl && order.paymentProofUrl !== 'PENDENTE_UPLOAD_LOCAL_CACHE');
    if (!temComprovante) {
      showNotification('Pedido sem comprovante de pagamento. Abra em Detalhes para anexar antes de aprovar.', 'error');
      return;
    }
    if (aprovarId) return;
    setAprovarId(order.id);
    setConfirmarAprovErro('');
    try {
      await aprovarPedido(order.id, true);
      showNotification('Pedido aprovado e finalizado com sucesso!', 'success');
    } catch (e: any) {
      setConfirmarAprovErro(e?.message || 'Erro ao aprovar o pedido.');
    } finally {
      setAprovarId(null);
      setConfirmarAprovId(null);
    }
  };

  const filteredOrders = React.useMemo(() => {
    const termoLower = (searchTerm || '').toLowerCase();
    const termoUpper = (searchTerm || '').toUpperCase();
    const norm = (s: string) => String(s || '').toLowerCase();
    const isPaid = (status: string) => ['paid', 'delivered', 'preparing', 'out_for_delivery', 'approved', 'entregue', 'preparando'].includes(norm(status));
    const isCancelled = (status: string) => ['cancelled', 'cancelado', 'cancelada'].includes(norm(status));
    const isRefunded = (status: string) => ['refunded', 'devolvido', 'reembolsado'].includes(norm(status));

    // Fuso local (BRT): toISOString virava "amanhã" após as 21h.
    const today = getLocalDateStr();
    const yesterday = getLocalDateStr(new Date(Date.now() - 86400000));
    const thisWeek = getLocalDateStr(new Date(Date.now() - 7 * 86400000));
    const thisMonth = getLocalDateStr(new Date(Date.now() - 30 * 86400000));

    return (orders || []).filter(o => {
      // Normalização SEGURA: createdAt pode vir como string ISO, Timestamp
      // Firestore ou Date (dados legados). `.split('T')[0]` explodiria num
      // Timestamp — usamos toDate()+getLocalDateStr() (fuso Brasil) para
      // comparar com os filtros 'today/yesterday/week/month' no MESMO formato.
      const orderDate = toDate(o.createdAt || o.date);
      const orderDateStr = orderDate ? getLocalDateStr(orderDate) : '';

      const matchesSearch = (o.userName || '').toLowerCase().includes(termoLower) ||
        (o.inmateName || '').toLowerCase().includes(termoLower) ||
        (o.userCpf || '').replace(/\D/g, '').includes((searchTerm || '').replace(/\D/g, '')) ||
        (o.id || '').toUpperCase().includes(termoUpper);

      // Filter by status
      let matchesStatus = true;
      if (statusFilter === 'PENDING') matchesStatus = isPending(o.status);
      else if (statusFilter === 'PAID') matchesStatus = isPaid(o.status);
      else if (statusFilter === 'CANCELLED') matchesStatus = isCancelled(o.status);
      else if (statusFilter === 'REFUNDED') matchesStatus = isRefunded(o.status);

      // Filter by date
      let matchesDate = true;
      if (dateFilter === 'TODAY') matchesDate = orderDateStr === today;
      else if (dateFilter === 'YESTERDAY') matchesDate = orderDateStr === yesterday;
      else if (dateFilter === 'DAY') matchesDate = !!specificDate && orderDateStr === specificDate;
      else if (dateFilter === 'WEEK') matchesDate = orderDateStr >= thisWeek;
      else if (dateFilter === 'MONTH') matchesDate = orderDateStr >= thisMonth;

      return matchesSearch && matchesStatus && matchesDate;
    }).sort((a,b) => {
      const dateA = toDate(a.createdAt || a.date)?.getTime() || 0;
      const dateB = toDate(b.createdAt || b.date)?.getTime() || 0;
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [orders, searchTerm, statusFilter, dateFilter, specificDate, sortOrder]);

  // Agrupamento por dia (fuso Brasil) com subtotal por dia.
  const gruposPorDia = React.useMemo(() => {
    const map: Record<string, { items: Order[]; total: number }> = {};
    (filteredOrders || []).forEach(o => {
      const d = toDate(o.createdAt || o.date);
      const key = d ? getLocalDateStr(d) : 'sem-data';
      if (!map[key]) map[key] = { items: [], total: 0 };
      if (!['cancelled', 'cancelado', 'cancelada', 'refunded', 'devolvido', 'reembolsado'].includes(String(o.status || '').toLowerCase())) {
        map[key].total += Number(o.total) || 0;
      }
      map[key].items.push(o);
    });
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map(key => ({ key, items: map[key].items, total: map[key].total }));
  }, [filteredOrders]);

  // Resumo do recorte atual: total de pedidos e soma em R$ — responde
  // "quanto vendi no dia X?" sem exportar CSV.
  const resumoFiltro = React.useMemo(() => {
    const validas = filteredOrders.filter(o => !['cancelled', 'cancelado', 'cancelada', 'refunded', 'devolvido', 'reembolsado'].includes(String(o.status || '').toLowerCase()));
    return {
      qtd: validas.length,
      total: validas.reduce((s, o) => s + (Number(o.total) || 0), 0)
    };
  }, [filteredOrders]);

  const exportOrdersToCSV = () => {
    const headers = ['Data', 'ID', 'Familia', 'Interno', 'CPF', 'Total', 'Status', 'Itens'];
    const rows = filteredOrders.map(o => [
      toDate(o.createdAt || o.date)?.toLocaleDateString('pt-BR') || '',
      o.id || '',
      o.userName || '',
      o.inmateName || '',
      o.userCpf || '',
      (o.total || 0).toFixed(2).replace('.', ','),
      translateStatus(o.status) || o.status,
      (o.items || []).map((i: any) => `${i.name || 'Item'} x${i.quantity || 1}`).join(' | ')
    ]);

    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pedidos_${getLocalDateStr()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-slideUp pb-20">
      {/* Upper Management Header */}
      <div className="flex flex-col xl:flex-row xl:flex-wrap justify-between items-start xl:items-center gap-4 sm:gap-6 bg-[var(--bg-card)] p-5 sm:p-8 rounded-[3rem] border-2 border-[var(--border-color)] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500 rounded-full blur-[60px] -ml-16 -mt-16 opacity-10"></div>

        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3 tracking-tight">
            <ShoppingCart size={28} className="text-emerald-500"/> Controle de Pedidos
          </h2>
          <p className="text-sm font-medium text-[var(--text-muted)] mt-1 ml-1">Monitoramento em Tempo Real de Vendas</p>
        </div>

        <div className="flex flex-col md:flex-row md:flex-wrap items-center gap-3 w-full relative z-10">
            {/* Status Filter Toggle */}
            <div className="flex flex-wrap bg-[var(--bg-main)] rounded-2xl p-1.5 border border-[var(--border-color)] w-full md:w-auto gap-1.5">
                <button onClick={() => setStatusFilter('ALL')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${statusFilter === 'ALL' ? 'bg-[var(--text-main)] text-[var(--bg-card)] shadow-lg' : 'text-[var(--text-muted)] hover:bg-slate-100'}`}>Tudo</button>
                <button onClick={() => setStatusFilter('PENDING')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${statusFilter === 'PENDING' ? 'bg-amber-500 text-white shadow-lg ring-2 ring-amber-300' : 'text-amber-600 hover:bg-amber-100'}`}>Pendentes {contagens.pend > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${statusFilter === 'PENDING' ? 'bg-white/20' : 'bg-amber-500/15'}`}>{contagens.pend}</span>}</button>
                <button onClick={() => setStatusFilter('PAID')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${statusFilter === 'PAID' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-600 hover:bg-emerald-100'}`}>Concluídos {contagens.conc > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${statusFilter === 'PAID' ? 'bg-white/20' : 'bg-emerald-500/15'}`}>{contagens.conc}</span>}</button>
                <button onClick={() => setStatusFilter('CANCELLED')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${statusFilter === 'CANCELLED' ? 'bg-rose-600 text-white shadow-lg' : 'text-rose-600 hover:bg-rose-100'}`}>Cancelados {contagens.canc > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${statusFilter === 'CANCELLED' ? 'bg-white/20' : 'bg-rose-500/15'}`}>{contagens.canc}</span>}</button>
                <button onClick={() => setStatusFilter('REFUNDED')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 flex items-center gap-2 ${statusFilter === 'REFUNDED' ? 'bg-indigo-600 text-white shadow-lg' : 'text-indigo-600 hover:bg-indigo-100'}`}>Devolvidos {contagens.dev > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${statusFilter === 'REFUNDED' ? 'bg-white/20' : 'bg-indigo-500/15'}`}>{contagens.dev}</span>}</button>
            </div>

            {/* Date Filter */}
            <div className="flex flex-wrap bg-[var(--bg-main)] rounded-xl p-1 border border-[var(--border-color)] w-full md:w-auto gap-1.5 items-center">
                <button onClick={() => setDateFilter('ALL')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${dateFilter === 'ALL' ? 'bg-[var(--text-main)] text-[var(--bg-card)]' : 'text-[var(--text-muted)] hover:bg-slate-100'}`}>Todas</button>
                <button onClick={() => setDateFilter('TODAY')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${dateFilter === 'TODAY' ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-100'}`}>Hoje</button>
                <button onClick={() => setDateFilter('YESTERDAY')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${dateFilter === 'YESTERDAY' ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-100'}`}>Ontem</button>
                <button onClick={() => setDateFilter('WEEK')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${dateFilter === 'WEEK' ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-100'}`}>Semana</button>
                <button onClick={() => setDateFilter('MONTH')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${dateFilter === 'MONTH' ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-100'}`}>Mês</button>
                {/* Vendas de UM DIA ESPECÍFICO: escolhe a data e clica em "Dia" */}
                <input
                    type="date"
                    value={specificDate}
                    onChange={e => { setSpecificDate(e.target.value); if (e.target.value) setDateFilter('DAY'); }}
                    title="Ver as vendas de um dia específico"
                    className="px-2 py-1.5 rounded-lg text-[10px] font-black bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-main)] outline-none focus:border-emerald-500 shrink-0 cursor-pointer"
                />
                <button onClick={() => setDateFilter('DAY')} className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${dateFilter === 'DAY' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-600 hover:bg-emerald-100'}`}>Dia</button>
            </div>

            {/* Sort Order */}
            <button
                onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${sortOrder === 'newest' ? 'bg-[var(--text-main)] text-[var(--bg-card)]' : 'bg-[var(--bg-main)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}
            >
                <Clock size={14}/> {sortOrder === 'newest' ? 'Mais Recentes' : 'Mais Antigas'}
            </button>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex bg-[var(--bg-main)] rounded-xl p-1 border border-[var(--border-color)]">
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' && !agruparPorDia ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:bg-slate-100'}`}><Grid size={20}/></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' && !agruparPorDia ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:bg-slate-100'}`}><List size={20}/></button>
            </div>

            {/* Agrupar por Dia */}
            <button
                onClick={() => setAgruparPorDia(s => !s)}
                title="Agrupar pedidos por dia (listagem compacta)"
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${agruparPorDia ? 'bg-blue-600 text-white shadow-lg' : 'bg-[var(--bg-main)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-slate-100'}`}
            >
                <CalendarDays size={14}/> Por Dia
            </button>

            {/* Export Button */}
            <button
                onClick={exportOrdersToCSV}
                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600"
            >
                <Download size={14}/> Exportar
            </button>
        </div>
      </div>

      {/* Resumo do recorte atual: quantos pedidos e quanto somou */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] rounded-2xl px-4 sm:px-6 py-3 sm:py-4 shadow-sm">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Resultado:</span>
        <span className="text-sm font-black text-[var(--text-main)]">{resumoFiltro.qtd} pedido(s)</span>
        <span className="text-lg font-black text-emerald-600 tracking-tighter">
          R$ {resumoFiltro.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
        {agruparPorDia && gruposPorDia.length > 0 && (
          <span className="text-lg font-black text-blue-600 tracking-tighter">
            {gruposPorDia.length} dia(s)
          </span>
        )}
        {dateFilter === 'DAY' && specificDate && (
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
            Vendas do dia {new Date(specificDate + 'T12:00:00').toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>

      {/* Search Input */}
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-[var(--bg-card)] p-2.5 rounded-2xl border-2 border-[var(--border-color)] group-focus-within:border-emerald-500 transition-all duration-300 z-10 shadow-sm">
          <Search className="text-[var(--text-muted)] group-focus-within:text-emerald-600 transition-colors" size={20} />
        </div>
        <input
          className="w-full pl-20 pr-4 py-5 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-[3rem] text-sm font-black text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] placeholder:font-medium uppercase tracking-[0.2em] shadow-inner"
          placeholder="PESQUISAR POR NOME, CPF OU CÓDIGO DO PEDIDO..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Orders Grid/List */}
      {agruparPorDia ? (
        <div className="space-y-8">
          {gruposPorDia.length === 0 ? (
            <div className="col-span-full py-20 text-center opacity-70">
              <ShoppingCart size={80} className="mx-auto mb-4"/>
              <p className="font-black uppercase tracking-[0.4em]">Nenhum pedido encontrado</p>
            </div>
          ) : gruposPorDia.map(grupo => (
            <div key={grupo.key} className="bg-[var(--bg-card)] rounded-[3rem] border-2 border-[var(--border-color)] shadow-sm overflow-hidden">
              <div className="px-4 sm:px-7 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-main)] border-b-2 border-[var(--border-color)]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-600/10 text-blue-600 border border-blue-500/30">
                    <CalendarDays size={20}/>
                  </div>
                  <div>
                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest">
                      {grupo.key === 'sem-data' ? 'Sem data registrada' : new Date(grupo.key + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                    <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide">{grupo.items.length} pedido(s)</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-0.5">Total do dia</p>
                  <p className="text-xl font-black text-emerald-600 tracking-tighter">R$ {grupo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              <div className="divide-y divide-[var(--border-color)]">
                {grupo.items.map(order => (
                  <div key={order.id} className="px-4 sm:px-7 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-[var(--bg-main)] transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStatusColor(order.status)}`}>
                          {translateStatus(order.status)}
                        </span>
                        <span className="text-[10px] font-black text-[var(--text-muted)] font-mono">#{String(order.id || 'sem-id').slice(-8).toUpperCase()}</span>
                        <span className="text-[11px] font-black text-[var(--text-main)] uppercase tracking-tight truncate">{order.userName || 'Não identificado'}</span>
                        {order.inmateName && <span className="text-[10px] font-bold text-slate-500 uppercase truncate"><ShieldCheck size={11} className="inline mr-1"/>{order.inmateName}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] font-bold text-[var(--text-muted)]">
                          <Clock size={11} className="inline mr-1"/> {order.date ? toDate(order.date)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '—' : '—'}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">CPF: {order.userCpf || '—'}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <p className="text-base font-black text-[var(--text-main)] tracking-tighter">R$ {(Number(order.total) || 0).toFixed(2).replace('.', ',')}</p>
                      <button onClick={() => setViewingReceipt({ data: order, type: 'ORDER' })} className="flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-colors shrink-0 min-h-[40px]" title="Ver Comprovante de Pagamento"><Eye size={16}/> Comprovante</button>
                      <button onClick={() => setSelectedOrderDetails(order)} className="px-4 py-2.5 min-h-[40px] bg-emerald-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow hover:bg-emerald-600 active:scale-95 transition-all flex items-center gap-2 touch-target">
                        Detalhes <ArrowRight size={14}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6' : 'bg-[var(--bg-card)] rounded-[3rem] border-2 border-[var(--border-color)] shadow-sm overflow-hidden'}>
        {filteredOrders.length === 0 ? (
          <div className="col-span-full py-20 text-center opacity-70">
            <ShoppingCart size={80} className="mx-auto mb-4"/>
            <p className="font-black uppercase tracking-[0.4em]">Nenhum pedido encontrado</p>
          </div>
        ) : filteredOrders.map(order => (
          <div key={order.id} className={`transition-all group relative overflow-hidden flex flex-col p-4 md:p-6 ${viewMode === 'grid' ? 'bg-[var(--bg-card)] rounded-[3rem] shadow-sm border-2 border-[var(--border-color)] hover:shadow-xl hover:-translate-y-2' : 'border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-main)]'}`}>

            {/* Cabeçalho: código + status à esquerda, data/hora discreta à direita */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <span className="font-mono font-bold text-slate-700 text-sm tracking-tight">#{String(order?.id || 'sem-id').slice(-8).toUpperCase()}</span>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${getStatusColor(order.status)}`}>
                {translateStatus(order.status)}
              </span>
              {order.date && (
                <span className="text-xs text-slate-400 ml-auto flex items-center gap-1.5">
                  <Clock size={14}/> {toDate(order.date)?.toLocaleDateString('pt-BR')} · {toDate(order.date)?.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                </span>
              )}
            </div>

            {/* Corpo: dados de entrega em grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Familiar Responsável */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] shrink-0 group-hover:bg-emerald-500/10 group-hover:text-emerald-600 transition-colors">
                  <UserCheck size={24}/>
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Familiar Responsável</p>
                  <h4 className="text-[15px] font-black text-[var(--text-main)] uppercase tracking-tight truncate">{order?.userName || 'Não identificado'}</h4>
                  <p className="text-[10px] font-mono text-[var(--text-muted)] font-bold mt-0.5">CPF: {order?.userCpf || '—'}</p>
                </div>
              </div>

              {/* Destino / Interno */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 group-hover:border-emerald-500/50 transition-all">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <ShieldCheck size={14}/> Destino / Interno
                </p>
                <h5 className="text-[13px] font-black text-slate-900 uppercase truncate tracking-tight">{order.inmateName || 'GERAL / CDP'}</h5>
                {order.inmateLocation && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {[order.inmateLocation.raio || order.inmateLocation.ray, order.inmateLocation.ala || order.inmateLocation.wing, order.inmateLocation.cela || order.inmateLocation.cell].some(v => v) && (
                      <>
                        <span className="px-2 py-1 bg-slate-100 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 uppercase tracking-tighter shadow-sm">
                          {[order.inmateLocation.raio || order.inmateLocation.ray, order.inmateLocation.ala || order.inmateLocation.wing, order.inmateLocation.cela || order.inmateLocation.cell].filter(v => v).join(' - ')}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Rodapé: valor à esquerda + ações padronizadas à direita */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-4 mt-2 gap-3 w-full">
              <div className="w-full sm:w-auto flex items-center justify-between sm:flex-col sm:items-start gap-1">
                <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Valor Total</p>
                <h3 className="text-2xl font-black text-[var(--text-main)] tracking-tighter tabular-nums">
                  <span className="text-xs opacity-75 mr-1">R$</span>
                  {(Number(order.total) || 0).toFixed(2).replace('.', ',')}
                </h3>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                <button onClick={() => setPrintOrder(order)} className="p-2.5 min-h-[40px] min-w-[40px] bg-slate-50 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center shrink-0" title="Imprimir Cupom 80mm"><Printer size={18}/></button>
                <button onClick={() => setViewingReceipt({ data: order, type: 'ORDER' })} className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[40px] bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition-colors shrink-0" title="Ver Comprovante de Pagamento"><Eye size={16}/> Comprovante</button>
                <button onClick={() => setSelectedOrderDetails(order)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[40px] bg-sky-50 border border-sky-200 text-sky-700 text-xs font-bold rounded-xl hover:bg-sky-100 transition-colors shrink-0">
                  Detalhes <ArrowRight size={14}/>
                </button>
                {/* Aprovação/Rejeição para Pendentes — mesma altura e raio dos demais */}
                {isPending(order.status) && (aprovarId === order.id ? (
                  <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[40px] bg-emerald-600/60 text-white text-xs font-bold rounded-xl pointer-events-none">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Aprovando...
                  </div>
                ) : (
                  <button onClick={() => setConfirmarAprovId(order.id)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[40px] bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors shrink-0">
                    <CheckCircle size={16}/> Aprovar
                  </button>
                ))}
                {isPending(order.status) && (
                  <button onClick={() => setSelectedOrderDetails(order)} className="flex items-center justify-center gap-1.5 px-3 py-2.5 min-h-[40px] bg-rose-500 text-white text-xs font-bold rounded-xl hover:bg-rose-600 transition-colors shrink-0">
                    <XCircle size={16}/> Rejeitar
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {loadMoreOrders && orders.length >= (ordersLimit || 50) && (
        <div className="flex justify-center mt-8 pb-10">
          <button
            onClick={loadMoreOrders}
            className="px-10 py-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] text-[var(--text-main)] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all shadow-sm active:scale-95"
          >
            Carregar Mais Pedidos
          </button>
        </div>
      )}

      {confirmarAprovErro && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1200] bg-rose-600 text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl animate-fadeIn">
          {confirmarAprovErro}
          <button onClick={() => setConfirmarAprovErro('')} className="ml-4 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      <ConfirmacaoDestrutiva
        isOpen={confirmarAprovId !== null}
        titulo="Confirmar Recebimento"
        descricao={(() => {
          const alvo = (orders || []).find(o => o.id === confirmarAprovId);
          return alvo
            ? `O pagamento de R$ ${(Number(alvo.total) || 0).toFixed(2).replace('.', ',')} do pedido #${(alvo.id || '').slice(0, 8).toUpperCase()} de ${alvo.userName || '—'} será aprovado e a compra concluída nos registros.`
            : 'O pagamento será aprovado e a compra concluída nos registros.';
        })()}
        palavraChave={undefined}
        semDigitar
        processando={aprovarId !== null}
        onConfirm={() => {
          const alvo = (orders || []).find(o => o.id === confirmarAprovId);
          if (alvo) handleQuickApprove(alvo);
        }}
        onClose={() => { if (!aprovarId) setConfirmarAprovId(null); }}
      />
    </div>
  );
};
