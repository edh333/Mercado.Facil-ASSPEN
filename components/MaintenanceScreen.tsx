import React from 'react';
import { Lock, LogOut, Power, AlertTriangle } from 'lucide-react';
import { MaintenanceState } from '../hooks/useMaintenance';

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Tela de bloqueio exibida apenas para ADMINS quando o sistema está inativo. */
export const MaintenanceScreen: React.FC<{
  maintenance: MaintenanceState;
  userName: string;
  onLogout: () => void;
}> = ({ maintenance, userName, onLogout }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-slate-800 border border-slate-700 rounded-lg mx-auto mb-6 flex items-center justify-center">
          <Lock size={36} className="text-amber-400" />
        </div>
        <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">
          Sistema temporariamente inativo
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          O acesso administrativo foi pausado. Os pedidos e vendas dos clientes continuam funcionando normalmente.
        </p>
        {maintenance.motivo && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 mb-4">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Motivo</p>
            <p className="text-slate-200 text-sm whitespace-pre-wrap">{maintenance.motivo}</p>
          </div>
        )}
        <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-4 mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Desativado</p>
          <p className="text-slate-200 text-sm">
            {maintenance.desativadoPorNome || 'Administrador'}
            {maintenance.desativadoEm ? ` em ${formatDateTime(maintenance.desativadoEm)}` : ''}
          </p>
        </div>
        <p className="text-slate-500 text-xs mb-4">
          {userName ? `Sessão: ${userName}` : ''} — Se isso for um erro, fale com o administrador responsável.
        </p>
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition-colors"
        >
          <LogOut size={16} /> Sair da conta
        </button>
      </div>
    </div>
  );
};

/** Faixa exibida ao admin que desativou (ou master): aviso + botão reativar. */
export const MaintenanceBanner: React.FC<{
  maintenance: MaintenanceState;
  onReativar: () => void;
}> = ({ maintenance, onReativar }) => {
  return (
    <div className="sticky top-0 z-50 w-full bg-amber-400 border-b-2 border-amber-500 px-3 py-2 flex items-center gap-2 flex-wrap">
      <AlertTriangle size={16} className="text-amber-900 shrink-0" />
      <div className="flex-1 min-w-[200px]">
        <p className="text-xs font-black text-amber-950 uppercase tracking-wide">
          Sistema desativado para outros administradores
        </p>
        <p className="text-[11px] text-amber-900 leading-tight truncate">
          {maintenance.motivo
            ? `Motivo: ${maintenance.motivo}`
            : 'Nenhum motivo informado'}
          {maintenance.desativadoEm ? ` · Desde ${formatDateTime(maintenance.desativadoEm)}` : ''}
        </p>
      </div>
      <button
        onClick={onReativar}
        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-50 text-xs font-bold transition-colors"
      >
        <Power size={13} /> Reativar sistema
      </button>
    </div>
  );
};
