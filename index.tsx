// @ts-nocheck
import React, { Component, ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PWAInstallProvider } from './components/PWAInstallProvider';
import './index.css';

// Suporte a WebViews/navegadores antigos sem crypto.randomUUID
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  crypto.randomUUID = () => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const isChunkError = err && /Failed to fetch dynamically imported module|Loading chunk|dynamically imported/i.test(err.message || '');
      return (
        <div style={{ padding: '30px', background: '#0f172a', color: '#f8fafc', fontFamily: 'sans-serif', minHeight: '100vh', maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ color: '#f87171' }}>⚠️ Erro ao carregar o sistema</h2>
          <p>
            {isChunkError
              ? 'Uma parte do aplicativo não pôde ser baixada (conexão instável). O botão "Tentar Novamente" geralmente resolve.'
              : 'O aplicativo encontrou um erro inesperado ao iniciar. Veja o detalhe abaixo e use as opções para recuperar.'}
          </p>
          <pre style={{ background: '#1e293b', padding: '15px', borderRadius: '8px', overflow: 'auto', border: '1px solid #334155', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {err?.toString() || 'Erro desconhecido'}
          </pre>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '20px' }}>
            <button onClick={() => window.location.reload()} style={{ padding: '12px 22px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              🔄 Tentar Novamente
            </button>
            <button
              onClick={() => {
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                } catch {
                  window.location.reload();
                }
              }}
              style={{ padding: '12px 22px', background: '#f59e0b', color: '#0f172a', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🧹 Limpar Dados Locais e Reiniciar
            </button>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '18px', lineHeight: 1.6 }}>
            Dica: se o erro persistir, limpe o cache do navegador ou teste em outra rede. Os dados da conta estão seguros na nuvem.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

// Captura erros globais (chunks, async, etc.) que o ErrorBoundary não alcança —
// transforma tela branca em diagnóstico visível com opção de recuperação.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (event.defaultPrevented) return;
    if (!(event.target instanceof HTMLElement) || event.target.tagName === 'BODY' || event.target.tagName === 'HTML') {
      console.error('[GlobalError]', event.error || event.message);
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || 'Erro desconhecido');
    if (/Loading chunk|dynamically imported/i.test(msg)) {
      console.error('[ChunkLoadError]', reason);
      const rootEl = document.getElementById('root');
      if (rootEl && !rootEl.querySelector('[data-retry-error]')) {
        const div = document.createElement('div');
        div.setAttribute('data-retry-error', '1');
        div.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;background:#0f172a;color:#fff;padding:14px 18px;border-radius:12px;font-family:sans-serif;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.35);display:flex;gap:12px;align-items:center;';
        div.innerHTML = '<span>⚠️ Parte do aplicativo não baixou (conexão instável).</span><button style="background:#3b82f6;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-weight:bold;cursor:pointer;">Tentar Novamente</button>';
        div.querySelector('button')?.addEventListener('click', () => window.location.reload());
        rootEl.appendChild(div);
        setTimeout(() => div.remove(), 30000);
      }
    }
  });
}

const rootElement = document.getElementById('root');

// ── MONTAGEM SEGURA (React 19) ──────────────────────────────────────────
// No React 19 o createRoot AUTO-HIDRATA o container quando ele já contém DOM.
// Isso dispara o erro "Minified React #318" (hydration mismatch) quando algo
// injeta nós em #root ANTES do React carregar — ex.: extensões de navegador
// (tradutor, bloqueador), cache antigo misturado ou HTML residual de outra
// versão. Como este é um app 100% SPA (sem SSR), hidratação é sempre
// indesejada: limpamos o container antes de montar e, se algo ainda falhar,
// forçamos um re-render limpo com a árvore reconstruída do zero.
function montarAplicativo() {
  if (!rootElement) throw new Error('Elemento #root não encontrado no HTML.');
  if (rootElement.firstChild) rootElement.replaceChildren();
  const root = createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <PWAInstallProvider>
        <App />
      </PWAInstallProvider>
    </ErrorBoundary>
  );
  return root;
}

if (rootElement) {
  try {
    montarAplicativo();
  } catch (error) {
    // Falha de hidratação/render detectada — descarta o DOM residual e
    // reconstrói a árvore de nós do zero (cura #318 e caches corrompidos).
    console.error('[Mount] Erro de hidratação/render detectado, forçando re-render limpo:', error);
    try {
      rootElement.replaceChildren();
      montarAplicativo();
    } catch (error2) {
      console.error('[Mount] Segunda tentativa também falhou:', error2);
      document.body.innerHTML =
        '<div style="padding:40px;font-family:sans-serif;text-align:center;background:#0f172a;color:#f8fafc;min-height:100vh;">' +
        '<h2 style="color:#f87171;">Falha ao iniciar o aplicativo</h2>' +
        '<p>Feche e reabra esta página. Se o erro persistir, limpe o cache do navegador.</p>' +
        '<button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;">Tentar Novamente</button>' +
        '</div>';
    }
  }
}