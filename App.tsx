import React from 'react';
import { StoreProvider, useApp } from './context/StoreContext';
import { UserRole } from './types';
import { NotificationSystem } from './components/NotificationSystem';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { verificarBackupAutomatico } from './utils/backupUtils';
import { iniciarManutencaoAutomatica, lerUltimoRelatorio } from './utils/maintenanceService';
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
import { WrongAppScreen } from './components/WrongAppScreen';

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

// Usuário com cadastro ainda não aprovado (status 'pending'): não deve
// navegar pelo app, mas também não pode ficar preso num loop de login.
const PendingScreen: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#f8fafc' }}>
    <div className="w-full max-w-sm text-center bg-white rounded-3xl border border-slate-200 p-10 shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-amber-100 mx-auto mb-5 flex items-center justify-center">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
      <h1 className="text-lg font-black tracking-tight text-slate-900">CADASTRO EM ANÁLISE</h1>
      <p className="text-sm text-slate-500 mt-3 leading-relaxed">
        Seu cadastro foi enviado e aguarda aprovação da administração.
        Quando liberado, você já poderá acessar o aplicativo normalmente.
      </p>
      <button
        onClick={onLogout}
        className="mt-8 w-full py-3.5 rounded-2xl bg-slate-900 text-white font-black text-[11px] uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95"
      >
        Sair
      </button>
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

  // AUTO-MANUTENÇÃO: roda ao abrir (1x/dia o ciclo pesado) e re-verifica a
  // cada 6h enquanto o sistema estiver aberto. Autolimpeza + quarentena de
  // JSON corrompido + diagnóstico de saúde, sem intervenção humana.
  React.useEffect(() => {
    let parar: (() => void) | undefined;
    try {
      parar = iniciarManutencaoAutomatica();
      const r = lerUltimoRelatorio();
      if (r?.avisos.length) console.warn('[Manutenção] Avisos do sistema:', r.avisos);
    } catch {
      /* manutenção nunca deve derrubar o app */
    }
    return () => parar?.();
  }, []);

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
  // App instalado como "usuário" (/?mode=user): o app tem público exclusivo —
  // somente usuários comuns entram (um ADMIN recebe a tela de restrição e usa
  // o App Admin, instalado à parte).
  const modoUsuario = urlParams.get('mode') === 'user';
  // App ADMINISTRADOR (exe/PWA admin, ?mode=admin): nunca passa pela Landing
  // de marketing — o operador quer o painel (login de admin direto). Antes
  // abria na página pública e parecia "app quebrado/tela não condizente".
  const modoAdmin = urlParams.get('mode') === 'admin';

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
    // Landing pública estilo ASSPEN; PWA do usuário (/?mode=user) abre direto o login;
    // app ADMIN (/?mode=admin) abre direto no LOGIN DO PAINEL ADMIN (nunca na Landing
    // de marketing — antes o operador via "tela estranha/em branco" e achava quebrado).
    return <Landing skipLanding={modoUsuario || modoAdmin} initialTab={modoAdmin ? 'admin' : 'login'} />;
  }

  // APPS COM PÚBLICO EXCLUSIVO (desktop/PWA instalado com modo fixo):
  //  - App Usuário  (?mode=user)  → APENAS usuários comuns entram;
  //  - App Admin     (?mode=admin) → APENAS administradores entram.
  // A cada um funciona independente do outro: um ADMIN que abre o App Usuário
  // (ou vice-versa) vê a tela de restrição em vez de outro painel. O toUserRole
  // normaliza 'admin'/'master' → UserRole.ADMIN, então o teste abaixo cobre os dois.
  const ehAdmin = currentUser.role === UserRole.ADMIN;
  if (modoUsuario && ehAdmin) {
    return <WrongAppScreen appAberto="usuario" />;
  }
  if (modoAdmin && !ehAdmin) {
    return <WrongAppScreen appAberto="admin" />;
  }

  if (!ehAdmin) {
    const pendente = currentUser.status === 'pending' || currentUser.approved === false;
    return (
      <ErrorBoundary>
        {pendente ? <PendingScreen onLogout={logout} /> : <UserDashboard />}
      </ErrorBoundary>
    );
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
