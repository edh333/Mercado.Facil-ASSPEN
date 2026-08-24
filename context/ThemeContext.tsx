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

  // Visual institucional ASSPEN: verde como padrão (novas instalações e
  // configurações antigas sem tema definido).
  const themeId = settings?.theme || ThemeOption.MODERN_GREEN;
  const themeData = THEME_COLORS[themeId] || THEME_COLORS[ThemeOption.MODERN_GREEN];

  const DEFAULT_PRIMARY = '#0e7a4d';
  const rawPrimary = String(settings?.primaryColor || '').trim();
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(rawPrimary) ? rawPrimary : DEFAULT_PRIMARY;

  const isDark = false; // Light mode corporativo claro

  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty('--primary-color', primaryColor);
    root.style.setProperty('--secondary-color', primaryColor);

    // Light mode premium colors (estética asspen/shadcn — fundo quente, tinta escura, bordas sutis)
    root.style.setProperty('--bg-main', '#f7f7f4');              // warm background
    root.style.setProperty('--bg-card', '#ffffff');              // white
    root.style.setProperty('--bg-input', 'rgba(0,0,0,0.03)');
    root.style.setProperty('--text-main', '#1c2621');            // dark green-ink
    root.style.setProperty('--text-muted', '#7f8b84');           // gray-green
    root.style.setProperty('--border-color', '#e8e6e1');         // warm light border
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
