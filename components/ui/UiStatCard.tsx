import React from 'react';

interface UiStatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  tone?: 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'navy';
  hint?: string;
  className?: string;
}

const TONE: Record<NonNullable<UiStatCardProps['tone']>, string> = {
  primary: 'bg-[var(--primary-color)] text-white shadow-[0_6px_16px_-6px_var(--primary-color)]',
  success: 'bg-[var(--color-brand-success)] text-white shadow-[0_6px_16px_-6px_rgba(16,185,129,0.5)]',
  danger: 'bg-red-500 text-white shadow-[0_6px_16px_-6px_rgba(239,68,68,0.5)]',
  warning: 'bg-amber-500 text-white shadow-[0_6px_16px_-6px_rgba(245,158,11,0.5)]',
  info: 'bg-sky-500 text-white shadow-[0_6px_16px_-6px_rgba(14,165,233,0.5)]',
  navy: 'bg-[var(--color-brand-navy)] text-white shadow-[0_6px_16px_-6px_rgba(15,23,42,0.5)]',
};

/**
 * UiStatCard — cartão de KPI padrão. Substitui o StatCard legado (fundão
 * gradient nave fixo): agora acompanha o tema, sem quebrar tonalidades.
 */
export const UiStatCard: React.FC<UiStatCardProps> = ({ title, value, icon, tone = 'primary', hint, className = '' }) => (
  <div className={`relative overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 ${className}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">{title}</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-[var(--text-main)]">{value}</p>
        {hint && <p className="mt-1 text-[11px] font-medium text-[var(--text-muted)]">{hint}</p>}
      </div>
      {icon && (
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${TONE[tone]}`}>
          {icon}
        </div>
      )}
    </div>
  </div>
);