import React, { Suspense, lazy } from 'react';
import { StoreProvider, useApp } from './context/StoreContext';
import { Login } from './pages/Login';
import { UserRole } from './types';
import { NotificationSystem } from './components/NotificationSystem';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { verificarBackupAutomatico } from './utils/backupUtils';
import { useMaintenance } from './hooks/useMaintenance';
import { MaintenanceScreen, MaintenanceBanner } from './components/MaintenanceScreen';

const UserDashboard = lazy(() => import('./pages/UserDashboard').then(m => ({ default: m.UserDashboard })));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const PrintPage = lazy(() => import('./components/PrintPage').then(m => ({ default: m.PrintPage })));

const FullScreenLoader: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f8fafc' }}>
    <div className="text-center animate-pulse">
      <div className="w-16 h-16 bg-slate-200 rounded-3xl mx-auto mb-6 flex items-center justify-center">
        <Loader2 size={32} className="text-emerald-500 animate-spin" />
      </div>
      <div className="h-4 bg-slate-200 rounded w-48 mx-auto mb-3" />
      <div className="h-3 bg-slate-100 rounded w-32 mx-auto" />
    </div>
  </div>
);

const MainApp: React.FC = () => {
  const { currentUser, authLoading, logout } = useApp();

  React.useEffect(() => {
    if (currentUser?.role === UserRole.ADMIN) {
      try {
        verificarBackupAutomatico();
      } catch {
        /* backup automático falhou — ignora */
      }
    }
  }, [currentUser]);

  const urlParams = new URLSearchParams(window.location.search);
  const isPrint =
    urlParams.get('print') === 'true' ||
    window.location.pathname.startsWith('/print');

  if (isPrint) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <div className="print-mode-root bg-white min-h-screen">
          <PrintPage />
          <style>{`body { background: white !important; } #root { height: 100%; }`}</style>
        </div>
      </Suspense>
    );
  }

  if (authLoading) {
    return <FullScreenLoader />;
  }

  if (!currentUser) {
    return <Login />;
  }

  if (currentUser.role !== UserRole.ADMIN) {
    return (
      <Suspense fallback={<FullScreenLoader />}>
        <UserDashboard />
      </Suspense>
    );
  }

  // Modo manutenção: só afeta ADMINS. Quem desativou (ou o master) continua
  // operando e vê a faixa de reativação; usuários comuns nunca são bloqueados.
  const { maintenance, loading: maintenanceLoading, inativo, podeOperar, reativar } = useMaintenance(currentUser);
  if (maintenanceLoading) {
    return <FullScreenLoader />;
  }
  if (inativo && !podeOperar) {
    return <MaintenanceScreen maintenance={maintenance} userName={currentUser.name || ''} onLogout={logout} />;
  }

  // Administrador logado SEMPRE acessa o painel administrativo,
  // independentemente do modo de instalação do PWA (modo usuário ou admin).
  return (
    <>
      <NotificationSystem />
      <ErrorBoundary>
        {inativo && podeOperar && <MaintenanceBanner maintenance={maintenance} onReativar={reativar} />}
        <Suspense fallback={<FullScreenLoader />}>
          <AdminDashboard />
        </Suspense>
      </ErrorBoundary>
    </>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <ThemeProvider>
        <MainApp />
        <style>{`
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
          html { font-size: 100%; scroll-behavior: smooth; }
          body { font-family: 'Inter', 'Plus Jakarta Sans', sans-serif; -webkit-font-smoothing: antialiased; background-color: var(--bg-main, #f8fafc); color: var(--text-main, #1e293b); margin: 0; padding: 0; overflow-x: hidden; }
          input, select, textarea { font-family: inherit; }
          button { font-family: inherit; cursor: pointer; min-height: 44px; min-width: 44px; }
          @media (max-width: 768px) { html { font-size: 95%; } }
        `}</style>
      </ThemeProvider>
    </StoreProvider>
  );
}
