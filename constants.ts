import { PrisonUnit, ThemeOption } from './types';

export const ASSPEN_INFO = {
  name: "ASSOCIAÇÃO DOS SERVIDORES DO SISTEMA PENAL DE PEIXOTO DE AZEVEDO / MT - ASSPEN",
  cnpj: "53.100.595/0001-13",
  foundation: "17 de Outubro de 2023",
  email: "asspenpeixotodeazevedo@gmail.com",
  defaultPix: "53100595000113"
};

// Cores Profissionais, Vibrantes e de Alto Contraste
export const THEME_COLORS: Record<string, { primary: string; secondary: string; accent: string; bg: string; text: string }> = {
  [ThemeOption.POLICE_MT]: { 
    primary: 'bg-slate-900', 
    secondary: 'bg-slate-800', 
    accent: 'text-yellow-500', 
    bg: 'bg-slate-100',
    text: 'text-white'
  },
  [ThemeOption.PROFESSIONAL_BLUE]: { 
    primary: 'bg-blue-900', 
    secondary: 'bg-blue-800', 
    accent: 'text-blue-400', 
    bg: 'bg-blue-50',
    text: 'text-white'
  },
  [ThemeOption.MODERN_GREEN]: { 
    primary: 'bg-emerald-800', 
    secondary: 'bg-emerald-700', 
    accent: 'text-emerald-300', 
    bg: 'bg-emerald-50',
    text: 'text-white'
  },
  [ThemeOption.ELEGANT_PURPLE]: { 
    primary: 'bg-purple-900', 
    secondary: 'bg-purple-800', 
    accent: 'text-purple-300', 
    bg: 'bg-purple-50',
    text: 'text-white'
  },
  [ThemeOption.VIBRANT_ORANGE]: { 
    primary: 'bg-orange-700', 
    secondary: 'bg-orange-600', 
    accent: 'text-white', 
    bg: 'bg-orange-50',
    text: 'text-white'
  },
  [ThemeOption.HIGH_CONTRAST]: { 
    primary: 'bg-black', 
    secondary: 'bg-neutral-900', 
    accent: 'text-yellow-400', 
    bg: 'bg-white',
    text: 'text-white'
  },
  [ThemeOption.CYBER_DARK]: { 
    primary: 'bg-zinc-950', 
    secondary: 'bg-zinc-900', 
    accent: 'text-cyan-400', 
    bg: 'bg-zinc-900',
    text: 'text-cyan-400'
  },
  [ThemeOption.SOFT_PASTEL]: { 
    primary: 'bg-teal-700', // Substituído por Teal Forte para contraste
    secondary: 'bg-teal-600', 
    accent: 'text-teal-100', 
    bg: 'bg-teal-50',
    text: 'text-white'
  },
};

export const INITIAL_UNITS: PrisonUnit[] = [
  { id: '1', name: 'CDP Peixoto de Azevedo', city: 'Peixoto de Azevedo', bannedCategories: [], deliveryDays: [] },
];