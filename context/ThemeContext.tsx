import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useApp } from './StoreContext';
import { ThemeOption } from '../types';
import { THEME_COLORS } from '../constants';
import { applyThemeColors } from '../utils/themeUtils';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextData {
  isDark: boolean;
  primaryColor: string;
  themeId: string;
  colors: Record<string, string>;
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
  const themeColors = THEME_COLORS[themeId] || THEME_COLORS[ThemeOption.MODERN_GREEN];

  // Primary color
  const DEFAULT_PRIMARY = '#10b981';
  const rawPrimary = String(settings?.primaryColor || '').trim().toLowerCase();
  const isLegacyGreen = rawPrimary === '#0e7a4d';
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(rawPrimary) && !isLegacyGreen ? rawPrimary : DEFAULT_PRIMARY;

  useEffect(() => {
    applyThemeColors(themeId);
    
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    root.style.setProperty('--primary-color', primaryColor);
    root.style.setProperty('--secondary-color', primaryColor);
  }, [settings, primaryColor, isDark, themeId]);

  return (
    <ThemeContext.Provider value={{ isDark, primaryColor, themeId, colors: themeColors, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => useContext(ThemeContext);
export const useTheme = useThemeContext;
