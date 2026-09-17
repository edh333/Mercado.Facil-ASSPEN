import React from 'react';

interface PageHeaderProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  menuButton?: React.ReactNode;
  center?: React.ReactNode;
  zClass?: string;
  className?: string;
}

/**
 * PageHeader — cabeçalho padrão das páginas autenticadas (admin/familiar).
 * Consolida o padrão visual: sticky, blur, borda inferior e identidade à esquerda,
 * conteúdo central opcional e ações à direita.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle, actions, menuButton, center, zClass = 'z-30', className = '' }) => (
  <header className={`sticky top-0 ${zClass} border-b border-[var(--border-color)] bg-[var(--bg-main)]/90 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 backdrop-blur transition-all duration-300 ${className}`}>
    <div className="flex items-center gap-3 min-w-0">
      {menuButton}
      {icon && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-color)] text-white shadow-sm">
          {icon}
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <h2 className="text-base font-bold tracking-tight truncate text-[var(--text-main)]">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--text-muted)] truncate">{subtitle}</p>}
      </div>
    </div>
    {center && <div className="hidden md:flex items-center shrink-0">{center}</div>}
    {actions && <div className="flex items-center gap-3 flex-wrap justify-end shrink-0">{actions}</div>}
  </header>
);