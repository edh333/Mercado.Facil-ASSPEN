import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, DollarSign, Receipt, ShoppingBag, Calendar, Download,
  ArrowUpRight, ArrowDownRight, Package, CreditCard, Wallet, Banknote,
  PieChart as PieChartIcon, RefreshCcw, Sparkles
} from 'lucide-react';
import { Order } from '../../types';
import { mascararCpf } from '../../utils';
import { toDate } from '../../utils/dateUtils';
import { getLocalDateStr } from './adminUtils';
import { ChartMount } from '../ui/ChartMount';
import { useRecharts, RechartsSkeleton } from '../../utils/rechartsLoader';
import { db } from '../../firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

interface AdminSalesDashboardProps {
  orders: Order[];
  onExportCsv?: (startDate: string, endDate: string) => void;
  showNotification?: (msg: string, type?: 'success' | 'error') => void;
}

type Periodo = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v: number) => v.toLocaleString('pt-BR');

const CANCELADOS = ['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'rejeitado'];

const LABELS_PAGAMENTO: Record<string, string> = {
  PIX: 'PIX', WALLET: 'Carteira', CASH: 'Dinheiro', CARD: 'Cartão', MIXED: 'Misto', FIADO: 'Fiado',
};
const CORES_PAGAMENTO: Record<string, string> = {
  PIX: '#10b981', Carteira: '#8b5cf6', Dinheiro: '#f59e0b', Cartão: '#3b82f6', Misto: '#06b6d4', Fiado: '#ef4444',
};
const PALETA = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#ef4444', '#ec4899', '#14b8a6'];

// Cor DETERMINÍSTICA por método (sem Math.random: cores não podem "trocar" a cada render).
const corMetodo = (method: string) =>
  CORES_PAGAMENTO[method] || PALETA[[...String(method)].reduce((acc, c) => acc + c.charCodeAt(0), 0) % PALETA.length];

const getRange = (p: Periodo, customStart?: string, customEnd?: string) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  if (p === 'today') return { start: hoje, end: fim, label: 'Hoje' };
  if (p === 'yesterday') {
    const start = new Date(hoje); start.setDate(hoje.getDate() - 1);
    const end = new Date(fim); end.setDate(fim.getDate() - 1);
    return { start, end, label: 'Ontem' };
  }
  if (p === '7d') { const s = new Date(hoje); s.setDate(hoje.getDate() - 6); return { start: s, end: fim, label: 'Últimos 7 dias' }; }
  if (p === '30d') { const s = new Date(hoje); s.setDate(hoje.getDate() - 29); return { start: s, end: fim, label: 'Últimos 30 dias' }; }
  if (p === 'month') return { start: new Date(hoje.getFullYear(), hoje.getMonth(), 1), end: fim, label: 'Este mês' };
  const s = customStart ? new Date(customStart + 'T00:00:00') : hoje;
  const e = customEnd ? new Date(customEnd + 'T23:59:59.999') : fim;
  return { start: s, end: e, label: 'Personalizado' };
};

