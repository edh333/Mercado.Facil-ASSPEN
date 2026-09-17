import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useApp } from './StoreContext';
import { THEME_COLORS } from '../constants';
import { ThemeOption } from '../types';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextData {
  isDark: boolean;
  primaryColor: string;
  themeId: string;
  colors: any;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
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
  const { settings } = useApp();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(loadThemeMode);
  const [systemDark, setSystemDark] = useState(getSystemDark);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemDark);

  // Persist + apply
  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* noop */ }
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

  // Theme ID + colors
  const themeId = settings?.theme || ThemeOption.MODERN_GREEN;
  const themeData = THEME_COLORS[themeId] || THEME_COLORS[ThemeOption.MODERN_GREEN];

  // Primary color
  const DEFAULT_PRIMARY = '#10b981';
  const rawPrimary = String(settings?.primaryColor || '').trim().toLowerCase();
  const isLegacyGreen = rawPrimary === '#0e7a4d';
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(rawPrimary) && !isLegacyGreen ? rawPrimary : DEFAULT_PRIMARY;

  useEffect(() => {
    const root = document.documentElement;

    // Toggle .dark class
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Primary color
    root.style.setProperty('--primary-color', primaryColor);
    root.style.setProperty('--secondary-color', primaryColor);

    if (isDark) {
      // Dark mode premium (estética shadcn/zinc)
      root.style.setProperty('--bg-main', '#09090b');              // zinc-950
      root.style.setProperty('--bg-card', '#18181b');              // zinc-900
      root.style.setProperty('--bg-input', 'rgba(255,255,255,0.06)');
      root.style.setProperty('--bg-muted', 'rgba(255,255,255,0.08)');
      root.style.setProperty('--text-main', '#fafafa');            // zinc-50
      root.style.setProperty('--text-muted', '#a1a1aa');           // zinc-400
      root.style.setProperty('--border-color', '#27272a');         // zinc-800
      root.style.setProperty('--glass-border', 'rgba(255,255,255,0.08)');
    } else {
      // Light mode premium (estética asspen/shadcn — fundo quente, tinta escura)
      root.style.setProperty('--bg-main', '#f8fafc');              // slate-50
      root.style.setProperty('--bg-card', '#ffffff');              // white
      root.style.setProperty('--bg-input', 'rgba(0,0,0,0.03)');
      root.style.setProperty('--bg-muted', 'rgba(15,23,42,0.05)');
      root.style.setProperty('--text-main', '#0f172a');            // slate-900
      root.style.setProperty('--text-muted', '#64748b');           // slate-500
      root.style.setProperty('--border-color', '#e2e8f0');         // slate-200
      root.style.setProperty('--glass-border', 'rgba(15,23,42,0.08)');
    }

    // Wallpaper Global
    if (settings?.loginBgType === 'image' && settings?.loginBgUrl) {
      root.style.setProperty('--wallpaper-url', `url(${settings.loginBgUrl})`);
    } else {
      root.style.setProperty('--wallpaper-url', 'none');
    }
  }, [settings, primaryColor, isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, primaryColor, themeId, colors: themeData, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => useContext(ThemeContext);
export const useTheme = useThemeContext;
