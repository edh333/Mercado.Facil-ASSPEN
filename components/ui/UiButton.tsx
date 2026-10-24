import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'navy' | 'ghost' | 'outline' | 'subtle';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface UiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-[10px] rounded-lg min-h-[26px]',
  sm: 'px-3 py-1.5 text-xs rounded-xl min-h-[32px]',
  md: 'px-4 py-2 text-[13px] rounded-2xl min-h-[38px]',
  lg: 'px-6 py-2.5 text-sm rounded-2xl min-h-[44px]',
  xl: 'px-8 py-3 text-sm rounded-2xl min-h-[52px]',
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--primary-color)] text-white hover:brightness-110 active:brightness-95 shadow-sm hover:shadow-md transition-all',
  secondary: 'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 shadow-sm hover:shadow-md transition-all',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 shadow-sm hover:shadow-md transition-all',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm hover:shadow-md transition-all',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 active:bg-amber-700 shadow-sm hover:shadow-md transition-all',
  navy: 'bg-[var(--color-brand-navy)] text-white hover:bg-[var(--color-brand-navy-800)] active:brightness-90 shadow-sm hover:shadow-md transition-all',
  ghost: 'bg-transparent text-[var(--text-muted)] hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200 transition-all',
  outline: 'bg-transparent text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-all',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300 transition-all',
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
  fullWidth = false,
  children,
  disabled,
  className = '',
  ...rest
}) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 font-bold tracking-tight transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:pointer-events-none select-none ${fullWidth ? 'w-full' : ''} ${SIZE_CLASS[size]} ${misturarVarianteComClassName(VARIANT_CLASS[variant], className)} ${className}`}
    {...rest}
  >
    {loading ? (
      <span className="inline-block size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
    ) : (
      icon
    )}
    {children}
  </button>
);