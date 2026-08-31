import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';

export type SystemRole = 'admin' | 'manager' | 'operator' | 'user';

interface PWAInstallContextType {
  isInstallable: boolean;
  isInstalled: boolean;
  install: (role?: SystemRole) => Promise<void>;
}

const PWAInstallContext = createContext<PWAInstallContextType>({
  isInstallable: false,
  isInstalled: true,
  install: async () => {},
});

export const usePWAInstall = () => useContext(PWAInstallContext);

function buildManifest(role?: SystemRole) {
  const isAdmin = role === 'admin';
  return {
    name: isAdmin ? 'Mercado Fácil - Painel Admin' : 'Mercado Fácil',
    short_name: isAdmin ? 'Mercado Admin' : 'Mercado Fácil',
    description: isAdmin
      ? 'Painel Gerencial do Mercado Fácil'
      : 'Aplicativo do Mercado Fácil (Frente de Caixa)',
    start_url: isAdmin ? '/?mode=admin' : '/?mode=user',
    display: 'standalone' as const,
    orientation: 'portrait-primary' as const,
background_color: 'var(--bg-main)',
      theme_color: 'var(--primary-color)',
    lang: 'pt-BR',
    scope: '/',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

export const PWAInstallProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [novaVersao, setNovaVersao] = useState(false);

  const isIOS = useMemo(() => {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // ── AVISO DE NOVA VERSÃO ──────────────────────────────────────────
    // O sw.js usa skipWaiting: quando um deploy novo chega, o SW novo
    // assume o controle e 'controllerchange' dispara. Em vez de recarregar
    // à força (poderia interromper uma venda no PDV), mostramos um aviso
    // discreto e o operador aplica a atualização no melhor momento.
    const jaTinhaController = !!navigator.serviceWorker?.controller;
    const onControllerChange = () => {
      if (!jaTinhaController) return; // primeira instalação não é "update"
      setNovaVersao(true);
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsInstalled(isStandalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const changeHandler = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mediaQuery.addEventListener('change', changeHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      mediaQuery.removeEventListener('change', changeHandler);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    };
  }, []);

  const install = useCallback(async (role?: SystemRole) => {
    if (isIOS) {
      const destino = role === 'admin' ? 'o Painel Gerencial (Admin)' : 'o Aplicativo do Mercado Fácil';
      alert(
        'Para instalar ' + destino + ':\n\n' +
        '1. Toque no botão Compartilhar (ícone ⬆️ em um quadrado) no Safari\n' +
        '2. Escolha "Adicionar à Tela de Início"\n' +
        '3. Toque em "Adicionar"\n\n' +
        'O aplicativo aparecerá na tela inicial do seu iPhone/iPad.'
      );
      return;
    }
    if (!deferredPrompt) return;

    const manifest = buildManifest(role);
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const blobURL = URL.createObjectURL(blob);
    let installed = false;

    try {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (link) link.href = blobURL;

      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      installed = result.outcome === 'accepted';
    } catch {
      // prompt() pode rejeitar em navegadores restritos (Brave, Safari, iOS)
    } finally {
      URL.revokeObjectURL(blobURL);
      setIsInstalled(installed);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return (
    <PWAInstallContext.Provider value={{ isInstallable: !!deferredPrompt || isIOS, isInstalled, install }}>
      {children}
      {novaVersao && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900 text-white pl-5 pr-3 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold border border-slate-700 animate-fadeIn">
          <span>🔄 Nova versão do sistema disponível</span>
          <button
            onClick={() => window.location.reload()}
            className="bg-[var(--primary-color)] hover:bg-[var(--secondary-color)] text-white px-4 py-1.5 rounded-xl font-black uppercase tracking-widest text-[10px] transition-colors active:scale-95"
          >
            Atualizar agora
          </button>
        </div>
      )}
    </PWAInstallContext.Provider>
  );
};
