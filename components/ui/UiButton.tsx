import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'navy' | 'ghost';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface UiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1.5 text-[11px] rounded-md min-h-[28px]',
  sm: 'px-3 py-2 text-xs rounded-lg min-h-[34px]',
  md: 'px-4 py-2.5 text-[13px] rounded-xl min-h-[40px]',
  lg: 'px-6 py-3 text-sm rounded-xl min-h-[48px]',
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary-color)] text-white hover:brightness-110 shadow-sm',
  secondary: 'bg-transparent text-[var(--text-main)] border border-[var(--border-color)] hover:bg-[var(--bg-muted)]',
  success: 'bg-[var(--color-brand-success)] text-white hover:brightness-110 shadow-sm',
  danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm',
  navy: 'bg-[var(--color-brand-navy)] text-white hover:bg-[var(--color-brand-navy-800)] shadow-sm',
  ghost: 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-main)]',
};

/**
 * Quando o caller passa className com cor própria (bg-/text-), a cor da
 * variante é removida: evita "texto branco sobre fundo branco" quando a
 * ordem do CSS gerado coloca a utilidade da variante por último (o ícone
 * ficava invisível e só "aparecia" ao passar o mouse).
 */
const misturarVarianteComClassName = (base: string, className: string): string => {
  if (!className) return base;
  const tokens = className.split(/\s+/).filter(Boolean);
  const temBg = tokens.some((t) => t.startsWith('bg-') || t.startsWith('bg['));
  const temText = tokens.some((t) => t.startsWith('text-') || t.startsWith('text['));
  if (!temBg && !temText) return base;
  return base
    .split(/\s+/)
    .filter((t) => {
      if (temBg && (t.startsWith('bg-') || t.startsWith('bg['))) return false;
      if (temText && (t.startsWith('text-') || t.startsWith('text['))) return false;
      return t.length > 0;
    })
    .join(' ');
};

/**
 * UiButton — botão padrão do sistema. Unifica a tipografia, o toque tátil,
 * os estados de hover/active/disabled e o loading spinner em todo o app.
 */
export const UiButton: React.FC<UiButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  children,
  disabled,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 font-bold transition-all duration-200 active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:pointer-events-none select-none no-scale ${SIZE_CLASS[size]} ${misturarVarianteComClassName(VARIANT_CLASS[variant], className)} ${className}`}
    {...rest}
  >
    {loading ? (
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
    ) : (
      icon
    )}
    {children}
  </button>
);