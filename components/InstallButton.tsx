import React from 'react';
import { usePWAInstall, SystemRole } from './PWAInstallProvider';
import { Download } from 'lucide-react';

interface InstallButtonProps {
  variant?: 'icon' | 'full';
  className?: string;
  role?: SystemRole;
  label?: string;
}

export const InstallButton: React.FC<InstallButtonProps> = ({ variant = 'icon', className = '', role, label }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (!isInstallable || isInstalled) return null;

  const isAdmin = role === 'admin';
  const defaultLabel = isAdmin ? 'Instalar Painel Gerencial' : 'Instalar Aplicativo';
  const text = label || defaultLabel;

  if (variant === 'full') {
    return (
      <button
        onClick={() => install(role)}
        className={`flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/30 hover:brightness-110 active:scale-95 transition-all whitespace-nowrap ${className}`}
      >
        <Download size={16} />
        {text}
      </button>
    );
  }

  return (
    <button
      onClick={() => install(role)}
      title={text}
      className={`w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-tr from-emerald-500 to-emerald-600 text-white rounded-2xl flex items-center justify-center hover:brightness-110 active:scale-90 transition-all shadow-lg shadow-emerald-500/30 ${className}`}
    >
      <Download size={18} />
    </button>
  );
};
