import React from 'react';

interface AppFooterProps {
  appName?: string;
  institutionName?: string;
  developerName?: string;
  developerEmail?: string;
  variant?: 'light' | 'dark';
  className?: string;
  extra?: React.ReactNode;
}

const YEAR = new Date().getFullYear();

/**
 * AppFooter — rodapé padrão do sistema (Login, Landing, aplicativo).
 * Ano de copyright sempre dinâmico (nunca hardcoded no JSX).
 */
export const AppFooter: React.FC<AppFooterProps> = ({
  appName = 'ASSPEN',
  institutionName,
  developerName = 'Edevaldo de Lima Almeida',
  developerEmail = 'edh333@hotmail.com',
  variant = 'dark',
  className = '',
  extra,
}) =>
  variant === 'dark' ? (
    <footer className={`py-10 bg-[#0a1120] border-t border-white/5 ${className}`}>
      <div className="mx-auto flex flex-col items-center gap-3 px-4 text-center sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#0e7a4d]">
            <span className="text-white font-black text-sm">{appName.charAt(0)}</span>
          </div>
          <p className="font-extrabold tracking-tight text-white">
            {appName} {institutionName && <span className="font-semibold text-slate-500">· {institutionName}</span>}
          </p>
        </div>
        <p className="text-[11px] font-semibold tracking-wide text-slate-500">
          Desenvolvido por <span className="font-bold text-slate-300">{developerName}</span> · {developerEmail}
        </p>
        <p className="text-[10px] font-medium text-slate-600">© {YEAR} {appName} — Todos os direitos reservados</p>
        {extra}
      </div>
    </footer>
  ) : (
    <footer className={`border-t border-[var(--border-color)] bg-[var(--bg-main)] ${className}`}>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center sm:px-6">
        <p className="text-[11px] font-semibold text-[var(--text-muted)]">
          © {YEAR} {institutionName || appName} — Todos os direitos reservados
        </p>
        {extra}
      </div>
    </footer>
  );