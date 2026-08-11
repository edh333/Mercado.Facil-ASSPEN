import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useApp } from './StoreContext';
import { THEME_COLORS } from '../constants';
import { ThemeOption } from '../types';

export interface ThemeContextData {
  isDark: boolean;
  primaryColor: string;
  themeId: string;
  colors: any;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useApp();

  const themeId = settings?.theme || ThemeOption.POLICE_MT;
  const themeData = THEME_COLORS[themeId] || THEME_COLORS[ThemeOption.POLICE_MT];

  const DEFAULT_PRIMARY = '#10b981';
  const rawPrimary = String(settings?.primaryColor || '').trim();
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(rawPrimary) ? rawPrimary : DEFAULT_PRIMARY;

  const isDark = false; // Light mode corporativo claro

  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty('--primary-color', primaryColor);
    root.style.setProperty('--secondary-color', primaryColor);

    // Light mode premium colors (corporativo claro)
    root.style.setProperty('--bg-main', '#f8fafc');              // slate-50
    root.style.setProperty('--bg-card', '#ffffff');              // white
    root.style.setProperty('--bg-input', 'rgba(0,0,0,0.03)');
    root.style.setProperty('--text-main', '#0f172a');            // slate-900
    root.style.setProperty('--text-muted', '#64748b');           // slate-500
    root.style.setProperty('--border-color', '#e2e8f0');         // slate-200
    root.style.setProperty('--glass-border', 'rgba(0,0,0,0.08)');

    // Wallpaper Global
    if (settings?.loginBgType === 'image' && settings?.loginBgUrl) {
      root.style.setProperty('--wallpaper-url', `url(${settings.loginBgUrl})`);
    } else {
      root.style.setProperty('--wallpaper-url', 'none');
    }

  }, [settings, primaryColor]);

  return (
    <ThemeContext.Provider value={{ isDark, primaryColor, themeId, colors: themeData }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => useContext(ThemeContext);
export const useTheme = useThemeContext;
