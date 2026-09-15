import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ModalTone = 'primary' | 'danger' | 'warning' | 'info' | 'success';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: ModalTone;
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

// Identidade visual por tom semântico — destrutivo = vermelho, aviso = âmbar,
// informativo = azul, sucesso = esmeralda, neutro = escuro slate.
const TONE_STYLES: Record<ModalTone, { header: string; tile: string; accent: string; subtitle: string; shadow: string }> = {
  primary: {
    header: 'from-[#0f172a] via-[#1e293b] to-[#0f172a]',
    tile: 'from-emerald-500 to-emerald-600',
    accent: 'from-emerald-500 to-emerald-600',
    subtitle: 'text-slate-400',
    shadow: 'shadow-emerald-500/30',
  },
  danger: {
    header: 'from-red-600 via-red-600 to-red-700',
    tile: 'bg-white/15',
    accent: 'from-red-600 to-red-700',
    subtitle: 'text-white/60',
    shadow: 'shadow-red-600/30',
  },
  warning: {
    header: 'from-amber-500 via-amber-500 to-amber-600',
    tile: 'bg-white/15',
    accent: 'from-amber-500 to-amber-600',
    subtitle: 'text-white/70',
    shadow: 'shadow-amber-500/30',
  },
  info: {
    header: 'from-sky-600 via-sky-600 to-sky-700',
    tile: 'bg-white/15',
    accent: 'from-sky-500 to-sky-600',
    subtitle: 'text-white/70',
    shadow: 'shadow-sky-500/30',
  },
  success: {
    header: 'from-emerald-600 via-emerald-600 to-emerald-700',
    tile: 'bg-white/15',
    accent: 'from-emerald-500 to-emerald-600',
    subtitle: 'text-white/70',
    shadow: 'shadow-emerald-600/30',
  },
};

export const ModalShell: React.FC<ModalShellProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  tone = 'primary',
  actions,
  children,
  footer,
  closeOnBackdrop = true,
  bodyClassName = '',
  headerColor,
}) => {
  const toneStyle = TONE_STYLES[tone] ?? TONE_STYLES.primary;
  // Refs e hooks SEMPRE antes de qualquer return condicional
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      // Focus trap: Tab navega em loop dentro do modal
      if (e.key === 'Tab' && innerRef.current) {
        const focusables = Array.from(
          innerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const inside = innerRef.current.contains(active);
        if (e.shiftKey && (!inside || active === first)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || active === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Early return SOMENTE depois de todos os hooks
  if (!open) return null;

  // Portal no <body>: modais renderizados DENTRO de containers com stacking
  // context próprio (ex.: sidebar com z-50) ficavam presos atrás do conteúdo —
  // mesmo com z-index 9999. Portar para o body resolve o modal "apareceu atrás".
  return createPortal((
    <div className="modal-container">
      <div className="modal-overlay" onClick={() => closeOnBackdrop && onClose()}></div>
      <div
        ref={innerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`modal-content modal-shell-fixed relative w-full ${SIZE_CLASS[size]} bg-white overflow-hidden flex flex-col max-h-[90vh] rounded-2xl shadow-2xl animate-scaleIn outline-none`}
      >
        {/* TOP ACCENT BAR — identidade visual por tom */}
        <div className={`h-1.5 shrink-0 bg-gradient-to-r ${toneStyle.accent}`}></div>

        <div className={`px-6 py-4 shrink-0 flex items-center justify-between gap-4 bg-gradient-to-r ${headerColor ?? toneStyle.header} text-white`}>
          <div className="flex items-center gap-4 min-w-0">
            {icon && (
              <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-lg ${toneStyle.shadow} ${toneStyle.tile.startsWith('bg-') ? toneStyle.tile : `bg-gradient-to-br ${toneStyle.tile}`}`}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-black uppercase tracking-wide text-sm truncate">{title}</h3>
              {subtitle && <p className={`text-[10px] font-bold ${toneStyle.subtitle} truncate`}>{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button
              onClick={onClose}
              aria-label={'Fechar ' + title}
              title={'Fechar ' + title}
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
  ), document.body);
};
