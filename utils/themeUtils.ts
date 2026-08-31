import { THEME_COLORS } from '../constants';
import { ThemeOption } from '../types';

const TAILWIND_COLOR_MAP: Record<string, string> = {
  'slate-50': '#f8fafc', 'slate-100': '#f1f5f9', 'slate-200': '#e2e8f0', 'slate-300': '#cbd5e1',
  'slate-400': '#94a3b8', 'slate-500': '#64748b', 'slate-600': '#475569', 'slate-700': '#334155',
  'slate-800': '#1e293b', 'slate-900': '#0f172a', 'slate-950': '#020617',
  'zinc-50': '#fafafa', 'zinc-100': '#f4f4f5', 'zinc-200': '#e4e4e7', 'zinc-300': '#d4d4d8',
  'zinc-400': '#a1a1aa', 'zinc-500': '#71717a', 'zinc-600': '#52525b', 'zinc-700': '#3f3f46',
  'zinc-800': '#27272a', 'zinc-900': '#18181b', 'zinc-950': '#09090b',
  'emerald-50': '#ecfdf5', 'emerald-100': '#d1fae5', 'emerald-200': '#a7f3d0', 'emerald-300': '#6ee7b7',
  'emerald-400': '#34d399', 'emerald-500': '#10b981', 'emerald-600': '#059669', 'emerald-700': '#047857',
  'emerald-800': '#065f46', 'emerald-900': '#064e3b', 'emerald-950': '#022c22',
  'blue-50': '#eff6ff', 'blue-100': '#dbeafe', 'blue-200': '#bfdbfe', 'blue-300': '#93c5fd',
  'blue-400': '#60a5fa', 'blue-500': '#3b82f6', 'blue-600': '#2563eb', 'blue-700': '#1d4ed8',
  'blue-800': '#1e3a8a', 'blue-900': '#1e3a8a', 'blue-950': '#172554',
  'purple-50': '#faf5ff', 'purple-100': '#f3e8ff', 'purple-200': '#e9d5ff', 'purple-300': '#d8b4fe',
  'purple-400': '#c084fc', 'purple-500': '#a855f7', 'purple-600': '#9333ea', 'purple-700': '#7e22ce',
  'purple-800': '#6b21a8', 'purple-900': '#581c87', 'purple-950': '#3b0764',
  'orange-50': '#fff7ed', 'orange-100': '#ffedd5', 'orange-200': '#fed7aa', 'orange-300': '#fdba74',
  'orange-400': '#fb923c', 'orange-500': '#f97316', 'orange-600': '#ea580c', 'orange-700': '#c2410c',
  'orange-800': '#9a3412', 'orange-900': '#7c2d12', 'orange-950': '#431407',
  'sky-50': '#f0f9ff', 'sky-100': '#e0f2fe', 'sky-200': '#bae6fd', 'sky-300': '#7dd3fc',
  'sky-400': '#38bdf8', 'sky-500': '#0ea5e9', 'sky-600': '#0284c7', 'sky-700': '#0369a1',
  'sky-800': '#075985', 'sky-900': '#0c4a6e', 'sky-950': '#082f49',
};

function parseTailwindColor(cls: string): string {
  if (!cls) return '#10b981';
  if (cls.startsWith('bg-[') && cls.endsWith(']')) {
    return cls.slice(4, -1);
  }
  if (cls.startsWith('text-[') && cls.endsWith(']')) {
    return cls.slice(6, -1);
  }
  const prefix = cls.startsWith('bg-') ? 'bg-' : cls.startsWith('text-') ? 'text-' : '';
  const colorName = cls.slice(prefix.length);
  return TAILWIND_COLOR_MAP[colorName] || '#10b981';
}

export function applyThemeColors(themeId: string = ThemeOption.MODERN_GREEN): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = THEME_COLORS[themeId] || THEME_COLORS[ThemeOption.MODERN_GREEN];

  const primary = parseTailwindColor(theme.primary);
  const secondary = parseTailwindColor(theme.secondary);
  const accent = parseTailwindColor(theme.accent);
  const bgLight = parseTailwindColor(theme.bg);
  const textLight = parseTailwindColor(theme.text);
  const price = parseTailwindColor(theme.price);
  const cardLight = parseTailwindColor(theme.card);

  root.style.setProperty('--primary-color', primary);
  root.style.setProperty('--secondary-color', secondary);
  root.style.setProperty('--accent-color', accent);
  root.style.setProperty('--price-color', price);

  const isDark = document.documentElement.classList.contains('dark');

  if (isDark) {
    root.style.setProperty('--bg-main', '#09090b');
    root.style.setProperty('--bg-card', '#18181b');
    root.style.setProperty('--bg-input', 'rgba(255,255,255,0.06)');
    root.style.setProperty('--text-main', '#fafafa');
    root.style.setProperty('--text-muted', '#a1a1aa');
    root.style.setProperty('--border-color', '#27272a');
    root.style.setProperty('--glass-border', 'rgba(255,255,255,0.08)');
  } else {
    root.style.setProperty('--bg-main', bgLight);
    root.style.setProperty('--bg-card', cardLight);
    root.style.setProperty('--bg-input', 'rgba(0,0,0,0.03)');
    root.style.setProperty('--text-main', textLight);
    root.style.setProperty('--text-muted', '#64748b');
    root.style.setProperty('--border-color', '#e2e8f0');
    root.style.setProperty('--glass-border', 'rgba(15,23,42,0.08)');
  }
}