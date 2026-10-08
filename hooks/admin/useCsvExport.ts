import { useCallback } from 'react';
import { buildSalesCsv } from '../../utils/contabil';

interface UseCsvExportOptions {
  orders: any[];
  users: any[];
  ordersLimit: number;
  showNotification: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export function useCsvExport({ orders, users, ordersLimit, showNotification }: UseCsvExportOptions) {
  const handleExportExcel = useCallback(async () => {
    try {
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 30);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = today.toISOString().split('T')[0];
      
      const csv = await buildSalesCsv(orders, [], startDateStr, endDateStr);
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vendas_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification(`CSV gerado com sucesso!`, 'success');
    } catch (e: any) {
      showNotification('Erro ao gerar CSV: ' + e.message, 'error');
    }
  }, [orders, showNotification]);

  return { handleExportExcel };
}