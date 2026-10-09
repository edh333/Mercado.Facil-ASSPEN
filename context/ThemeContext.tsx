import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { THEME_COLORS } from '../constants';
import { ThemeOption } from '../types';
import {
  resolverVisual, lerVisualLocal, salvarVisualLocal, VISUAL_AUTO, VISUAL_PRESETS,
} from '../utils/visuais';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextData {
  isDark: boolean;
  primaryColor: string;
  themeId: string;
  colors: any;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** Visual efetivamente aplicado (id). */
  visual: string;
  /** 'auto' = seguindo o padrão do admin; senão, id do override local. */
  visualLocal: string;
  /** Troca o visual deste dispositivo ('auto' volta ao padrão do admin). */
  setVisual: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

const STORAGE_KEY = 'mercado-theme-mode';

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function loadThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved;
  } catch { /* noop */ }
  return 'system';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<any>(null);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(loadThemeMode);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);

  // Tema DESACOPLADO do StoreContext: um snapshot leve do doc settings/general.
  // Antes, ThemeProvider consumia useApp() — qualquer mudança em QUALQUER
  // coleção (produtos, pedidos, usuários, despesas...) re-renderizava o
  // ThemeProvider e, como ele é ancestral de MainApp, a árvore inteira do app
  // era re-renderizada DUAS vezes por snapshot (uma pelo store, outra pelo
  // theme). Agora o theme só re-renderiza quando o próprio doc de configuração
  // muda — custo de 1 stream leve num doc pequeno em troca de eliminar a
  // duplicação de render do app inteiro a cada evento do Firestore.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'general'),
      (snap) => setConfig(snap.exists() ? snap.data() : null),
      () => setConfig(null)
    );
    return () => unsub();
  }, []);

  // Persist + apply
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* noop */ }
  }, []);

  // Visual por dispositivo (troca rápida). 'auto' segue o padrão do admin.
  const [visualLocal, setVisualLocal] = useState<string>(lerVisualLocal);
  const setVisual = useCallback((id: string) => {
    const valor = id === VISUAL_AUTO || id in VISUAL_PRESETS ? id : VISUAL_AUTO;
    setVisualLocal(valor);
    salvarVisualLocal(valor);
  }, []);

  // Listen for system preference changes when in 'system' mode
  useEffect(() => {
    if (themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    setSystemDark(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, [themeMode]);

  // Visual resolvido: override local > settings do admin > default de fábrica.
  // Memoizado: o efeito de aplicação depende do objeto — sem useMemo ele seria
  // novo a cada render e reaplicaria os estilos toda renderização (quebra o
  // otimista de não re-renderizar o app a cada snapshot).
  const resolvido = useMemo(() => resolverVisual({
    overrideLocal: visualLocal,
    themeFleet: config?.theme || null,
    primaryFleet: config?.primaryColor || null,
    isDark,
  }), [visualLocal, config, isDark]);
  const themeId = resolvido.id;
  const themeData = THEME_COLORS[themeId] || THEME_COLORS[ThemeOption.MODERN_GREEN];
  const primaryColor = resolvido.primary;

  useEffect(() => {
    const root = document.documentElement;

    // Toggle .dark class
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Acento do visual
    root.style.setProperty('--primary-color', primaryColor);
    root.style.setProperty('--secondary-color', primaryColor);

    // Superfícies do visual (claro/escuro vêm prontas do preset)
    const s = resolvido.superficie;
    root.style.setProperty('--bg-main', s.bgMain);
    root.style.setProperty('--bg-card', s.bgCard);
    root.style.setProperty('--bg-input', s.bgInput);
    root.style.setProperty('--bg-muted', s.bgMuted);
    root.style.setProperty('--text-main', s.textMain);
    root.style.setProperty('--text-muted', s.textMuted);
    root.style.setProperty('--border-color', s.border);
    root.style.setProperty('--glass-border', s.glassBorder);

    // Wallpaper Global
    if (config?.loginBgType === 'image' && config?.loginBgUrl) {
      root.style.setProperty('--wallpaper-url', `url(${config.loginBgUrl})`);
    } else {
      root.style.setProperty('--wallpaper-url', 'none');
    }
  }, [config, primaryColor, isDark, resolvido]);

  return (
    <ThemeContext.Provider
      value={{
        isDark, primaryColor, themeId, colors: themeData, themeMode, setThemeMode,
        visual: resolvido.id, visualLocal, setVisual,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => useContext(ThemeContext);
export const useTheme = useThemeContext;
