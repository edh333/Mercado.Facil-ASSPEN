import React from 'react';

type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';

interface UiBadgeProps {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
  neutral: 'bg-[var(--bg-muted)] text-[var(--text-muted)] border border-[var(--border-color)]',
  primary: 'bg-[var(--primary-light)] text-[var(--primary-color)] border border-[var(--primary-color)]/20',
};

const DOT_CLASS: Record<BadgeTone, string> = {
  success: 'bg-[#059669]',
  warning: 'bg-[#d97706]',
  error: 'bg-[#dc2626]',
  info: 'bg-[#0284c7]',
  neutral: 'bg-[var(--text-muted)]',
  primary: 'bg-[var(--primary-color)]',
};

/**
 * UiBadge — selo semântico padrão (status/contador). Usa as classes .badge-*
 * do design system, com variantes light/dark automáticas.
 */
export const UiBadge: React.FC<UiBadgeProps> = ({ tone = 'neutral', icon, children, className = '', dot = false }) => (
  <span className={`badge inline-flex ${TONE_CLASS[tone]} ${className}`}>
    {dot && (
      <span className={`inline-block size-1.5 rounded-full ${DOT_CLASS[tone]}`} />
    )}
    {icon}
    {children}
  </span>
);