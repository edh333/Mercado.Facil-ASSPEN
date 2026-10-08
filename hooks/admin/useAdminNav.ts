import { useCallback, useMemo } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { isMaster } from '../../components/admin/adminUtils';

export function useAdminNav(currentUser: any) {
  const { role: userRole, loading: roleLoading } = usePermissions(currentUser?.id);
  const isMasterUser = isMaster(currentUser);

  const hasPermission = useCallback((perm: string) => {
    if (isMasterUser) return true;
    // Operador de caixa (vendedor): acesso fixo ao PDV e operação própria.
    if (userRole === 'operator') {
      return ['sales', 'orders', 'products', 'cash'].includes(perm);
    }
    const perms = currentUser?.permissions;
    if (perms === undefined) return true; // admin legado (sem campo) = acesso total
    if (perms.includes('all')) return true;
    return perms.includes(perm);
  }, [isMasterUser, userRole, currentUser?.permissions]);

  const canAccessTab = useCallback((tab: string) => {
    const tabPermissions: Record<string, string> = {
      'orders': 'orders',
      'products': 'products',
      'cash': 'cash',
      'inmates': 'inmates',
      'users': 'users',
      'finance': 'finance',
      'wallet': 'wallet',
      'reports': 'reports',
      'customers': 'finance',
      'messages': 'users',
      'stock_alerts': 'products',
      'bi': 'reports',
      'settings': '',
      'maintenance': '',
      'audit': 'finance',
    };
    const needPerm = tabPermissions[tab];
    const masterOnly = tab in tabPermissions && tabPermissions[tab] === '';
    return masterOnly ? (isMasterUser || userRole === 'admin') : (!needPerm || hasPermission(needPerm));
  }, [isMasterUser, userRole, hasPermission]);

  return { isMaster: isMasterUser, userRole, roleLoading, hasPermission, canAccessTab };
}