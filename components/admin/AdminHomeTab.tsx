import React from 'react';
import { ehReceita } from './adminUtils';
import {
  Users, ShoppingCart, DollarSign, ArrowDownCircle,
  Zap, ArrowRight,
  BarChart3, TrendingUp, Award, PackageX, Plus, Banknote, Printer
} from 'lucide-react';
import { OrderStatus, WalletTransaction } from '../../types';
import { ChartMount } from '../ui/ChartMount';
import { useRecharts, RechartsSkeleton } from '../../utils/rechartsLoader';
import { useTheme } from '../../context/ThemeContext';
import { formatarMoeda } from '../../utils';
import { toDate } from '../../utils/dateUtils';

interface AdminHomeTabProps {
  stats: {
    totalIn: number;
    totalOut: number;
    pendingOrders: number;
    pendingDeposits: number;
    salesTotal: number;
    ordersCount: number;
    pendingUsersCount: number;
  };
  chartData: any[];
  isMaster: boolean;
  setActiveTab: (tab: string) => void;
  setShowProductModal: (show: boolean) => void;
  filterType: string;
  orders: any[];
  products?: any[];
  walletTx: WalletTransaction[];
  onSelectTransaction: (tx: WalletTransaction) => void;
  onOpenSales: () => void;
  onOpenShortcuts?: () => void;
}

