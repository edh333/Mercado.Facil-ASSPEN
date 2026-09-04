import React from 'react';
import {
  ShoppingCart, Search, Grid, List, Clock, Printer, FileText, DollarSign, ArrowRight, UserCheck, ShieldCheck, Download, XCircle, CheckCircle
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/StoreContext';
import { Order, OrderStatus } from '../../types';
import { getLocalDateStr } from './adminUtils';
import { toDate } from '../../utils/dateUtils';

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
}

export const AdminOrdersTab: React.FC<AdminOrdersTabProps> = ({
  orders, searchTerm, setSearchTerm, viewMode, setViewMode,
  translateStatus, getStatusColor, setSelectedOrderDetails,
  setPrintOrder, setViewingReceipt, loadMoreOrders
}) => {
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [dateFilter, setDateFilter] = React.useState<string>('ALL');
  const [specificDate, setSpecificDate] = React.useState<string>(getLocalDateStr());
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest');
  const { colors } = useTheme();
  const { aprovarPedido, showNotification } = useApp();

  // Aprovação direta pelo card: valida comprovante, pede confirmação e
  // finaliza a compra em um clique — sem reabrir a janela de detalhes.
  const handleQuickApprove = async (order: Order) => {
    const temComprovante = order.paymentMethod === 'WALLET' ||
      !!(order.paymentProofUrl && order.paymentProofUrl !== 'PENDENTE_UPLOAD_LOCAL_CACHE');
    if (!temComprovante) {
      showNotification('Pedido sem comprovante de pagamento. Abra em Detalhes para anexar antes de aprovar.', 'error');
      return;
    }
    if (!window.confirm(`Aprovar e FINALIZAR o pedido #${(order.id || '').slice(0, 8).toUpperCase()} de ${order.userName || '—'}?\n\nO pagamento será aprovado e a compra concluída.`)) return;
    try {
      await aprovarPedido(order.id, true);
      showNotification('Pedido aprovado e finalizado com sucesso!', 'success');
    } catch (e: any) {
      showNotification(e?.message || 'Erro ao aprovar o pedido.', 'error');
    }
  };

  const filteredOrders = React.useMemo(() => {
    const termoLower = (searchTerm || '').toLowerCase();
    const termoUpper = (searchTerm || '').toUpperCase();
    const norm = (s: string) => String(s || '').toLowerCase();
    const isPending = (status: string) => ['pendente', 'pending_payment', 'pending', 'pago_pendente'].includes(norm(status));
    const isPaid = (status: string) => ['paid', 'delivered', 'preparing', 'out_for_delivery', 'approved', 'entregue', 'preparando'].includes(norm(status));
    const isCancelled = (status: string) => ['cancelled', 'cancelado', 'cancelada'].includes(norm(status));
    const isRefunded = (status: string) => ['refunded', 'devolvido', 'reembolsado'].includes(norm(status));

    // Fuso local (BRT): toISOString virava "amanhã" após as 21h.
    const today = getLocalDateStr();
    const yesterday = getLocalDateStr(new Date(Date.now() - 86400000));
    const thisWeek = getLocalDateStr(new Date(Date.now() - 7 * 86400000));
    const thisMonth = getLocalDateStr(new Date(Date.now() - 30 * 86400000));

    return (orders || []).filter(o => {
      const orderDate = o.createdAt || o.date || '';
      const orderDateStr = orderDate.split('T')[0];

      const matchesSearch = (o.userName || '').toLowerCase().includes(termoLower) ||
        (o.inmateName || '').toLowerCase().includes(termoLower) ||
        (o.userCpf || '').includes(searchTerm || '') ||
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
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 bg-[var(--bg-card)] p-8 rounded-[3rem] border-2 border-[var(--border-color)] shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500 rounded-full blur-[60px] -ml-16 -mt-16 opacity-10"></div>

        <div className="relative z-10">
          <h2 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3 tracking-tight">
            <ShoppingCart size={28} className="text-emerald-500"/> Controle de Pedidos
          </h2>
          <p className="text-sm font-medium text-[var(--text-muted)] mt-1 ml-1">Monitoramento em Tempo Real de Vendas</p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 w-full xl:w-auto relative z-10">
            {/* Status Filter Toggle */}
            <div className="flex bg-[var(--bg-main)] rounded-2xl p-1.5 border border-[var(--border-color)] w-full md:w-auto overflow-x-auto custom-scrollbar gap-1">
                <button onClick={() => setStatusFilter('ALL')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${statusFilter === 'ALL' ? 'bg-[var(--text-main)] text-[var(--bg-card)] shadow-lg' : 'text-[var(--text-muted)] hover:bg-slate-100'}`}>Tudo</button>
                <button onClick={() => setStatusFilter('PENDING')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${statusFilter === 'PENDING' ? 'bg-amber-500 text-white shadow-lg ring-2 ring-amber-300' : 'text-amber-600 hover:bg-amber-100'}`}>Pendentes</button>
                <button onClick={() => setStatusFilter('PAID')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${statusFilter === 'PAID' ? 'bg-emerald-600 text-white shadow-lg' : 'text-emerald-600 hover:bg-emerald-100'}`}>Concluidos</button>
                <button onClick={() => setStatusFilter('REFUNDED')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${statusFilter === 'REFUNDED' ? 'bg-indigo-600 text-white shadow-lg' : 'text-indigo-600 hover:bg-indigo-100'}`}>Devolvidos</button>
            </div>

            {/* Date Filter */}
            <div className="flex bg-[var(--bg-main)] rounded-xl p-1 border border-[var(--border-color)] w-full md:w-auto overflow-x-auto custom-scrollbar gap-1 items-center">
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
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:bg-slate-100'}`}><Grid size={20}/></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:bg-slate-100'}`}><List size={20}/></button>
            </div>

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
      <div className="flex flex-wrap items-center gap-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] rounded-2xl px-6 py-4 shadow-sm">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Resultado:</span>
        <span className="text-sm font-black text-[var(--text-main)]">{resumoFiltro.qtd} pedido(s)</span>
        <span className="text-lg font-black text-emerald-600 tracking-tighter">
          R$ {resumoFiltro.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
        {dateFilter === 'DAY' && specificDate && (
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
            Vendas do dia {new Date(specificDate + 'T12:00:00').toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>

      {/* Search Input */}
      <div className="relative group">
        <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-[var(--bg-card)] p-3 rounded-2xl border-2 border-[var(--border-color)] group-focus-within:border-emerald-500 transition-all duration-300 z-10 shadow-sm">
          <Search className="text-[var(--text-muted)] group-focus-within:text-emerald-600 transition-colors" size={22} />
        </div>
        <input
          className="w-full pl-24 pr-8 py-6 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-[3rem] text-sm font-black text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] placeholder:font-medium uppercase tracking-[0.2em] shadow-inner"
          placeholder="PESQUISAR POR NOME, CPF OU CODIGO DO PEDIDO..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Orders Grid/List */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'bg-[var(--bg-card)] rounded-[3rem] border-2 border-[var(--border-color)] shadow-sm overflow-hidden'}>
        {filteredOrders.length === 0 ? (
          <div className="col-span-full py-20 text-center opacity-70">
            <ShoppingCart size={80} className="mx-auto mb-4"/>
            <p className="font-black uppercase tracking-[0.4em]">Nenhum pedido encontrado</p>
          </div>
        ) : filteredOrders.map(order => (
          <div key={order.id} className={`transition-all group relative overflow-hidden ${viewMode === 'grid' ? 'bg-[var(--bg-card)] rounded-[3rem] shadow-sm border-2 border-[var(--border-color)] hover:shadow-xl hover:-translate-y-2 p-8 flex flex-col' : 'flex flex-col sm:flex-row sm:items-center p-8 gap-8 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-main)]'}`}>

{/* Status Indicator (Grid Top) */}
            <div className="flex justify-between items-start mb-6">
              <div className="px-4 py-1.5 bg-[var(--bg-main)] rounded-xl border-2 border-[var(--border-color)] shadow-inner">
                <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest leading-none mb-1">Cod. Pedido</p>
                <p className="text-xs font-black text-[var(--text-main)] font-mono tracking-tighter">#{(order?.id || 'sem-id').slice(-8).toUpperCase()}</p>
              </div>
              <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border ${getStatusColor(order.status)}`}>
                {translateStatus(order.status)}
              </span>
            </div>

            <div className="flex-1 space-y-6">
              {/* Customer Info */}
              <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--bg-main)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-muted)] shrink-0 group-hover:bg-emerald-500/10 group-hover:text-emerald-600 transition-colors">
                      <UserCheck size={24}/>
                  </div>
                  <div className="min-w-0">
                      <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Familiar Responsavel</p>
                      <h4 className="text-[15px] font-black text-[var(--text-main)] uppercase tracking-tight truncate">{order?.userName || 'Não identificado'}</h4>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] font-bold">CPF: {order?.userCpf || '—'}</p>
                  </div>
              </div>

              {/* Inmate Info */}
              <div className="bg-white p-5 rounded-[2rem] border border-slate-200 group-hover:border-emerald-500/50 transition-all">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <ShieldCheck size={14}/> Destino / Interno
                  </p>
                  <h5 className="text-[13px] font-black text-slate-900 uppercase truncate tracking-tight">{order.inmateName || 'GERAL / CDP'}</h5>
{order.inmateLocation && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {[order.inmateLocation.raio || order.inmateLocation.ray, order.inmateLocation.ala || order.inmateLocation.wing, order.inmateLocation.cela || order.inmateLocation.cell].some(v => v) && (
                          <>
                            {[order.inmateLocation.raio || order.inmateLocation.ray, order.inmateLocation.ala || order.inmateLocation.wing, order.inmateLocation.cela || order.inmateLocation.cell].filter(v => v).length >= 2 ? (
                              <span className="px-2 py-1 bg-slate-100 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 uppercase tracking-tighter shadow-sm">
                                {(order.inmateLocation.raio || order.inmateLocation.ray) && `RAIO: ${order.inmateLocation.raio || order.inmateLocation.ray}`}
                                {(order.inmateLocation.raio || order.inmateLocation.ray) && (order.inmateLocation.ala || order.inmateLocation.wing) && ' | '}
                                {(order.inmateLocation.ala || order.inmateLocation.wing) && `ALA: ${order.inmateLocation.ala || order.inmateLocation.wing}`}
                                {(order.inmateLocation.ala || order.inmateLocation.wing) && (order.inmateLocation.cela || order.inmateLocation.cell) && ' | '}
                                {(order.inmateLocation.cela || order.inmateLocation.cell) && `CELA: ${order.inmateLocation.cela || order.inmateLocation.cell}`}
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-slate-100 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 uppercase tracking-tighter shadow-sm">
                                {[order.inmateLocation.raio || order.inmateLocation.ray, order.inmateLocation.ala || order.inmateLocation.wing, order.inmateLocation.cela || order.inmateLocation.cell].filter(v => v).join(' - ')}
                              </span>
                            )}
                          </>
                        )}
                    </div>
                  )}
              </div>

              {/* Date & Time */}
              <div className="flex items-center gap-3 pl-2">
                <Clock size={16} className="text-[var(--text-muted)]"/>
                <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">
                  {order.date ? toDate(order.date)?.toLocaleDateString('pt-BR') || '' : '—'} <span className="mx-2 text-[var(--text-muted)]">|</span> {order.date ? toDate(order.date)?.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) || '' : '—'}
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 pt-6 border-t border-[var(--border-color)] relative z-10">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div>
                  <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Valor Total</p>
                  <h3 className="text-2xl font-black text-[var(--text-main)] tracking-tighter">
                    <span className="text-xs opacity-75 mr-1">R$</span>
                    {(Number(order.total) || 0).toFixed(2).replace('.', ',')}
                  </h3>
                </div>
                <div className="flex space-x-2 flex-wrap gap-y-2">
                  <button onClick={() => setPrintOrder(order)} className="p-4 min-h-[44px] min-w-[44px] bg-[var(--bg-main)] text-[var(--text-muted)] hover:bg-slate-100 hover:text-[var(--text-main)] rounded-2xl border border-[var(--border-color)] shadow-sm active:scale-95 transition-all flex items-center justify-center" title="Imprimir Cupom 80mm"><Printer size={22}/></button>
                  <button onClick={() => setViewingReceipt({ data: order, type: 'ORDER' })} className="p-4 min-h-[44px] min-w-[44px] bg-[var(--bg-main)] text-[var(--text-muted)] hover:bg-emerald-50 hover:text-emerald-600 rounded-2xl border border-[var(--border-color)] shadow-sm active:scale-95 transition-all flex items-center justify-center" title="Ver Recibo Digital"><FileText size={22}/></button>
                  <button onClick={() => setSelectedOrderDetails(order)} className="px-6 py-4 min-h-[44px] bg-emerald-500 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-emerald-600 active:scale-95 transition-all flex items-center gap-2 touch-target">
                    Detalhes <ArrowRight size={16}/>
                  </button>
                </div>
              </div>
              {/* Botões de Aprovação/Rejeição para Pedidos Pendentes - Sempre visíveis no mobile */}
              {order.status === 'Pendente' || order.status === 'pending_payment' || order.status === 'pending' ? (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setSelectedOrderDetails(order)} className="py-3 min-h-[48px] bg-rose-500 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-rose-600 active:scale-95 transition-all flex items-center justify-center gap-2 touch-target">
                    <XCircle size={18}/> Rejeitar
                  </button>
                  <button onClick={() => handleQuickApprove(order)} className="py-3 min-h-[48px] bg-emerald-600 text-white font-bold rounded-2xl text-[10px] uppercase tracking-widest shadow-lg hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 touch-target">
                    <CheckCircle size={18}/> Aprovar e Finalizar
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {loadMoreOrders && filteredOrders.length >= 50 && (
        <div className="flex justify-center mt-8 pb-10">
          <button
            onClick={loadMoreOrders}
            className="px-10 py-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] text-[var(--text-main)] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all shadow-sm active:scale-95"
          >
            Carregar Mais Pedidos
          </button>
        </div>
      )}
    </div>
  );
};
