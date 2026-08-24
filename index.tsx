// @ts-nocheck
import React, { Component, ReactNode, ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { PWAInstallProvider } from './components/PWAInstallProvider';
import { iniciarSentry, registrarErroSentry, SENTRY_ATIVO } from './utils/sentry';
import './index.css';

iniciarSentry();

// ── LIMPEZA DEFENSIVA DE SW/CACHE DE BUILDS ANTIGOS ───────────────────────
// Navegadores presos num Service Worker/cache de build passado NUNCA
// atualizam sozinhos: o SW antigo serve o HTML antigo, que registra o mesmo
// SW antigo (ciclo infinito de cache — sintoma: "Loading chunk failed",
// tela branca ou "Minified React error #310" = mistura de chunks de builds
// diferentes: um componente renderiza 1ª vez com um número de hooks e na
// 2ª vez com outro). Esta rotina roda UMA VEZ POR SESSÃO DE NAVEGADOR
// (flag em sessionStorage, não localStorage) e: desregistra SWs obsoletos,
// apaga caches de builds anteriores e recarrega para sair do controle do SW
// velho. Assim, QUALQUER PC que ficou preso numa versão antiga se conserta
// sozinho na primeira abertura do dia — incluindo máquinas que já tiveram
// o flag antigo gravado permanentemente.
// ⚠ MANTER EM SINCRONIA com CACHE_NAME em public/sw.js (hoje: v12).
// Antes estava 'v11' aqui e 'v12' lá → a limpeza diária apagava o cache
// atual do próprio sistema, forçando re-download completo toda sessão.
const SW_CACHE_ATUAL = 'mercado-facil-v12';
const SW_CLEANUP_FLAG = 'mercado-facil-sw-cleanup-v11';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !sessionStorage.getItem(SW_CLEANUP_FLAG)) {
  sessionStorage.setItem(SW_CLEANUP_FLAG, '1'); // por sessão: evita loop e permite re-healing amanhã

  (async () => {
    let algoLimpado = false;
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.active || registration.installing || registration.waiting) algoLimpado = true;
        await registration.unregister().catch(() => {});
      }
    } catch (e) { /* sem permissão/indisponível — segue normal */ }

    try {
      if ('caches' in window) {
        const names = await caches.keys();
        const obsoletos = names.filter((name) => name !== SW_CACHE_ATUAL);
        if (obsoletos.length > 0) algoLimpado = true;
        await Promise.all(obsoletos.map((name) => caches.delete(name).catch(() => {})));
      }
    } catch (e) { /* cache indisponível — segue normal */ }

    // Só recarrega se havia algo preso — sai do controle do SW antigo e
    // carrega a versão nova já sem cache velho (PWAInstallProvider registra o
    // sw.js atual logo em seguida, na montagem do React).
    if (algoLimpado) window.location.reload();
  })();
}

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
    registrarErroSentry(error, { componente: 'ErrorBoundary', info: errorInfo?.componentStack });
    try { (this.setState as any)({ info: errorInfo }); } catch { /* estado imutável */ }

    // ERROS DE "BUILD MISTURADO" (SW/cache velho + HTML novo) — #310 é o
    // "Rendered more hooks than during the previous render", causado aqui por
    // chunks de builds diferentes carregados na mesma sessão. Em vez de só
    // mostrar a tela de erro, o app tenta SE AUTO-CURAR uma vez por sessão:
    // limpa todos os SWs, apaga todos os caches e recarrega — sai do estado
    // travado sozinho, sem o usuário precisar fazer nada.
    if (typeof window !== 'undefined' && /(#310|#418|#425|#426|hydration|Loading chunk|dynamically imported|Failed to fetch dynamically)/i.test(error?.message || '')) {
      try {
        if (sessionStorage.getItem('mf-boundary-heal')) return;
        sessionStorage.setItem('mf-boundary-heal', '1');
        (async () => {
          try {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
            }
            if ('caches' in window) {
              const names = await caches.keys();
              await Promise.all(names.map((n) => caches.delete(n).catch(() => {})));
            }
          } catch { /* heurística: tenta mesmo se falhar parcialmente */ }
          window.location.reload();
        })();
        return;
      } catch { /* sessionStorage indisponível — segue para a tela de erro */ }
    }
  }

  public render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const isChunkError = err && /#310|#418|#425|#426|hydration|Failed to fetch dynamically imported module|Loading chunk|dynamically imported/i.test(err.message || '');
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
          {(this.state as any).info?.componentStack && (
            <details style={{ marginTop: '12px', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', fontSize: '12px', opacity: .8 }}>Componentes envolvidos (diagnóstico)</summary>
              <pre style={{ background: '#1e293b', padding: '10px', borderRadius: '8px', overflow: 'auto', border: '1px solid #334155', fontSize: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', marginTop: '6px' }}>
                {String((this.state as any).info.componentStack).slice(0, 1500)}
              </pre>
            </details>
          )}
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
      registrarErroSentry(event.error || event.message, { origem: 'window.error' });
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason || 'Erro desconhecido');
    if (/Loading chunk|dynamically imported/i.test(msg)) {
      console.error('[ChunkLoadError]', reason);
      registrarErroSentry(reason, { origem: 'unhandledrejection', tipo: 'chunk' });
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