export const AdminHomeTab: React.FC<AdminHomeTabProps> = ({
  stats, chartData, isMaster, setActiveTab, setShowProductModal, filterType, orders,
  products = [], walletTx, onSelectTransaction, onOpenSales, onOpenShortcuts
}) => {
  const { colors } = useTheme();

  // recharts é carregado sob demanda (só quem abre o dash admin baixa ~395 kB).
  const RC = useRecharts();
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip: RechartsTooltip, ResponsiveContainer } = (RC || {}) as any;

  // ── TOP 5 PRODUTOS MAIS VENDIDOS ─────────────────────────────
  const topProducts = React.useMemo(() => {
    const map: Record<string, { name: string; qty: number; total: number }> = {};
    (orders || []).forEach(order => {
      // Top 5 deve refletir apenas vendas que são receita (ehReceita) — mesmo
      // conceito dos cards, Financeiro e do Resumo de Hoje. Antes contava
      // pedidos CANCELADOS/estornados como se tivessem saído do estoque.
      if (!ehReceita(order.status)) return;
      (order.items || []).forEach((item: any) => {
        const key = item?.productId || item?.name || 'unknown';
        if (!map[key]) map[key] = { name: item?.name || item?.productId || 'Produto sem nome', qty: 0, total: 0 };
        map[key].qty += item?.quantity || 1;
        map[key].total += (item?.priceAtPurchase || item?.price || 0) * (item?.quantity || 1);
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [orders]);

  // ── PRODUTOS COM ESTOQUE CRITICO (<=5) ────────────────────────
  const criticalStock = React.useMemo(() =>
    (products || []).filter(p => p.stock !== undefined && p.stock <= 5 && p.stock > 0)
      .sort((a, b) => a.stock - b.stock).slice(0, 5),
  [products]);

  const zeroStock = React.useMemo(() => (products || []).filter(p => p.stock !== undefined && p.stock <= 0).length, [products]);

  // ── RESUMO DO DIA — VENDAS POR FORMA DE PAGAMENTO (HOJE) ───────────
  const todayPayments = React.useMemo(() => {
    const label: Record<string, string> = { PIX: 'PIX', CASH: 'Dinheiro', CARD: 'Cartão', WALLET: 'Carteira', FIADO: 'Fiado', MIXED: 'Misto' };
    // Receita = mesma definição dos cards e do Financeiro (ehReceita).
    // Antes contava pedidos PENDENTES como dinheiro que já entrou.
    const validStatus = (s?: string) => ehReceita(s);
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const map: Record<string, { label: string; amount: number }> = {};
    let total = 0;
    (orders || []).forEach(o => {
      const d = toDate(o.date);
      if (!d || d < startToday || d > endToday || !validStatus(o.status)) return;
      const splits = Array.isArray(o.payments) && o.payments.length ? o.payments : [{ method: o.paymentMethod || 'PIX', amount: Number(o.total) || 0 }];
      splits.forEach((s: any) => {
        const m = String(s.method || 'PIX').toUpperCase();
        if (!map[m]) map[m] = { label: label[m] || m, amount: 0 };
        map[m].amount += Number(s.amount) || 0;
      });
      total += Number(o.total) || 0;
    });
    return { rows: Object.entries(map).map(([k, v]) => ({ method: k, ...v })).sort((a, b) => b.amount - a.amount), total };
  }, [orders]);

  const pendingTx = (walletTx || []).filter(tx => tx.status === 'pending');

  return (
    <div className="space-y-3.5 animate-slideUp pb-20">
      {/* BARRA DE ATALHOS RÁPIDOS OPERACIONAIS */}
      <div className="flex flex-wrap items-center gap-2.5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-3 shadow-sm">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-1"><Zap size={10} className="inline-block mr-1 -mt-0.5 text-amber-500" />Ações Rápidas</span>
        <button
          onClick={onOpenSales}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <Zap size={14} /> PDV - NOVA VENDA (F2)
        </button>
        <button
          onClick={() => setActiveTab('finance')}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <Banknote size={14} /> REGISTRAR DESPESA (F6)
        </button>
        <button
          onClick={() => setActiveTab('reports')}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <Printer size={14} /> ABRIR RELATÓRIOS (F4)
        </button>
        {onOpenShortcuts && (
          <button
            onClick={onOpenShortcuts}
            className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-all active:scale-95 cursor-pointer ml-auto"
          >
            <Zap size={14} className="text-amber-600" /> ATALHOS (?)
          </button>
        )}
      </div>

      {/* RESUMO DO DIA — VENDAS POR FORMA DE PAGAMENTO */}
      <div className="flex flex-wrap items-center gap-2.5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-3 shadow-sm">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mr-1"><TrendingUp size={10} className="inline-block mr-1 -mt-0.5 text-emerald-500" />Vendas de Hoje</span>
        {todayPayments.rows.length === 0 ? (
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nenhuma venda registrada ainda</span>
        ) : (
          <>
            {todayPayments.rows.map((r, ri) => (
              <span key={r.method} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-black text-slate-700">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#10b981', '#6366f1', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'][ri % 6] }}></span>
                {r.label}: <span className="text-emerald-600">{formatarMoeda(r.amount)}</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5 bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-[10px] font-black shadow-sm ml-auto">
              Total: {formatarMoeda(todayPayments.total)}
            </span>
          </>
        )}
      </div>

      {/* Quick Access Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {[
            { tab: 'finance', icon: DollarSign, label: 'Financeiro', color: 'var(--primary-color)' },
            { tab: 'product_modal', icon: Plus, label: 'Novo Item', color: '#8b5cf6' },
            { tab: 'orders', icon: ShoppingCart, label: 'Pedidos', color: '#3b82f6' },
            { tab: 'reports', icon: BarChart3, label: 'Relatórios', color: '#f59e0b' },
            { tab: 'users', icon: Users, label: 'Familiares', color: '#6366f1' }
          ].map((btn, i) => (
            <button
              key={i}
              onClick={() => {
                if (btn.tab === 'product_modal') setShowProductModal(true);
                else setActiveTab(btn.tab);
              }}
              className="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border-color)] shadow-sm card-hover flex flex-col items-center justify-center gap-3 group active:scale-95"
            >
              <div
                className="p-4 rounded-2xl group-hover:rotate-12 group-hover:scale-110 transition-all shadow-inner"
                style={{ backgroundColor: `${btn.color}20`, color: btn.color }}
              >
                <btn.icon size={22} strokeWidth={2.5}/>
              </div>
              <span className="text-[10px] font-black text-[var(--text-main)] uppercase tracking-[0.2em]">{btn.label}</span>
            </button>
          ))}
      </div>

      {isMaster && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-[var(--border-color)] shadow-sm relative overflow-hidden group card-hover cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary-color)] to-transparent opacity-10"></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-black text-[var(--primary-color)] uppercase tracking-[0.3em] mb-2">Volume Financeiro {filterType === 'day' ? 'Hoje' : 'Período'}</p>
                    <h3 className="text-4xl font-black text-[var(--text-main)] tracking-tighter">R$ {formatarMoeda(stats.salesTotal)}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-[var(--primary-color)] rounded-full animate-pulse"></div>
                        <span className="text-[9px] font-black text-slate-700 uppercase">Processamento Ativo</span>
                    </div>
                </div>
            </div>
            <div className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-[var(--border-color)] shadow-sm relative overflow-hidden group card-hover cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-transparent opacity-10"></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-2">Pedidos Concluídos</p>
                    <h3 className="text-4xl font-black text-[var(--text-main)] tracking-tighter">{stats.ordersCount} <span className="text-sm text-blue-600 opacity-90 uppercase ml-1">Itens</span></h3>
                    <div className="mt-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-[9px] font-black text-slate-700 uppercase">Sincronizado com Nuvem</span>
                    </div>
                </div>
            </div>
            <div onClick={() => setActiveTab('orders')} className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-orange-500/30 shadow-sm flex flex-col justify-between cursor-pointer group card-hover relative overflow-hidden transition-all">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-600 to-transparent opacity-10"></div>
                <div className="relative z-10">
                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.3em] mb-2">Ações Pendentes</p>
                    <h3 className="text-4xl font-black text-[var(--text-main)] tracking-tighter">{stats.pendingOrders + stats.pendingUsersCount}</h3>
                </div>
                <div className="mt-4 flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse shadow-[0_0_8px_#f97316]"></div>
                        <span className="text-[9px] font-black text-slate-700 uppercase">Requer Atenção</span>
                    </div>
                    <div className="w-10 h-10 bg-orange-600 text-white rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.4)] group-hover:scale-110 transition-transform"><Zap size={20}/></div>
                </div>
            </div>
        </div>
      )}

      {/* Mini Trend Chart - Visualização Rápida de Performance */}
      {isMaster && chartData && chartData.length > 0 && !RC && (
        <div className="bg-[var(--bg-card)] p-6 rounded-[2.5rem] border border-[var(--border-color)] shadow-sm animate-fadeIn">
          <RechartsSkeleton minHeight={120} label="Carregando gráfico..." />
        </div>
      )}
      {isMaster && chartData && chartData.length > 0 && RC && (
        <div className="bg-[var(--bg-card)] p-6 rounded-[2.5rem] border border-[var(--border-color)] shadow-sm animate-fadeIn">
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-[var(--primary-color)]" size={18} />
              <p className="text-[10px] font-black text-[var(--text-main)] uppercase tracking-[0.2em]">Tendência de Vendas (Últimos 7 Dias)</p>
            </div>
            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase italic">Visualização de Pico de Movimentação</p>
          </div>
          <ChartMount className="h-24 w-full" minHeight={96}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary-color)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="var(--primary-color)" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" opacity={0.3} />
                <XAxis
                  dataKey="name"
                  hide={true}
                />
                <RechartsTooltip
                  cursor={{fill: 'var(--bg-main)', opacity: 0.4}}
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: 'var(--bg-card)',
                    fontSize: '10px',
                    fontWeight: '900',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Bar
                  dataKey="vendas"
                  fill="url(#colorSales)"
                  radius={[4, 4, 0, 0]}
                  barSize={60}
                />
              </BarChart>
              </ResponsiveContainer>
            </ChartMount>
          </div>
        )}

      {/* Critical Stock Alert - Compact Card */}
      {(criticalStock.length > 0 || zeroStock > 0) && (
        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-red-50 rounded-xl text-red-600 shrink-0"><PackageX size={20}/></div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-900 text-sm uppercase tracking-tight">Alerta de Estoque</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {criticalStock.slice(0, 4).map(p => (
                <span key={p.id} className="px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-red-600 text-[9px] font-black uppercase whitespace-nowrap">
                  {p?.name || 'Produto'} — {p?.stock || 0} un.
                </span>
              ))}
              {criticalStock.length > 4 && (
                <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 text-[9px] font-black uppercase">+{criticalStock.length - 4} mais</span>
              )}
              {zeroStock > 0 && (
                <span className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-[9px] font-black uppercase">{zeroStock} zerados</span>
              )}
            </div>
          </div>
          <button onClick={() => setActiveTab('products')} className="shrink-0 px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all whitespace-nowrap">
            Ver Produtos
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Validation Central */}
        <div className="lg:col-span-3 bg-[var(--bg-card)] p-8 md:p-12 rounded-[3.5rem] shadow-sm border border-[var(--border-color)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--primary-color)] rounded-full blur-[100px] -mr-32 -mt-32 opacity-5"></div>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10 relative z-10">
            <div>
                <h3 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-3 tracking-tight">
                   Central de Validação <span className="text-[var(--primary-color)] font-mono italic">FINANCEIRA</span>
                </h3>
                <p className="text-sm font-medium text-[var(--text-muted)] mt-1">Aprove ou rejeite aportes de crédito de familiares</p>
            </div>
            <div className="bg-[var(--primary-color)] text-white px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg animate-pulse flex items-center gap-2">
              <Zap size={14}/> {pendingTx.length} AGUARDANDO
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 relative z-10">
            {pendingTx.slice(0, 6).map((tx) => (
              <div
                key={tx.id}
                onClick={() => (onSelectTransaction as any)(tx)}
                className="bg-[var(--bg-main)] p-6 rounded-[2.5rem] border-2 border-[var(--border-color)] hover:border-[var(--primary-color)] transition-all flex flex-col justify-between group cursor-pointer shadow-sm hover:shadow-2xl transform hover:-translate-y-2"
              >
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-2xl flex items-center justify-center font-black shadow-inner"><DollarSign size={24}/></div>
                    <div className="text-right">
                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-1">Valor do Aporte</p>
                        <p className="text-2xl font-black text-[var(--text-main)] tracking-tighter font-mono">R$ {formatarMoeda(tx?.amount || 0)}</p>
                    </div>
                  </div>
                  <div className="space-y-4 mb-6">
                    <div className="bg-[var(--bg-card)] p-3 rounded-2xl border border-[var(--border-color)]">
                        <p className="text-[10px] text-[var(--text-muted)] font-black uppercase tracking-widest mb-1">Depositante</p>
                        <p className="font-black text-[var(--text-main)] text-[10px] uppercase truncate">{tx.payerName || 'Visitante'}</p>
                    </div>
                    <div className="bg-indigo-500/5 p-3 rounded-2xl border border-indigo-500/10">
                        <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-1">Destinatário (Interno)</p>
                        <p className="font-black text-indigo-900 dark:text-indigo-300 text-[10px] uppercase truncate">{tx.inmateName || 'N/A'}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 py-3 bg-[var(--primary-color)] rounded-2xl text-white text-[9px] font-black uppercase flex items-center justify-center gap-2 opacity-70 group-hover:opacity-100 transition-all shadow-lg">
                   Validar Agora <ArrowRight size={12}/>
                </div>
              </div>
            ))}
            {pendingTx.length === 0 && (
              <div className="col-span-full py-20 text-center bg-[var(--bg-main)] rounded-[3rem] border-4 border-dashed border-[var(--border-color)]">
                <div className="w-24 h-24 bg-[var(--bg-card)] rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl text-[var(--text-muted)]">
                    <ArrowDownCircle size={48}/>
                </div>
                <p className="text-sm font-black text-slate-800 tracking-wide uppercase">Tudo em dia! Nenhuma validação pendente</p>
              </div>
            )}
          </div>
          {pendingTx.length > 6 && (
            <button onClick={() => setActiveTab('wallet')} className="w-full mt-10 py-5 bg-[var(--text-main)] text-[var(--bg-card)] rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.3em] hover:opacity-90 transition-all shadow-2xl active:scale-95">
              Ver Todas as Pendências Financeiras
            </button>
          )}
        </div>

        {/* Top 5 Products */}
        {isMaster && topProducts.length > 0 && (
          <div className="lg:col-span-1 bg-[var(--bg-card)] p-8 rounded-3xl shadow-sm border border-[var(--border-color)]">
            <h3 className="text-base font-black text-[var(--text-main)] mb-6 flex items-center gap-2 uppercase tracking-tight">
              <Award className="text-amber-500" size={20}/> Top 5 Mais Vendidos
            </h3>
            <div className="space-y-4">
              {topProducts.map((p: any, i: number) => (
                <div key={p?.name || `produto-${i}`} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 ${i === 0 ? 'bg-amber-600' : i === 1 ? 'bg-slate-500' : i === 2 ? 'bg-orange-700' : 'bg-[var(--bg-main)] text-[var(--text-muted)]'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-xs text-[var(--text-main)] uppercase truncate">{p?.name || 'Produto sem nome'}</p>
                    <div className="w-full bg-[var(--bg-main)] rounded-full h-1.5 mt-1">
                      <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (p.qty / (topProducts[0]?.qty || 1)) * 100)}%` }}/>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-[var(--text-main)]">{p.qty} un.</p>
                    <p className="text-[9px] text-[var(--text-muted)] font-bold">R$ {formatarMoeda(p.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sales Chart */}
        {isMaster && chartData && chartData.length > 0 && !RC && (
          <div className={`${topProducts.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'} bg-[var(--bg-card)] p-8 rounded-3xl shadow-sm border border-[var(--border-color)]`}>
            <RechartsSkeleton minHeight={288} label="Carregando gráfico..." />
          </div>
        )}
        {isMaster && chartData && chartData.length > 0 && RC && (
          <div className={`${topProducts.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'} bg-[var(--bg-card)] p-8 rounded-3xl shadow-sm border border-[var(--border-color)]`}>
            <h3 className="text-xl font-bold text-[var(--text-main)] mb-8 flex items-center gap-3 tracking-tight">
              <BarChart3 className="text-blue-500" size={24}/> Fluxo de Vendas
            </h3>
            <ChartMount className="h-72" minHeight={288}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: '900', fill: 'var(--text-main)'}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fontWeight: '900', fill: 'var(--text-main)'}} tickFormatter={(value) => `R$${value}`} />
                  <RechartsTooltip
                    formatter={(value: number) => [`R$ ${formatarMoeda(value)}`, 'Vendas']}
                    cursor={{fill: 'var(--bg-main)'}}
                    contentStyle={{borderRadius: '16px', border: 'none', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px'}}
                  />
                  <Bar dataKey="vendas" fill="var(--primary-color)" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </ChartMount>
          </div>
        )}

        {/* Recent Activity */}
        <div className={`${isMaster ? '' : 'lg:col-span-3'} bg-[var(--bg-card)] p-8 rounded-3xl shadow-sm border border-[var(--border-color)] flex flex-col`}>
          <h3 className="text-lg font-bold text-[var(--text-main)] mb-6 flex items-center gap-2 tracking-tight">
            <Zap size={20} className="text-yellow-500"/> Atividade Recente
          </h3>
          <div className="flex-1 overflow-y-auto space-y-4 max-h-[400px] pr-2 custom-scrollbar">
            {[...(orders || [])].sort((a,b) => {
              const dateA = a?.createdAt || a?.date || '';
              const dateB = b?.createdAt || b?.date || '';
              return (toDate(dateB)?.getTime() || 0) - (toDate(dateA)?.getTime() || 0);
            }).slice(0, 10).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-[var(--bg-main)] rounded-2xl border border-transparent hover:border-[var(--border-color)] transition-all group">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
                    item?.status === 'delivered' || item?.status === 'paid' ? 'bg-emerald-50 text-emerald-600' :
                    item?.status === 'pending' || item?.status === 'pending_payment' ? 'bg-amber-50 text-amber-600' :
                    item?.status === 'cancelled' ? 'bg-red-50 text-red-600' :
                    'bg-[var(--bg-card)] text-[var(--text-muted)] group-hover:text-[var(--primary-color)]'
                  }`}>
                    <ShoppingCart size={18}/>
                  </div>
                  <div>
                    <p className="font-black text-[var(--text-main)] text-xs uppercase tracking-tight">Pedido #{(item.id || '').slice(0,8).toUpperCase()}</p>
                    <p className="text-[10px] text-[var(--text-main)] font-black uppercase opacity-70">
                      {item?.userName || 'Usuário'}
                      {item?.operatorName && <span className="text-[var(--text-muted)] ml-1">• Op: {item.operatorName}</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                    <p className="font-black text-[var(--text-main)] text-xs">R$ {formatarMoeda(Number(item?.total) || 0)}</p>
                    <p className="text-[9px] text-[var(--text-muted)] font-black uppercase">{item?.createdAt || item?.date ? toDate(item?.createdAt || item?.date)?.toLocaleDateString() || '' : '—'}</p>
                </div>
              </div>
            ))}
            {(!orders || orders.length === 0) && (
              <div className="text-center py-10 opacity-70"><ShoppingCart size={40} className="mx-auto mb-2"/><p className="text-xs font-bold uppercase">Sem pedidos</p></div>
            )}
          </div>
          <button onClick={() => setActiveTab('orders')} className="mt-6 w-full py-4 bg-[var(--text-main)] text-[var(--bg-card)] rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg">Ver Todos <ArrowRight size={14}/></button>
        </div>
      </div>
    </div>
  );
};
