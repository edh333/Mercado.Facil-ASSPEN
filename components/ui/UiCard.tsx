import React from 'react';

type CardTone = 'default' | 'primary' | 'danger' | 'warning' | 'info' | 'success';

interface UiCardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: CardTone;
  className?: string;
  bodyClassName?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const TONE_ACCENT: Record<CardTone, string> = {
  default: 'border-[var(--border-color)]',
  primary: 'border-t-[3px] border-t-[var(--primary-color)] border-[var(--border-color)]',
  danger: 'border-t-[3px] border-t-red-500 border-[var(--border-color)]',
  warning: 'border-t-[3px] border-t-amber-500 border-[var(--border-color)]',
  info: 'border-t-[3px] border-t-sky-500 border-[var(--border-color)]',
  success: 'border-t-[3px] border-t-emerald-500 border-[var(--border-color)]',
};

const TONE_TITLE: Record<CardTone, string> = {
  default: 'text-[var(--text-main)]',
  primary: 'text-[var(--primary-color)]',
  danger: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-sky-600',
  success: 'text-emerald-600',
};

/**
 * UiCard — cartão padrão do sistema. Unifica painéis/estatísticas em todos os
 * painéis (admin, familiar, login). Toma o tema do app (light/dark) via CSS vars.
 */
export const UiCard: React.FC<UiCardProps> = ({
  title,
  subtitle,
  icon,
  tone = 'default',
  className = '',
  bodyClassName = '',
  headerAction,
  children,
  footer,
}) => (
  <section className={`card bg-[var(--bg-card)] ${TONE_ACCENT[tone]} ${className}`}>
    {(title || icon || headerAction) && (
      <div className="card-header flex items-center justify-between gap-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-3 min-w-0">
          {icon && <span className={`shrink-0 ${TONE_TITLE[tone]}`}>{icon}</span>}
          <div className="min-w-0">
            <h3 className={`font-black text-xs uppercase tracking-[0.1em] ${TONE_TITLE[tone]} truncate`}>
              {title}
            </h3>
            {subtitle && <p className="text-[11px] text-[var(--text-muted)] font-medium truncate">{subtitle}</p>}
          </div>
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>
    )}
    <div className={`card-body ${bodyClassName}`}>{children}</div>
    {footer && <div className="card-footer border-t border-[var(--border-color)]">{footer}</div>}
  </section>
);