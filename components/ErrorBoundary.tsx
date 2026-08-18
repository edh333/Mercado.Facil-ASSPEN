import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component<any, any> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    try { this.setState({ info: errorInfo }); } catch { /* estado imutável */ }

    // AUTO-CURA de erros de "build misturado"/cache velho (#310, #418, chunk):
    // limpa SWs e caches obsoletos e recarrega uma vez por sessão — o app sai
    // sozinho do estado travado, sem intervenção do usuário.
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
          } catch { /* segue mesmo com falha parcial */ }
          window.location.reload();
        })();
        return;
      } catch { /* sessionStorage indisponível — mostra a tela de erro */ }
    }
  }

  render() {
    const st = (this as any).state || { hasError: false, error: null };
    const pr = (this as any).props || {};
    if (st.hasError) {
      if (pr.fallback) return pr.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 p-10 max-w-md w-full text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} className="text-red-500" />
            </div>
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
              Algo deu errado
            </h2>
            <p className="text-sm text-slate-500 mb-2">
              Ocorreu um erro inesperado. Nossa equipe foi notificada.
            </p>
            {st.error && (
              <p className="text-[10px] font-mono text-red-500 bg-red-50 rounded-xl p-3 mb-6 break-all">
                {st.error.message}
              </p>
            )}
            {st.info?.componentStack && (
              <details className="text-left text-[9px] font-mono text-slate-500 bg-slate-50 rounded-xl p-3 mb-4 break-all max-h-40 overflow-auto">
                <summary className="cursor-pointer font-black uppercase tracking-wider mb-1">Componentes envolvidos</summary>
                {String(st.info.componentStack).slice(0, 1500)}
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl"
            >
              <RefreshCw size={18} /> Recarregar Sistema
            </button>
          </div>
        </div>
      );
    }

    return pr.children;
  }
}
