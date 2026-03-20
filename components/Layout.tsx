import React, { useEffect, useState } from 'react';
import { useApp } from '../context/StoreContext';
import { LogOut, Menu, User as UserIcon, Shield, Phone, Mail, MapPin, Download } from 'lucide-react';
import { THEME_COLORS } from '../constants';
import { ThemeOption, UserRole } from '../types';
import { NotificationSystem } from './NotificationSystem';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { currentUser, logout, appConfig } = useApp();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // Obtém as cores do tema atual
  const theme = THEME_COLORS[appConfig.theme || ThemeOption.POLICE_MT];
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  // ATUALIZA O NOME NA ABA DO NAVEGADOR
  useEffect(() => {
    document.title = appConfig.appName || "Gestão Prisional";
  }, [appConfig.appName]);

  return (
    <div 
      className="min-h-screen flex flex-col font-sans transition-colors duration-500"
      style={{ backgroundColor: appConfig.backgroundColor || '#f8fafc' }}
    >
      <NotificationSystem />
      {/* Header with Dynamic Theme Colors */}
      <header 
        className={`shadow-lg sticky top-0 z-50 border-b-4 transition-colors duration-300 ${theme.text}`}
        style={{ backgroundColor: theme.primary.replace('bg-', '') === 'bg-black' ? '#000' : undefined }} 
      >
        <div className={`absolute inset-0 ${theme.primary} -z-10`} /> 

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-sm">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight leading-none text-white">{appConfig.appName}</h1>
                <p className="text-[9px] text-white/70 uppercase tracking-widest">{appConfig.institutionName.split(' ')[0]} MT</p>
              </div>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center space-x-4">
              {currentUser && (
                <div className="flex items-center space-x-2 text-xs font-medium text-white/90 bg-black/20 px-3 py-1.5 rounded-full border border-white/10">
                  <UserIcon className="h-3 w-3" />
                  <span>{currentUser.name.split(' ')[0]}</span>
                </div>
              )}
              {currentUser && (
                 <button 
                  onClick={logout}
                  className="flex items-center space-x-1 hover:text-white/80 transition-opacity text-white text-xs font-bold uppercase tracking-wide"
                 >
                   <LogOut className="h-4 w-4" />
                   <span>Sair</span>
                 </button>
              )}
            </div>

            {/* Mobile Button */}
            <div className="md:hidden flex items-center gap-3">
               <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-white hover:text-gray-200">
                  <Menu className="h-6 w-6" />
               </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden p-4 border-t border-white/10 bg-black/20 backdrop-blur-md">
             <div className="flex flex-col space-y-4">
                <span className="font-semibold text-white">{currentUser?.name}</span>
                <button onClick={logout} className="flex items-center space-x-2 text-white/80">
                  <LogOut className="h-4 w-4" />
                  <span>Sair com segurança</span>
                </button>
             </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer - HIDE IF ADMIN */}
      {!isAdmin && (
        <footer className={`text-white pt-8 pb-32 md:pb-8 border-t-4 transition-colors duration-300 relative overflow-hidden`} style={{ borderColor: appConfig.secondaryColor }}>
          {/* Background do Footer seguindo o tema */}
          <div className={`absolute inset-0 ${theme.primary} -z-10`} />
          
          <div className="max-w-7xl mx-auto px-4">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start text-xs text-white/90">
                 
                 <div className="text-center md:text-left">
                    <h3 className="font-bold text-sm text-white mb-2 uppercase tracking-wider">{appConfig.appName}</h3>
                    <p className="leading-relaxed opacity-90 max-w-xs mx-auto md:mx-0 font-medium">{appConfig.institutionName}</p>
                    <p className="mt-2 font-mono text-[10px] opacity-70">CNPJ: {appConfig.cnpj}</p>
                 </div>
                 
                 <div className="flex flex-col gap-3 items-center md:items-start">
                    <h4 className="font-bold text-white mb-1 uppercase tracking-wider">Fale Conosco</h4>
                    <div className="flex items-center gap-2 hover:text-white transition-colors bg-white/10 px-3 py-1.5 rounded-lg w-full md:w-auto">
                       <Phone className="w-3 h-3" />
                       <span className="font-bold">{appConfig.contactPhone}</span>
                    </div>
                    <div className="flex items-center gap-2 hover:text-white transition-colors">
                       <Mail className="w-3 h-3" />
                       <span>{appConfig.contactEmail}</span>
                    </div>
                 </div>

                 <div className="flex flex-col gap-2 items-center md:items-start">
                    <h4 className="font-bold text-white mb-1 uppercase tracking-wider">Localização</h4>
                    <div className="flex items-start gap-2 hover:text-white transition-colors">
                       <MapPin className="w-3 h-3 mt-0.5" />
                       <span className="max-w-[200px] text-center md:text-left">{appConfig.contactAddress}</span>
                    </div>
                 </div>
             </div>
             
             {/* Linha Divisória Suave */}
             <div className="mt-8 border-t border-white/20"></div>

             {/* Créditos do Desenvolvedor - MAIS VISÍVEL E CLARO */}
             <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left">
                  <p className="text-[10px] opacity-70 uppercase tracking-widest">&copy; {new Date().getFullYear()} Todos os direitos reservados.</p>
                  
                  <div className="bg-black/30 px-4 py-3 rounded-xl border border-white/10 backdrop-blur-md">
                      <p className="text-xs font-bold text-white uppercase tracking-wider mb-1">Desenvolvido por</p>
                      <p className="text-sm font-black text-yellow-400 tracking-wide">Edevaldo de Lima Almeida</p>
                      <p className="text-[10px] text-white/90 font-mono mt-0.5">email.edh333@hotmail.com</p>
                  </div>
             </div>
          </div>
        </footer>
      )}
    </div>
  );
};