import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Boundary global de erros.
 *
 * SEGURANÇA (corrigido): a tela dizia "Nossa equipe foi notificada", mas nada
 * era notificado — só havia um console.error. Era uma tela que prometia um
 * resguardo que não existia, enquanto o usuário perderia a venda acreditando que
 * o registro tinha sido feito. Agora o texto é verdadeiro.
 *
 * O detalhe técnico (mensagem + componentStack) fica atrás de VITE_DEV_DEBUG_ERRORS:
 * em produção não vaza caminho de arquivo, nome de componente nem mensagem
 * interna de erro. Para plugar telemetria de verdade, passe a prop onError —
 * o boundary só não inventa mais que houve notificação.
 */
const DEBUG = (() => {
  try {
    return import.meta.env.DEV || String(import.meta.env.VITE_DEV_DEBUG_ERRORS || '') === 'true';
  } catch {
    return false;
  }
})();

const HEALABLE_ERROR = /(#310|#321|#418|#425|#426|invalid hook call|rendered fewer hooks|rendered more hooks|hydration|loading chunk|failed to fetch dynamically|importing a module script failed)/i;

export class ErrorBoundary extends React.Component<any, any> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    try { this.setState({ info: errorInfo }); } catch { /* estado imutável */ }

    // Telemetria opcional fornecida pela aplicação (nunca inventada aqui).
    const onError = (this as any).props?.onError;
    if (typeof onError === 'function') {
      try { onError(error, errorInfo); } catch { /* telemetria nunca quebra a UI */ }
    }

    // AUTO-CURA de erros de "build misturado"/cache velho (#310, #321, #418, chunk):
    // limpa SWs e caches obsoletos e recarrega uma vez por sessão — o app sai
    // sozinho do estado travado, sem intervenção do usuário.
    //
    // #321 (Invalid hook call) entrou na lista DE PROPÓSITO: em produção ele
    // chega como "Minified React error #321". É a falha que o lint de Rules of
    // Hooks agora impede de nascer, mas um cliente que ainda tem o bundle antigo
    // no cache pode executá-la. Sem esta linha, esse usuário ficava preso numa
    // tela de erro sem saída; com ela, o app limpa o cache e se recupera sozinho.
    if (typeof window !== 'undefined' && HEALABLE_ERROR.test(error?.message || '')) {
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
              O sistema encontrou um erro inesperado e interrompeu esta tela para não
              salvar dados inconsistentes.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Recarregue para continuar. Se o problema voltar, anote o que você
              estava fazendo e informe ao suporte — <strong className="text-slate-700">nenhum dado foi enviado automaticamente</strong>.
            </p>
            {DEBUG && st.error && (
              <p className="text-[10px] font-mono text-red-500 bg-red-50 rounded-xl p-3 mb-6 break-all">
                {st.error.message}
              </p>
            )}
            {DEBUG && st.info?.componentStack && (
              <details className="text-left text-[9px] font-mono text-slate-500 bg-slate-50 rounded-xl p-3 mb-4 break-all max-h-40 overflow-auto">
                <summary className="cursor-pointer font-black uppercase tracking-wider mb-1">Componentes envolvidos (debug)</summary>
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
