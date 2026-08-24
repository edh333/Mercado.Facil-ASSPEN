import React from 'react';
import { StoreProvider, useApp } from './context/StoreContext';
import { UserRole } from './types';
import { NotificationSystem } from './components/NotificationSystem';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { verificarBackupAutomatico } from './utils/backupUtils';
import { useMaintenance } from './hooks/useMaintenance';
import { MaintenanceScreen, MaintenanceBanner } from './components/MaintenanceScreen';

// IMPORTANTE (definitivo — v3): TODAS as telas são carregadas de forma
// EAGER (síncrona), sem lazy() nem Suspense. O erro "Minified React #310"
// (Rendered more hooks...) é um bug do React 19.2.x que dispara EM
// PRODUÇÃO quando um render é interrompido/retentado por ferramentas do
// ecossistema: lazy + Suspense + ErrorBoundary + transições (facebook/react
// #33580). Com zero lazy/Suspense o APP NÃO TEM A CONDIÇÃO para esse bug:
// a árvore inicial nunca é pausada pelo React, e nenhum PC, navegador ou
// filtro de rede consegue mais forçá-la.
import { AdminDashboard } from './pages/AdminDashboard';
import { PrintPage } from './components/PrintPage';
import { UserDashboard } from './pages/UserDashboard';
import { Landing } from './components/Landing';

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

// CRÍTICO — todos os hooks SEMPRE no topo, incondicionais!
// O erro #310 (Rendered more hooks...) disparava porque `useMaintenance`
// ficava DEPOIS dos retornos condicionais: quando o estado de auth mudava
// entre dois renders (loader → admin, login → admin, ou replay de recovery
// do React após um erro), o MainApp renderizava com contagem diferente de
// hooks e o React abortava com #310 exatamente no useState do
// useMaintenance. Com os hooks alinhados, QUALQUER re-render tem SEMPRE a
// mesma sequência — o #310 é impossível de ocorrer aqui.
  const { maintenance, loading: maintenanceLoading, inativo, podeOperar, reativar } = useMaintenance(currentUser);

  const urlParams = new URLSearchParams(window.location.search);
  const isPrint =
    urlParams.get('print') === 'true' ||
    window.location.pathname.startsWith('/print');
  // App instalado como "usuário" (/?mode=user): mesmo um ADMIN deve abrir a
  // frente de caixa do usuário — o admin troca para o painel pelos próprios
  // mecanismos do app (instalação separada do Painel Admin / toggle no site).
  const modoUsuario = urlParams.get('mode') === 'user';

  if (isPrint) {
    return (
      <div className="print-mode-root bg-white min-h-screen">
        <PrintPage />
        <style>{`body { background: white !important; } #root { height: 100%; }`}</style>
      </div>
    );
  }

  if (authLoading) {
    return <FullScreenLoader />;
  }

  if (!currentUser) {
    // Landing pública estilo ASSPEN; PWA do usuário (/?mode=user) abre direto o login.
    return <Landing skipLanding={modoUsuario} />;
  }

  if (currentUser.role !== UserRole.ADMIN || modoUsuario) {
    return <UserDashboard />;
  }

  // Modo manutenção: só afeta ADMINS. Quem desativou (ou o master) continua
  // operando e vê a faixa de reativação; usuários comuns nunca são bloqueados.
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
        <AdminDashboard />
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
