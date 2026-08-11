import React, { Suspense, lazy } from 'react';
import { StoreProvider, useApp } from './context/StoreContext';
import { Login } from './pages/Login';
import { UserRole } from './types';
import { NotificationSystem } from './components/NotificationSystem';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { verificarBackupAutomatico } from './utils/backupUtils';

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
  const { currentUser, authLoading } = useApp();

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

  // Administrador logado SEMPRE acessa o painel administrativo,
  // independentemente do modo de instalação do PWA (modo usuário ou admin).
  return (
    <>
      <NotificationSystem />
      <ErrorBoundary>
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
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto:wght@400;500;700&display=swap');
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
