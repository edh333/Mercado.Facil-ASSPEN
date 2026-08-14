import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
  headerColor?: string;
}

const SIZE_CLASS: Record<NonNullable<ModalShellProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

export const ModalShell: React.FC<ModalShellProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  actions,
  children,
  footer,
  closeOnBackdrop = true,
  bodyClassName = '',
  headerColor = 'from-[#0f172a] via-[#1e293b] to-[#0f172a]',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-container">
      <div className="modal-overlay" onClick={() => closeOnBackdrop && onClose()}></div>
      <div className={`modal-content modal-shell-fixed relative w-full ${SIZE_CLASS[size]} bg-white overflow-hidden flex flex-col max-h-[90vh] rounded-2xl shadow-2xl animate-scaleIn`}>
        {/* TOP ACCENT BAR */}
        <div className="h-1.5 shrink-0 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500"></div>

        <div className={`px-6 py-4 shrink-0 flex items-center justify-between gap-4 bg-gradient-to-r ${headerColor} text-white`}>
          <div className="flex items-center gap-4 min-w-0">
            {icon && (
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-black uppercase tracking-wide text-sm truncate">{title}</h3>
              {subtitle && <p className="text-[10px] font-bold text-slate-400 truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button
              onClick={onClose}
              aria-label="Fechar janela"
              className="p-3 rounded-xl bg-white/10 hover:bg-red-500 text-white transition-all active:scale-90"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto custom-scrollbar overscroll-contain bg-slate-50/60 ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-end gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
