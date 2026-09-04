import { PrisonUnit, ThemeOption } from './types';

export const ASSPEN_INFO = {
  name: "ASSOCIAÇÃO DOS SERVIDORES DO SISTEMA PENAL DE PEIXOTO DE AZEVEDO / MT - ASSPEN",
  cnpj: "53.100.595/0001-13",
  foundation: "17 de Outubro de 2023",
  email: "asspenpeixotodeazevedo@gmail.com",
  defaultPix: "53100595000113"
};

// Cores Profissionais, Vibrantes e de Alto Contraste
export const THEME_COLORS: Record<string, {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
  price: string;
  card: string;
}> = {
  [ThemeOption.POLICE_MT]: {
    primary: 'bg-[#0f172a]', // Slate 950 (Professional Navy)
    secondary: 'bg-[#1e293b]', // Slate 800
    accent: 'text-[#38bdf8]', // Sky 400
    bg: 'bg-slate-50',
    text: 'text-slate-950', // Quase preto para máximo contraste
    price: 'text-black',
    card: 'bg-white'
  },

  [ThemeOption.PROFESSIONAL_BLUE]: {
    primary: 'bg-blue-700',
    secondary: 'bg-blue-600',
    accent: 'text-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-900',
    price: 'text-blue-700',
    card: 'bg-white'
  },
  [ThemeOption.MODERN_GREEN]: {
    primary: 'bg-[#064e3b]', // Emerald 900 (Deep Forest)
    secondary: 'bg-[#065f46]', // Emerald 800
    accent: 'text-[#10b981]', // Emerald 500
    bg: 'bg-emerald-50',
    text: 'text-emerald-900',
    price: 'text-[#064e3b]',
    card: 'bg-white'
  },

  [ThemeOption.ELEGANT_PURPLE]: {
    primary: 'bg-purple-700',
    secondary: 'bg-purple-600',
    accent: 'text-purple-500',
    bg: 'bg-purple-50',
    text: 'text-purple-900',
    price: 'text-purple-700',
    card: 'bg-white'
  },
  [ThemeOption.VIBRANT_ORANGE]: {
    primary: 'bg-orange-600',
    secondary: 'bg-orange-500',
    accent: 'text-orange-600',
    bg: 'bg-orange-50',
    text: 'text-orange-950',
    price: 'text-orange-700',
    card: 'bg-white'
  },
  [ThemeOption.HIGH_CONTRAST]: {
    primary: 'bg-black',
    secondary: 'bg-zinc-800',
    accent: 'text-black',
    bg: 'bg-white',
    text: 'text-black',
    price: 'text-black',
    card: 'bg-white'
  },
  [ThemeOption.CYBER_DARK]: {
    primary: 'bg-zinc-950',
    secondary: 'bg-zinc-900',
    accent: 'text-cyan-400',
    bg: 'bg-zinc-950',
    text: 'text-white',
    price: 'text-cyan-400',
    card: 'bg-zinc-900 shadow-cyan-900/10'
  },
  'ECOSENTARU': {
    primary: 'bg-[#1a2e35]', // Deep Navy Green
    secondary: 'bg-[#253d44]',
    accent: 'text-[#e67e22]', // Carrot Orange
    bg: 'bg-[#f4f7f6]',
    text: 'text-slate-800',
    price: 'text-[#1a2e35]',
    card: 'bg-white shadow-sm border-t-4 border-t-[#e67e22]'
  },
  'POLICE_DARK': {
    primary: 'bg-black',
    secondary: 'bg-slate-900',
    accent: 'text-yellow-500',
    bg: 'bg-[#0f172a]',
    text: 'text-slate-100',
    price: 'text-yellow-500',
    card: 'bg-slate-800 border border-slate-700'
  },
  [ThemeOption.SOFT_PASTEL]: {
    primary: 'bg-teal-700',
    secondary: 'bg-teal-600',
    accent: 'text-teal-500',
    bg: 'bg-teal-50',
    text: 'text-teal-900',
    price: 'text-teal-700',
    card: 'bg-white'
  },
  [ThemeOption.WINDOWS_BLUE]: {
    primary: 'bg-[#0078D4]',
    secondary: 'bg-[#005A9E]',
    accent: 'text-[#60CDFF]',
    bg: 'bg-slate-50',
    text: 'text-slate-900',
    price: 'text-[#0078D4]',
    card: 'bg-white'
  },
};

export const INITIAL_UNITS: PrisonUnit[] = [
  { id: '1', name: 'CDP Peixoto de Azevedo', city: 'Peixoto de Azevedo', bannedCategories: [], deliveryDays: [] },
];