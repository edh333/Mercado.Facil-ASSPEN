// Monitoramento de erros com Sentry (opcional).
// Sem VITE_SENTRY_DSN configurado (.env), tudo vira no-op: zero custo,
// zero requests. Para ativar: criar conta em sentry.io, criar projeto e
// colocar a DSN em .env: VITE_SENTRY_DSN=https://...
import * as Sentry from '@sentry/react';

const DSN = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;

export const SENTRY_ATIVO = Boolean(DSN && String(DSN).startsWith('https://'));

export function iniciarSentry() {
  if (!SENTRY_ATIVO) return;
  Sentry.init({
    dsn: DSN,
    release: (import.meta as any).env?.VITE_COMMIT_SHA || 'desenvolvimento',
    tracesSampleRate: 0.05,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    beforeSend(event) {
      if (event?.exception?.values?.some((v) => /Loading chunk|dynamically imported/i.test(v?.value || ''))) {
        return null; // erros de chunk (conexão instável) não são bugs — não poluem
      }
      return event;
    },
  });
}

export function registrarErroSentry(erro: unknown, contexto?: Record<string, unknown>) {
  if (!SENTRY_ATIVO) return;
  Sentry.captureException(erro, { extra: contexto });
}

export function registrarMensagemSentry(mensagem: string, nivel: 'info' | 'warning' | 'error' = 'warning') {
  if (!SENTRY_ATIVO) return;
  Sentry.captureMessage(mensagem, nivel);
}

export default Sentry;
