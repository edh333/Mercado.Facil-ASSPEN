import React, { useEffect, useState } from 'react';
import { useApp } from '../context/StoreContext';
import { LogOut, Menu, User as UserIcon, Shield, Phone, Mail, MapPin, Download, AlertCircle, ShoppingBag, X, Sun, Moon, Monitor } from 'lucide-react';
import { ThemeOption, UserRole, SystemRole } from '../types';
import { useTheme } from '../context/ThemeContext';
import { NotificationSystem } from './NotificationSystem';
import { InstallButton } from './InstallButton';
import { AppDownloadButton } from './AppDownloadModal';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { currentUser, logout, appConfig } = useApp();
  const { themeMode, setThemeMode } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [showTrialBanner, setShowTrialBanner] = useState(true);
  const [operatorCartCount, setOperatorCartCount] = useState(0);

  const getTrialDaysRemaining = () => {
    if (!appConfig.activationDate) return 30;
    const activation = new Date(appConfig.activationDate);
    const now = new Date();
    const diffTime = now.getTime() - activation.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const totalDays = 30;
    return Math.max(0, totalDays - diffDays);
  };

  const trialDaysRemaining = getTrialDaysRemaining();
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  useEffect(() => {
    document.title = appConfig.appName || "Gestão Prisional";
  }, [appConfig.appName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTrialBanner(false);
    }, 30000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onCartUpdate = (e: Event) => setOperatorCartCount((e as CustomEvent).detail.count);
    window.addEventListener('opencode:cart-update', onCartUpdate);

    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (e.key === 'F4') { e.preventDefault(); window.dispatchEvent(new CustomEvent('opencode:clear-cart')); }
      if (e.key === 'F7') { e.preventDefault(); window.dispatchEvent(new CustomEvent('opencode:new-sale')); }
      if (e.key === 'F9') { e.preventDefault(); window.dispatchEvent(new CustomEvent('opencode:open-cart')); }
    };
    window.addEventListener('keydown', handleGlobalKeys);

    return () => {
      window.removeEventListener('opencode:cart-update', onCartUpdate);
      window.removeEventListener('keydown', handleGlobalKeys);
    };
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col font-sans transition-colors duration-500"
      style={{ backgroundColor: 'var(--bg-main)' }}
    >
      <NotificationSystem />

      {/* Banner de Ativação Premium */}
      {showTrialBanner && isAdmin && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.15em] z-[60] shadow-lg w-full">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="animate-pulse text-amber-200" />
            <span>Sistema em Modo Demonstração • {trialDaysRemaining} dias restantes • Solicite Ativação</span>
          </div>
          <button
            onClick={() => setShowTrialBanner(false)}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors touch-target font-bold text-[10px]"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* Header Premium com Glassmorphism — usa CSS vars do tema */}
      <header
        className={`shadow-lg sticky top-0 z-[40] transition-all duration-300 w-full backdrop-blur-2xl ${isAdmin ? 'lg:w-[calc(100%-20rem)] lg:ml-auto' : ''}`}
        style={{
          backgroundColor: 'var(--bg-card)',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[var(--primary-color)] rounded-xl shadow-lg" style={{ boxShadow: '0 0 20px var(--primary-color)' }}>
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[13px] md:text-base font-black tracking-tight leading-none text-[var(--text-main)] uppercase">{appConfig.appName}</h1>
                <p className="text-[9px] md:text-[10px] text-[var(--text-muted)] font-bold tracking-widest leading-tight mt-1 max-w-[180px] sm:max-w-[220px] truncate">{appConfig.institutionName || appConfig.appName}</p>
              </div>
            </div>

            {/* Desktop Nav Premium */}
            <div className="hidden md:flex items-center gap-4">
              {currentUser && (
                <div className="flex items-center gap-3 bg-[var(--bg-input)] backdrop-blur-md px-5 py-3 rounded-xl border border-[var(--border-color)] shadow-inner">
                  <UserIcon className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-sm font-bold text-[var(--text-main)]">{currentUser?.name || 'Usuário'}</span>
                </div>
              )}
              {currentUser && (
                <div className="flex items-center gap-1.5">
                  {/* Dark mode toggle desktop */}
                  <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)]">
                    <button onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')} title={themeMode === 'dark' ? 'Modo Claro' : 'Modo Escuro'} className="p-1.5 rounded-md hover:bg-[var(--bg-main)] transition-all">
                      {themeMode === 'dark' ? <Sun size={14} className="text-[var(--text-muted)]" /> : <Moon size={14} className="text-[var(--text-muted)]" />}
                    </button>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('opencode:clear-cart'))}
                    className="px-2.5 py-1.5 bg-[var(--bg-input)] hover:bg-[var(--bg-main)] text-[var(--text-main)] font-bold rounded-lg text-[10px] uppercase leading-none transition-all active:scale-90 border border-[var(--border-color)]"
                  >
                    F4 Limpar
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('opencode:new-sale'))}
                    className="px-2.5 py-1.5 bg-[var(--bg-input)] hover:bg-[var(--bg-main)] text-[var(--text-main)] font-bold rounded-lg text-[10px] uppercase leading-none transition-all active:scale-90 border border-[var(--border-color)]"
                  >
                    F7 Nova Venda
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('opencode:open-cart'))}
                    disabled={operatorCartCount === 0}
                    className="px-3 py-1.5 bg-[var(--primary-color)] hover:brightness-110 text-white font-black rounded-lg text-[11px] uppercase leading-none transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed border border-transparent"
                    style={{ boxShadow: '0 4px 14px var(--primary-color)' }}
                  >
                    <ShoppingBag size={12} className="inline-block mr-1" />Finalizar ({operatorCartCount})
                  </button>
                  <InstallButton role={isAdmin ? 'admin' : 'user'} />
                  <AppDownloadButton className="!w-8 !h-8 sm:!w-9 sm:!h-9" />
                </div>
              )}
{currentUser && (
                 <button
                  onClick={logout}
                  className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-3 rounded-xl text-xs uppercase tracking-wide shadow-lg touch-target transition-all"
                  style={{ boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)' }}
                 >
                    <LogOut className="h-4 w-4" />
                    <span>Sair</span>
                 </button>
               )}
             </div>

{/* Mobile Menu Button */}
            <div className="md:hidden flex items-center gap-3">
               <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-[var(--text-main)] bg-[var(--bg-input)] p-3 rounded-xl backdrop-blur-md border border-[var(--border-color)] hover:bg-[var(--bg-main)] touch-target flex items-center justify-center">
                  <Menu className="h-5 w-5" />
               </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Premium */}
        {isMobileMenuOpen && (
          <div className="md:hidden p-4 border-t border-[var(--border-color)] bg-[var(--bg-card)]/95 backdrop-blur-xl absolute w-full left-0 shadow-2xl">
             <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 font-bold text-[var(--text-main)] text-sm bg-[var(--bg-input)] p-4 rounded-xl border border-[var(--border-color)]">
                  <UserIcon className="h-5 w-5" />
                  <span>{currentUser?.name || 'Usuário'}</span>
                </div>
                {/* Dark mode toggle mobile */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                  {([
                    { mode: 'light' as const, Icon: Sun, label: 'Claro' },
                    { mode: 'dark' as const, Icon: Moon, label: 'Escuro' },
                    { mode: 'system' as const, Icon: Monitor, label: 'Auto' },
                  ]).map(({ mode, Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => setThemeMode(mode)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        themeMode === mode ? 'bg-[var(--bg-main)] text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>
                <button onClick={logout} className="flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl uppercase tracking-wider touch-target transition-all shadow-lg" style={{ boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)' }}>
                  <LogOut className="h-5 w-5" />
                  <span>Sair do Sistema</span>
                </button>
             </div>
           </div>
         )}
       </header>

      {/* Main Content */}
      <main className={`flex-grow mx-auto transition-all duration-300 ${isAdmin ? 'w-full max-w-full px-0' : 'max-w-7xl px-4 sm:px-6 lg:px-8 py-6'}`}>
        {children}
      </main>

      {/* Footer Premium */}
      {!isAdmin && (
        <footer className="pt-10 pb-32 md:pb-10 border-t-4 transition-colors duration-300 relative overflow-hidden" style={{ 
          background: 'linear-gradient(to top, var(--bg-card), var(--bg-main))',
          borderTopColor: 'var(--primary-color)',
        }}>
          <div className="max-w-7xl mx-auto px-4">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start">

                 <div className="text-center md:text-left">
                     <h3 className="font-black text-base text-[var(--text-main)] mb-2 uppercase tracking-wider">{appConfig.appName}</h3>
                     <p className="leading-relaxed text-[var(--text-muted)] font-medium">{appConfig.institutionName}</p>
                     <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">CNPJ: {appConfig.cnpj}</p>
                 </div>

                 <div className="flex flex-col gap-4 items-center md:items-start">
                     <h4 className="font-bold text-[var(--text-main)] mb-1 uppercase tracking-wider text-sm">Fale Conosco</h4>
                     <div className="flex items-center gap-3 text-[var(--text-muted)] bg-[var(--bg-input)] px-4 py-2 rounded-lg w-full md:w-auto">
                        <Phone className="w-4 h-4" />
                        <span className="font-bold text-sm">{appConfig.contactPhone}</span>
                     </div>
                     <div className="flex items-center gap-3 text-[var(--text-muted)]">
                        <Mail className="w-4 h-4" />
                        <span className="text-sm">{appConfig.contactEmail}</span>
                     </div>
                 </div>

                 <div className="flex flex-col gap-3 items-center md:items-start">
                     <h4 className="font-bold text-[var(--text-main)] mb-1 uppercase tracking-wider text-sm">Localização</h4>
                     <div className="flex items-start gap-3 text-[var(--text-muted)]">
                        <MapPin className="w-4 h-4 mt-0.5" />
                        <span className="max-w-[220px] text-center md:text-left text-sm">{appConfig.contactAddress}</span>
                     </div>
                 </div>
             </div>

             <div className="mt-10 border-t border-[var(--border-color)]"></div>

             <div className="mt-8 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
                 <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold">© {new Date().getFullYear()} Todos os direitos reservados.</p>

                 <div className="bg-[var(--bg-input)] backdrop-blur-md px-6 py-4 rounded-2xl border border-[var(--border-color)] shadow-lg">
                     <p className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider mb-1">Desenvolvido por</p>
                     <p className="text-sm font-black text-[var(--primary-color)] tracking-wide">{appConfig?.developerName || 'Edevaldo de Lima Almeida'}</p>
                     {appConfig?.developerEmail && (
                         <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1">{appConfig.developerEmail}</p>
                     )}
                     {appConfig?.developerPhone && (
                         <p className="text-[10px] text-[var(--primary-color)]/70 font-mono mt-0.5">{appConfig.developerPhone}</p>
                     )}
                 </div>
             </div>
          </div>
        </footer>
      )}
    </div>
  );
};