export const AdminSalesDashboard: React.FC<AdminSalesDashboardProps> = ({ orders, onExportCsv, showNotification }) => {
  const [periodo, setPeriodo] = useState<Periodo>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [topLimit, setTopLimit] = useState(5);

  // recharts é carregado sob demanda (só quem abre o dash admin baixa ~395 kB).
  const RC = useRecharts();
  const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } = (RC || {}) as any;

  const range = useMemo(() => getRange(periodo, customStart, customEnd), [periodo, customStart, customEnd]);

  // BUSCA PRÓPRIA POR PERÍODO: o prop `orders` do contexto é limitado aos
  // últimos 50 pedidos — com 2.000 vendas/mês os totais/gráficos ficariam
  // ERRADOS. Aqui a aba de vendas consulta o Firestore diretamente com a
  // janela do período selecionado (folga p/ janela anterior e merges),
  // deduplica por id e só recorre ao prop se a consulta falhar (offline).
  const [pedidosPeriodo, setPedidosPeriodo] = useState<Order[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let canc = false;
    const LIMITES: Record<Periodo, number> = { today: 1500, yesterday: 1500, '7d': 2000, '30d': 4500, month: 4500, custom: 5000 };
    const alvo = LIMITES[periodo] || 3000;
    setCarregando(true);
    const q = query(
      collection(db, 'orders'),
      where('createdAt', '<=', range.end.toISOString()),
      orderBy('createdAt', 'desc'),
      limit(alvo)
    );
    getDocs(q)
      .then((snap) => {
        if (canc) return;
        setPedidosPeriodo(snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)));
      })
      .catch(() => {
        if (canc) return;
        setPedidosPeriodo(null);
      })
      .finally(() => { if (!canc) setCarregando(false); });
    return () => { canc = true; };
  }, [periodo, range.start.getTime(), range.end.getTime()]);

  const pedidosBase = useMemo(() => {
    if (!pedidosPeriodo) return orders || [];
    const mapa = new Map<string, Order>();
    pedidosPeriodo.forEach((o) => mapa.set(String(o.id), o));
    (orders || []).forEach((o) => { if (!mapa.has(String(o.id))) mapa.set(String(o.id), o); });
    return Array.from(mapa.values());
  }, [pedidosPeriodo, orders]);

  const vendasPeriodo = useMemo(() => (pedidosBase || []).filter(o => {
    if (CANCELADOS.includes(String(o.status || '').toLowerCase())) return false;
    if (o.deleted) return false;
      const raw = o.createdAt || o.date;
      if (!raw) return false;
      const d = toDate(raw);
      if (!d) return false;
      return d >= range.start && d <= range.end;
  }), [pedidosBase, range]);

  const vendasAnterior = useMemo(() => {
    const dias = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1);
    const prevEnd = new Date(range.start); prevEnd.setDate(prevEnd.getDate() - 1); prevEnd.setHours(23, 59, 59, 999);
    const prevStart = new Date(range.start); prevStart.setDate(prevStart.getDate() - dias); prevStart.setHours(0, 0, 0, 0);
    return (pedidosBase || []).filter(o => {
      if (CANCELADOS.includes(String(o.status || '').toLowerCase())) return false;
      if (o.deleted) return false;
      const raw = o.createdAt || o.date;
      if (!raw) return false;
      const d = toDate(raw);
      if (!d) return false;
      return d >= prevStart && d <= prevEnd;
    });
  }, [pedidosBase, range]);

  const totals = useMemo(() => {
    const receita = vendasPeriodo.reduce((a, o) => a + (Number(o.total) || 0), 0);
    const receitaAnt = vendasAnterior.reduce((a, o) => a + (Number(o.total) || 0), 0);
    const itens = vendasPeriodo.reduce((a, o) => a + (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);
    const itensAnt = vendasAnterior.reduce((a, o) => a + (o.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0), 0);
    const ticket = vendasPeriodo.length > 0 ? receita / vendasPeriodo.length : 0;
    const ticketAnt = vendasAnterior.length > 0 ? receitaAnt / vendasAnterior.length : 0;
    const deltas = (atual: number, ant: number) => ant > 0 ? ((atual - ant) / ant) * 100 : (atual > 0 ? 100 : 0);
    return {
      receita, receitaAnt, itens, itensAnt, ticket, ticketAnt,
      deltaReceita: deltas(receita, receitaAnt),
      deltaVendas: deltas(vendasPeriodo.length, vendasAnterior.length),
      deltaItens: deltas(itens, itensAnt),
      deltaTicket: deltas(ticket, ticketAnt),
    };
  }, [vendasPeriodo, vendasAnterior]);

  const porDia = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    const inicio = new Date(range.start);
    const fim = new Date(range.end);
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      map.set(d.toLocaleDateString('pt-BR'), { total: 0, count: 0 });
    }
    vendasPeriodo.forEach(o => {
      const d = toDate(o.createdAt || o.date);
      const key = d?.toLocaleDateString('pt-BR') || '';
      const e = map.get(key);
      if (e) { e.total += Number(o.total) || 0; e.count += 1; }
    });
    return Array.from(map.entries()).map(([date, v]) => ({ date: date.slice(0, 5), total: Math.round(v.total * 100) / 100, count: v.count }));
  }, [vendasPeriodo, range]);

  const porPagamento = useMemo(() => {
    const map = new Map<string, number>();
    vendasPeriodo.forEach(o => {
      const payments = (o as any).payments;
      if (Array.isArray(payments) && payments.length > 0) {
        payments.forEach((p: { method: string; amount: number }) => {
          const label = LABELS_PAGAMENTO[p.method] || p.method || 'Outros';
          map.set(label, (map.get(label) || 0) + (Number(p.amount) || 0));
        });
      } else {
        const label = LABELS_PAGAMENTO[o.paymentMethod || ''] || o.paymentMethod || 'Outros';
        map.set(label, (map.get(label) || 0) + (Number(o.total) || 0));
      }
    });
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([method, amount]) => ({ method, amount: Math.round(amount * 100) / 100, color: corMetodo(method) }));
  }, [vendasPeriodo]);

  const topProdutos = useMemo(() => {
    const map = new Map<string, { qtd: number; fat: number; name: string }>();
    vendasPeriodo.forEach(o => {
      (o.items || []).forEach(i => {
        const nome = i.name || i.description || i.productId || 'Item sem nome';
        const cur = map.get(nome) || { qtd: 0, fat: 0, name: nome };
        cur.qtd += Number(i.quantity) || 0;
        cur.fat += (Number(i.quantity) || 0) * (Number(i.priceAtPurchase) || 0);
        map.set(nome, cur);
      });
    });
    const arr = Array.from(map.values()).sort((a, b) => b.fat - a.fat);
    const max = arr.length > 0 && arr[0].fat > 0 ? arr[0].fat : 1;
    return arr.slice(0, topLimit).map((p, i) => {
      const pct = Math.round((p.fat / max) * 100);
      return { ...p, i, pct: Number.isFinite(pct) ? pct : 0 };
    });
  }, [vendasPeriodo, topLimit]);

  // Dias com venda efetiva + aviso quando período longo excede a tabela (60 linhas).
  const diasComVenda = porDia.filter(d => d.count > 0);
  const diasTruncados = diasComVenda.length > 60;

  const exportCsv = () => {
    if (onExportCsv) {
      onExportCsv(getLocalDateStr(range.start), getLocalDateStr(range.end));
      return;
    }
    const linhas = vendasPeriodo.map(o => {
      const d = toDate(o.createdAt || o.date)?.toLocaleDateString('pt-BR') || '';
      const pag = (o as any).payments?.map((p: any) => `${LABELS_PAGAMENTO[p.method] || p.method}:${Number(p.amount).toFixed(2).replace('.', ',')}`).join(' | ') || LABELS_PAGAMENTO[o.paymentMethod || ''] || o.paymentMethod || '';
      return `"${d}";"${String(o.id || '').toUpperCase()}";"${String(o.userName || o.inmateName || '').replace(/"/g, '""')}";"${mascararCpf(o.userCpf || o.inmateCpf || '')}";"${pag}";"${Number(o.total).toFixed(2).replace('.', ',')}"`;
    });
    if (linhas.length === 0) {
      showNotification?.('Nenhuma venda no período selecionado.', 'error');
      return;
    }
    const cab = '"DATA";"PEDIDO";"CLIENTE";"CPF";"PAGAMENTO";"TOTAL"';
    const blob = new Blob(['\ufeff' + [cab, ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas-${getLocalDateStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification?.(`CSV com ${linhas.length} vendas exportado com sucesso!`, 'success');
  };

  const Delta = ({ value }: { value: number }) => (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-black ${value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
      {value >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );

  const CardMetrica = ({ icon, label, value, delta, sub }: { icon: React.ReactNode; label: string; value: string; delta?: number; sub?: string }) => (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2.5 rounded-2xl bg-slate-100">{icon}</div>
        {delta !== undefined && <Delta value={delta} />}
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tight mt-1">{value}</p>
      {sub && <p className="text-[10px] font-bold text-slate-400 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6 animate-slideUp pb-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl text-white shadow-lg shadow-emerald-500/30">
            <Sparkles size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Painel de Vendas</h2>
            <p className="text-[11px] font-bold text-slate-500">{range.label} · {vendasPeriodo.length} venda(s) · {fmt(totals.receita)}</p>
            {carregando && (
              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                <RefreshCcw size={10} className="animate-spin" /> Sincronizando período...
              </p>
            )}
          </div>
        </div>
        <button
          onClick={exportCsv}
          className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-black uppercase text-[9px] tracking-[0.2em] hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95"
        >
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      {/* Periodo */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: 'today', label: 'Hoje' },
            { id: 'yesterday', label: 'Ontem' },
            { id: '7d', label: '7 dias' },
            { id: '30d', label: '30 dias' },
            { id: 'month', label: 'Este mês' },
            { id: 'custom', label: 'Personalizado' },
          ] as { id: Periodo; label: string }[]).map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${periodo === p.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 mt-4 animate-fadeIn">
            <Calendar size={16} className="text-slate-400" />
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-4 py-2.5 bg-slate-100 border-2 border-slate-200 focus:border-emerald-500 rounded-xl font-black text-xs text-slate-900 outline-none" />
            <span className="text-slate-400 font-black text-xs">até</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-4 py-2.5 bg-slate-100 border-2 border-slate-200 focus:border-emerald-500 rounded-xl font-black text-xs text-slate-900 outline-none" />
          </div>
        )}
      </div>

      {/* Metricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CardMetrica icon={<DollarSign size={20} className="text-emerald-600" />} label="Faturamento" value={fmt(totals.receita)} delta={totals.deltaReceita} sub={totals.receitaAnt > 0 ? `Período anterior: ${fmt(totals.receitaAnt)}` : 'Sem período anterior'} />
        <CardMetrica icon={<Receipt size={20} className="text-blue-600" />} label="Nº de Vendas" value={fmtNum(vendasPeriodo.length)} delta={totals.deltaVendas} sub={`${fmtNum(vendasAnterior.length)} no anterior`} />
        <CardMetrica icon={<ShoppingBag size={20} className="text-purple-600" />} label="Itens Vendidos" value={fmtNum(totals.itens)} delta={totals.deltaItens} sub={`${fmtNum(totals.itensAnt)} no anterior`} />
        <CardMetrica icon={<TrendingUp size={20} className="text-amber-600" />} label="Ticket Médio" value={fmt(totals.ticket)} delta={totals.deltaTicket} sub={totals.ticketAnt > 0 ? `Anterior: ${fmt(totals.ticketAnt)}` : 'Sem anterior'} />
      </div>

      {/* Graficos principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp size={20} className="text-emerald-500" />
            <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Faturamento por Dia</h3>
          </div>
          {porDia.length === 0 || vendasPeriodo.length === 0 || !RC ? (
            <div className="h-72 flex items-center justify-center">
              {!RC ? <RechartsSkeleton minHeight={288} label="Carregando gráfico..." /> : <span className="text-slate-400 font-bold text-sm">Nenhum dado no período</span>}
            </div>
          ) : (
            <ChartMount minHeight={300}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={porDia} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} />
                  <Tooltip
                    formatter={(value: any) => [fmt(Number(value)), 'Faturamento']}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} fill="url(#gradReceita)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartMount>
          )}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <PieChartIcon size={20} className="text-emerald-500" />
            <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Formas de Pagamento</h3>
          </div>
          {porPagamento.length === 0 || !RC ? (
            <div className="h-72 flex items-center justify-center">
              {!RC ? <RechartsSkeleton minHeight={240} label="Carregando gráfico..." /> : <span className="text-slate-400 font-bold text-sm">Nenhum dado no período</span>}
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ChartMount minHeight={240}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={porPagamento} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={4} dataKey="amount" nameKey="method">
                      {porPagamento.map((e, i) => <Cell key={i} fill={e.color} stroke="#fff" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip formatter={(value: any) => [fmt(Number(value)), 'Valor']} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartMount>
              <div className="flex flex-wrap justify-center gap-4 mt-3">
                {porPagamento.map((e, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color }} />
                    <span className="text-[11px] font-bold text-slate-600">{e.method}</span>
                    <span className="text-[10px] font-black text-slate-900">{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top produtos + detalhamento */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Package size={20} className="text-emerald-500" />
              <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Top Produtos</h3>
            </div>
            <select
              value={topLimit}
              onChange={e => setTopLimit(Number(e.target.value))}
              className="px-3 py-2 bg-slate-100 rounded-xl font-black text-[10px] text-slate-600 uppercase border-2 border-slate-200 focus:border-emerald-500 outline-none"
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
            </select>
          </div>
          {topProdutos.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-400 font-bold text-sm">Sem produtos vendidos no período</div>
          ) : (
            <div className="space-y-4">
              {topProdutos.map(p => (
                <div key={p.i}>
                  <div className="flex items-center justify-between mb-1.5 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-lg text-[9px] font-black flex items-center justify-center shrink-0" style={{ backgroundColor: PALETA[p.i % PALETA.length] + '22', color: PALETA[p.i % PALETA.length] }}>{p.i + 1}º</span>
                      <span className="font-bold text-xs text-slate-700 truncate uppercase">{p.name}</span>
                    </div>
                    <span className="font-black text-xs text-slate-900 shrink-0">{fmt(p.fat)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, p.pct)}%`, backgroundColor: PALETA[p.i % PALETA.length] }} />
                    </div>
                    <span className="text-[9px] font-black text-slate-400 shrink-0 w-20 text-right">{fmtNum(p.qtd)} un</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <RefreshCcw size={20} className="text-emerald-500" />
            <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Detalhamento Diário</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Data</th>
                  <th className="pb-3 pr-4 text-right">Vendas</th>
                  <th className="pb-3 pr-4 text-right">Faturamento</th>
                  <th className="pb-3 pr-4 text-right">Ticket Médio</th>
                  <th className="pb-3 text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {diasComVenda.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-slate-400 font-bold">Nenhuma venda no período</td></tr>
                ) : (() => {
                  let acum = 0;
                  return diasComVenda.slice(0, 60).map((row, i) => {
                    acum += row.total;
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4 font-bold text-slate-800">{row.date}</td>
                        <td className="py-3 pr-4 text-right font-bold text-slate-800">{row.count}</td>
                        <td className="py-3 pr-4 text-right font-black text-emerald-600">{fmt(row.total)}</td>
                        <td className="py-3 pr-4 text-right font-bold text-slate-600">{row.count > 0 ? fmt(row.total / row.count) : '—'}</td>
                        <td className="py-3 text-right font-black text-slate-900">{fmt(acum)}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          {diasTruncados && (
            <p className="mt-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Exibindo os 60 primeiros dias com vendas — total: {diasComVenda.length} dia(s) no período.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};