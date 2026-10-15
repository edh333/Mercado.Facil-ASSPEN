import React from 'react';

type AdminButtonVariant = 'primary' | 'secondary' | 'danger';

interface AdminButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant;
  children: React.ReactNode;
  className?: string;
}

// 3 variantes padronizadas — substitui as ~50 variações esparsas nos admin.
// Usa tokens (var(--...)) para funcionar igual no tema claro e no escuro.
const VARIANT_STYLE: Record<AdminButtonVariant, string> = {
  primary:
    'rounded-3xl py-4 px-8 text-[11px] font-black uppercase tracking-widest bg-brand text-white shadow-lg shadow-emerald-500/25 hover:brightness-110 transition-all active:scale-95',
  secondary:
    'rounded-3xl py-3 px-6 text-[10px] font-black uppercase tracking-widest bg-[var(--bg-muted)] text-[var(--text-main)] hover:bg-[var(--bg-main)] border border-[var(--border-color)] transition-all active:scale-95',
  danger:
    'rounded-3xl py-3 px-6 text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-600 border border-red-500/30 hover:bg-red-500/20 transition-all active:scale-95',
};

export const AdminButton: React.FC<AdminButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  ...props
}) => {
  const base = VARIANT_STYLE[variant];
  return (
    <button {...props} className={`${base} ${className}`}>
      {children}
    </button>
  );
};
