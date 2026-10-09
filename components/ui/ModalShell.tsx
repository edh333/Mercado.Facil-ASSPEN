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
  /** Dispara no Escape no lugar de onClose (ex.: janelas que exigem decisão). */
  onEscape?: () => void;
  bodyClassName?: string;
  headerColor?: string;
}

const SIZE_CLASS: Record<NonNullable<ModalShellProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

// Identidade visual minimalista por tom semântico — chip translúcido funciona
// igual no tema claro e no escuro (era bg-*-50 fixo e quebrava no dark).
const TONE_STYLES: Record<ModalTone, { accent: string; tile: string }> = {
  primary: {
    accent: 'from-emerald-500 to-emerald-600',
    tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  danger: {
    accent: 'from-red-500 to-red-600',
    tile: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  warning: {
    accent: 'from-amber-500 to-amber-600',
    tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  info: {
    accent: 'from-sky-500 to-sky-600',
    tile: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  success: {
    accent: 'from-emerald-500 to-emerald-600',
    tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
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
  onEscape,
  bodyClassName = '',
  headerColor,
}) => {
  const toneStyle = TONE_STYLES[tone] ?? TONE_STYLES.primary;
  // Refs e hooks SEMPRE antes de qualquer return condicional
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      // Escape: somente o modal do TOPO responde. Com janelas em camadas
      // (ex.: Estorno sobre Detalhes do Pedido), o topo é o ÚLTIMO
      // .modal-container montado no <body> — os de baixo não fecham juntos.
      // Modais com closeOnBackdrop=false (operação em andamento) tampouco
      // fecham por tecla: o Escape é o atalho do X/backdrop.
      if (e.key === 'Escape') {
        const containers = Array.from(document.querySelectorAll('.modal-container'));
        const own = innerRef.current?.closest('.modal-container');
        if (containers.length > 0 && own === containers[containers.length - 1] && closeOnBackdrop) {
          if (onEscape) onEscape(); else onClose();
        }
        return;
      }
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, closeOnBackdrop, onEscape]);

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
        className={`modal-content modal-shell-fixed relative w-full ${SIZE_CLASS[size]} bg-[var(--bg-card)] overflow-hidden flex flex-col max-h-[90vh] rounded-2xl shadow-2xl animate-scaleIn outline-none`}
      >
        {/* HEADER — tema claro/escuro via variáveis (era bg-white fixo e ficava branco no dark) */}
        <div className={`px-6 py-4 shrink-0 flex items-center justify-between gap-4 bg-[var(--bg-card)] border-b border-[var(--border-color)] ${headerColor ?? ''}`}>
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${toneStyle.tile}`}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-[var(--text-main)] font-black uppercase tracking-wide text-base truncate">{title}</h3>
              {subtitle && <p className="text-[10px] font-bold text-[var(--text-muted)] truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <button
              onClick={onClose}
              aria-label={'Fechar ' + title}
              title={'Fechar ' + title}
              className="p-2.5 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-main)] transition-all active:scale-90"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className={`flex-1 overflow-y-auto custom-scrollbar overscroll-contain bg-[var(--bg-muted)] ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-card)] flex items-center justify-end gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  ), document.body);
};
