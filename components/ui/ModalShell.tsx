import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  bodyClassName?: string;
  headerColor?: string;
  accentColor?: string;
}

const SIZE_CLASS: Record<NonNullable<ModalShellProps['size']>, string> = {
  sm: '',
  md: '',
  lg: '',
  xl: '',
  full: '',
};

const SIZE_ATTR: Record<NonNullable<ModalShellProps['size']>, string> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'xl',
  full: 'full',
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
  headerColor,
  accentColor,
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

  return createPortal((
    <>
      <div className="modal-overlay" onClick={() => closeOnBackdrop && onClose()} />
      <div className="modal-wrapper">
        <div
          className={`modal-card ${bodyClassName}`}
          data-size={SIZE_ATTR[size]}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="modal-accent-bar" style={{ background: accentColor || 'linear-gradient(90deg, var(--primary-color), var(--secondary-color))' }} />
          <header className="modal-header" style={{ background: headerColor || 'linear-gradient(135deg, var(--color-brand-navy) 0%, var(--color-brand-navy-800) 100%)' }}>
            <div className="modal-header-content">
              {icon && (
                <div className="modal-header-icon" style={{ background: accentColor || 'linear-gradient(135deg, var(--primary-color), var(--secondary-color))' }}>
                  {icon}
                </div>
              )}
              <div className="modal-header-text" id="modal-title">
                <h3 className="modal-title">{title}</h3>
                {subtitle && <p className="modal-subtitle">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              <button
                onClick={onClose}
                aria-label="Fechar janela"
                className="modal-close"
              >
                <X size={20} />
              </button>
            </div>
          </header>
          <div className={`modal-body ${bodyClassName}`}>
            {children}
          </div>
          {footer && (
            <footer className="modal-footer">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </>
  ), document.body);
};

export default ModalShell;