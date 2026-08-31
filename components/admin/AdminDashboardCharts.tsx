import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { Order } from '../../types';
import { toDate } from '../../utils/dateUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { ChartMount } from '../ui/ChartMount';
import { TrendingUp, CreditCard, DollarSign, AlertTriangle, BarChart3, PieChart as PieChartIcon, Loader2 } from 'lucide-react';
import { AdminCapacityPanel } from './AdminCapacityPanel';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

interface PaymentSummary {
  method: string;
  amount: number;
  color: string;
}

interface DailySales {
  date: string;
  total: number;
  count: number;
}

export const AdminDashboardCharts: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [discrepanciesTotal, setDiscrepanciesTotal] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoff = thirtyDaysAgo.toISOString();

        const [activeOrdersSnap, archivedSnapshot, discrepanciesSnap] = await Promise.all([
          getDocs(query(collection(db, 'orders'), where('createdAt', '>=', cutoff), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'historico_geral'), where('origem', '==', 'orders'), where('arquivadoEm', '>=', cutoff), orderBy('arquivadoEm', 'desc'))),
          getDocs(query(collection(db, 'cash_sessions'), where('hasDiscrepancy', '==', true))),
        ]);

        const activeOrders = activeOrdersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
        const archivedOrders = archivedSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));

        const combined = [...activeOrders, ...archivedOrders].filter(o => {
          const raw = o.createdAt || o.date || '';
          if (!raw) return false;
          const d = toDate(raw);
          if (!d) return false;
          return d >= thirtyDaysAgo;
        });

        setAllOrders(combined);

        let discTotal = 0;
        discrepanciesSnap.docs.forEach(d => {
          const data = d.data();
          const diff = data.cashDifference ?? data.balanceDiff ?? 0;
          if (diff < 0) discTotal += Math.abs(diff);
        });
        setDiscrepanciesTotal(discTotal);
      } catch (e) {
        console.error('Erro ao carregar dados do BI:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const dailySales: DailySales[] = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('pt-BR');
      map.set(key, { total: 0, count: 0 });
    }
    allOrders.forEach(o => {
      const raw = o.createdAt || o.date;
      if (!raw) return;
      const d = toDate(raw);
      if (!d) return;
      const key = d.toLocaleDateString('pt-BR');
      if (map.has(key)) {
        const entry = map.get(key)!;
        entry.total += Number(o.total) || 0;
        entry.count += 1;
      }
    });
    return Array.from(map.entries()).map(([date, data]) => ({ date, ...data }));
  }, [allOrders]);

  const paymentBreakdown: PaymentSummary[] = useMemo(() => {
    const map = new Map<string, number>();
    const LABELS: Record<string, string> = {
      PIX: 'PIX',
      WALLET: 'Carteira',
      CASH: 'Dinheiro',
      CARD: 'Cartão',
      MIXED: 'Misto',
    };
    allOrders.forEach(o => {
      const payments = (o as any).payments;
      if (Array.isArray(payments) && payments.length > 0) {
        payments.forEach((p: { method: string; amount: number }) => {
          const label = LABELS[p.method] || p.method;
          map.set(label, (map.get(label) || 0) + (Number(p.amount) || 0));
        });
      } else {
        const method = LABELS[o.paymentMethod || ''] || o.paymentMethod || 'Outros';
        map.set(method, (map.get(method) || 0) + (Number(o.total) || 0));
      }
    });
    const colorMap: Record<string, string> = {
      PIX: '#10b981',
      Carteira: '#8b5cf6',
      Dinheiro: '#f59e0b',
      Cartão: '#3b82f6',
      Misto: '#06b6d4',
    };
    return Array.from(map.entries())
      .filter(([, amount]) => amount > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([method, amount], i) => ({ method, amount, color: colorMap[method] || COLORS[i % COLORS.length] }));
  }, [allOrders]);

  const totalRevenue = useMemo(() => {
    const cancelados = ['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'reembolsado'];
    return allOrders.filter(o => !cancelados.includes(String(o.status || '').toLowerCase())).reduce((a, o) => a + (Number(o.total) || 0), 0);
  }, [allOrders]);
  const totalOrders = allOrders.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const topPayment = paymentBreakdown.length > 0 ? paymentBreakdown[0] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="animate-spin text-emerald-500 mx-auto mb-4" size={40} />
          <p className="text-sm font-black text-slate-500 uppercase tracking-widest">Carregando Dashboard BI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-2">
        <div className="p-3 bg-[var(--primary-color)]/100 rounded-2xl">
          <BarChart3 size={24} className="text-[var(--primary-color)]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard de BI</h2>
          <p className="text-sm text-slate-500 font-semibold">Inteligência de vendas · últimos 30 dias</p>
        </div>
      </div>

      {/* Painel de Capacidade de Atendimento */}
      <AdminCapacityPanel />

      {/* Cards de Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<TrendingUp size={22} />}
          label="Faturamento Total"
          value={fmt(totalRevenue)}
          color="text-[var(--primary-color)]"
          bgColor="bg-[var(--primary-color)]/50"
          borderColor="border-emerald-200"
        />
        <MetricCard
          icon={<DollarSign size={22} />}
          label="Ticket Médio"
          value={fmt(avgTicket)}
          color="text-blue-600"
          bgColor="bg-blue-50"
          borderColor="border-blue-200"
        />
        <MetricCard
          icon={<CreditCard size={22} />}
          label="Meio + Usado"
          value={topPayment ? `${topPayment.method} (${fmt(topPayment.amount)})` : '—'}
          color="text-purple-600"
          bgColor="bg-purple-50"
          borderColor="border-purple-200"
        />
        <MetricCard
          icon={<AlertTriangle size={22} />}
          label="Quebras de Caixa"
          value={fmt(discrepanciesTotal)}
          color={discrepanciesTotal > 0 ? 'text-red-600' : 'text-slate-600'}
          bgColor={discrepanciesTotal > 0 ? 'bg-red-50' : 'bg-slate-50'}
          borderColor={discrepanciesTotal > 0 ? 'border-red-200' : 'border-slate-200'}
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Faturamento Diário */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 size={20} className="text-emerald-500" />
            <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Faturamento Diário</h3>
          </div>
          {dailySales.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-slate-400 font-bold text-sm">Nenhum dado no período</div>
          ) : (
            <ChartMount minHeight={300}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dailySales} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#94a3b8' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: number) => `R$ ${v.toLocaleString('pt-BR')}`} />
                    <Tooltip
                      formatter={(value: number) => [fmt(value), 'Faturamento']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={32}>
                      {dailySales.map((entry, i) => (
                        <Cell key={i} fill={entry.total > 0 ? '#10b981' : '#f1f5f9'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartMount>
          )}
        </div>

        {/* Meios de Pagamento */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <PieChartIcon size={20} className="text-emerald-500" />
            <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Meios de Pagamento</h3>
          </div>
          {paymentBreakdown.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-slate-400 font-bold text-sm">Nenhum dado no período</div>
          ) : (
            <div className="flex flex-col items-center">
              <ChartMount minHeight={260}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={paymentBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="amount"
                      nameKey="method"
                    >
                      {paymentBreakdown.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [fmt(value), 'Valor']}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartMount>
              <div className="flex flex-wrap justify-center gap-4 mt-2">
                {paymentBreakdown.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-[11px] font-bold text-slate-600">{entry.method}</span>
                    <span className="text-[10px] font-black text-slate-900">{fmt(entry.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabela de resumo por dia */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider mb-4">Detalhamento Diário</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">
                <th className="pb-3 pr-4">Data</th>
                <th className="pb-3 pr-4 text-right">Vendas</th>
                <th className="pb-3 pr-4 text-right">Faturamento</th>
                <th className="pb-3 text-right">Ticket Médio</th>
              </tr>
            </thead>
            <tbody>
              {dailySales.filter(d => d.count > 0).slice(0, 30).map((row, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-bold text-slate-800">{row.date}</td>
                  <td className="py-3 pr-4 text-right font-bold text-slate-800">{row.count}</td>
                  <td className="py-3 pr-4 text-right font-black text-[var(--primary-color)]">{fmt(row.total)}</td>
                  <td className="py-3 text-right font-bold text-slate-600">{row.count > 0 ? fmt(row.total / row.count) : '—'}</td>
                </tr>
              ))}
              {dailySales.filter(d => d.count > 0).length === 0 && (
                <tr><td colSpan={4} className="py-10 text-center text-slate-400 font-bold">Nenhuma venda nos últimos 30 dias</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = ({ icon, label, value, color, bgColor, borderColor }) => (
  <div className={`${bgColor} ${borderColor} border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all`}>
    <div className="flex items-center gap-3 mb-3">
      <div className={`${color}`}>{icon}</div>
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{label}</span>
    </div>
    <p className={`text-2xl font-black tracking-tight ${color}`}>{value}</p>
  </div>
);


