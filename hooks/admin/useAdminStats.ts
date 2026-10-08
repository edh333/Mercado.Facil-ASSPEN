import { useMemo } from 'react';
import { Order, Expense, WalletTransaction, User, UserRole } from '../../types';
import { toDate } from '../../utils/dateUtils';
import { ehReceita } from '../../components/admin/adminUtils';

// Normaliza status para comparação consistente
const normStatus = (status: string | undefined): string => String(status || '').toLowerCase();

export function useAdminStats(
  orders: Order[],
  expenses: Expense[],
  walletTx: WalletTransaction[],
  users: User[],
  filteredOrdersForHome: Order[]
) {
  const stats = useMemo(() => {
    const totalEntries = (orders || []).filter(o => ehReceita(o.status)).reduce((a, b) => a + (Number(b.total) || 0), 0);
    const totalExits = (expenses || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const pendingOrders = (orders || []).filter(o => ['pending', 'pendente'].includes(normStatus(o.status))).length;
    const pendingDeposits = (walletTx || []).filter(tx => tx.status === 'pending').length;
    const pendingUsersCount = (users || []).filter(u => !u.approved && u.role === UserRole.FAMILY).length;

    const salesTotal = filteredOrdersForHome.reduce((a, b) => a + (Number(b.total) || 0), 0);
    const ordersCount = filteredOrdersForHome.length;
    const activeUsers = (users || []).filter(u => u.role === UserRole.FAMILY && u.status === 'active').length;

    return {
      totalIn: totalEntries,
      totalOut: totalExits,
      pendingOrders,
      pendingDeposits,
      activeUsers,
      salesTotal,
      ordersCount,
      pendingUsersCount,
    };
  }, [orders, expenses, walletTx, users, filteredOrdersForHome]);

  return { stats };
}

export function useChartData(orders: Order[]) {
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'short' });
      const dayOrders = (orders || []).filter(o => {
        if (!o.date) return false;
        try {
          const od = toDate(o.date); if (!od) return false;
          return od.getDate() === d.getDate() && od.getMonth() === d.getMonth() && !['cancelled', 'cancelado'].includes(normStatus(o.status));
        } catch (e) { return false; }
      });
      const total = dayOrders.reduce((acc, o) => acc + (Number(o.total) || 0), 0);
      data.push({ name: dateStr, vendas: total });
    }
    return data;
  }, [orders]);

  return { chartData };
}

export function usePendingCounts(orders: Order[], walletTx: WalletTransaction[], users: User[]) {
  const orderPendingCount = useMemo(() => {
    return (orders || []).filter(o => ['pending', 'pendente'].includes(normStatus(o.status))).length;
  }, [orders]);

  const depositPendingCount = useMemo(() => {
    return (walletTx || []).filter(tx => tx.status === 'pending').length;
  }, [walletTx]);

  const pendingUsersCount = useMemo(() => {
    return (users || []).filter(u => !u.approved && u.role === UserRole.FAMILY).length;
  }, [users]);

  return { orderPendingCount, depositPendingCount, pendingUsersCount };
}