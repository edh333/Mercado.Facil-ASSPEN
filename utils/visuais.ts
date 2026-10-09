/**
 * Sistema de VISUAIS do app: cada visual define acento + superfícies (fundo,
 * cartão, texto, bordas) nos modos CLARO e ESCURO, via variáveis CSS.
 *
 * - Padrão de fábrica: 'modern_green' (Esmeralda — zinc quente + verde).
 * - Padrao do admin (fleet): settings/general.theme (grid de Configurações).
 * - Override por dispositivo: localStorage 'mf_visual_local' (troca rápida na
 *   barra lateral). 'auto' = seguir o padrão do admin.
 *
 * Regra de acento: se o id tem preset, o acento vem do preset (varia por modo,
 * garantindo contraste no escuro). primaryColor do settings só é usado em
 * fallback para id desconhecido (dado legado) — o grid antigo gravava
 * '#0e7a4d'/'#064e3b' etc., que hoje não podem prender o app no verde escuro.
 */
import { ThemeOption } from '../types';

export interface Superficie {
  bgMain: string;
  bgCard: string;
  bgInput: string;
  bgMuted: string;
  textMain: string;
  textMuted: string;
  border: string;
  glassBorder: string;
}

export interface VisualPreset {
  id: string;
  label: string;
  desc: string;
  /** Acento do modo CLARO (precisa sustentar texto branco em botões). */
  primaryLight: string;
  /** Acento do modo ESCURO (precisa ler sobre fundo escuro). */
  primaryDark: string;
  light: Superficie;
  dark: Superficie;
}

/** Superfícies neutras quentes (zinc) — base dos visuais "neutros". */
const ZINC_LIGHT: Superficie = {
  bgMain: '#fafaf9', bgCard: '#ffffff', bgInput: 'rgba(24,24,27,0.045)',
  bgMuted: 'rgba(24,24,27,0.055)', textMain: '#18181b', textMuted: '#71717a',
  border: '#e4e4e7', glassBorder: 'rgba(24,24,27,0.08)',
};
const ZINC_DARK: Superficie = {
  bgMain: '#09090b', bgCard: '#18181b', bgInput: 'rgba(255,255,255,0.06)',
  bgMuted: 'rgba(255,255,255,0.08)', textMain: '#fafafa', textMuted: '#a1a1aa',
  border: '#27272a', glassBorder: 'rgba(255,255,255,0.08)',
};

/** Superfícies frias (slate) — identidade institucional de polícia penal. */
const SLATE_LIGHT: Superficie = {
  bgMain: '#f1f5f9', bgCard: '#ffffff', bgInput: 'rgba(15,23,42,0.045)',
  bgMuted: 'rgba(15,23,42,0.055)', textMain: '#0f172a', textMuted: '#64748b',
  border: '#e2e8f0', glassBorder: 'rgba(15,23,42,0.08)',
};
const SLATE_DARK: Superficie = {
  bgMain: '#0f172a', bgCard: '#1e293b', bgInput: 'rgba(255,255,255,0.06)',
  bgMuted: 'rgba(255,255,255,0.08)', textMain: '#f1f5f9', textMuted: '#94a3b8',
  border: '#334155', glassBorder: 'rgba(255,255,255,0.08)',
};

/** Superfícies azuladas corporativas. */
const BLUE_LIGHT: Superficie = {
  bgMain: '#f4f7fb', bgCard: '#ffffff', bgInput: 'rgba(15,23,42,0.045)',
  bgMuted: 'rgba(15,23,42,0.055)', textMain: '#0f172a', textMuted: '#64748b',
  border: '#e2e8f0', glassBorder: 'rgba(15,23,42,0.08)',
};
const BLUE_DARK: Superficie = {
  bgMain: '#0b1220', bgCard: '#131b2c', bgInput: 'rgba(255,255,255,0.06)',
  bgMuted: 'rgba(255,255,255,0.08)', textMain: '#e8eefb', textMuted: '#93a5c1',
  border: '#243247', glassBorder: 'rgba(255,255,255,0.08)',
};

/** Superfícies cibernéticas (frio esverdeado no escuro). */
const CYBER_DARK: Superficie = {
  bgMain: '#0a0f16', bgCard: '#111823', bgInput: 'rgba(255,255,255,0.06)',
  bgMuted: 'rgba(255,255,255,0.08)', textMain: '#e2e8f0', textMuted: '#94a3b8',
  border: '#1f2a38', glassBorder: 'rgba(255,255,255,0.08)',
};

/** Alto contraste: preto/branco puros, bordas marcadas. */
const HC_LIGHT: Superficie = {
  bgMain: '#ffffff', bgCard: '#ffffff', bgInput: 'rgba(0,0,0,0.06)',
  bgMuted: 'rgba(0,0,0,0.07)', textMain: '#000000', textMuted: '#3f3f46',
  border: '#0f172a', glassBorder: 'rgba(0,0,0,0.25)',
};
const HC_DARK: Superficie = {
  bgMain: '#000000', bgCard: '#0a0a0a', bgInput: 'rgba(255,255,255,0.1)',
  bgMuted: 'rgba(255,255,255,0.12)', textMain: '#ffffff', textMuted: '#d4d4d8',
  border: '#a1a1aa', glassBorder: 'rgba(255,255,255,0.2)',
};

/** Visuais exibidos no seletor (curadoria). Os demais ids existem para
 *  compatibilidade com seleções antigas gravadas em settings/general.theme. */
export const VISUAIS_NO_SELETOR = [
  ThemeOption.MODERN_GREEN,
  ThemeOption.POLICE_MT,
  ThemeOption.PROFESSIONAL_BLUE,
  ThemeOption.ELEGANT_PURPLE,
  ThemeOption.VIBRANT_ORANGE,
  ThemeOption.HIGH_CONTRAST,
] as const;

export const VISUAL_PRESETS: Record<string, VisualPreset> = {
  [ThemeOption.MODERN_GREEN]: {
    id: ThemeOption.MODERN_GREEN,
    label: 'Esmeralda',
    desc: 'Neutro quente e verde sóbrio (padrão)',
    primaryLight: '#059669', primaryDark: '#10b981',
    light: ZINC_LIGHT, dark: ZINC_DARK,
  },
  [ThemeOption.POLICE_MT]: {
    id: ThemeOption.POLICE_MT,
    label: 'Institucional',
    desc: 'Azul policial, sério e formal',
    primaryLight: '#0369a1', primaryDark: '#38bdf8',
    light: SLATE_LIGHT, dark: SLATE_DARK,
  },
  [ThemeOption.PROFESSIONAL_BLUE]: {
    id: ThemeOption.PROFESSIONAL_BLUE,
    label: 'Corporativo',
    desc: 'Azul de negócios, clean',
    primaryLight: '#2563eb', primaryDark: '#60a5fa',
    light: BLUE_LIGHT, dark: BLUE_DARK,
  },
  [ThemeOption.ELEGANT_PURPLE]: {
    id: ThemeOption.ELEGANT_PURPLE,
    label: 'Violeta',
    desc: 'Roxo elegante',
    primaryLight: '#7c3aed', primaryDark: '#a78bfa',
    light: ZINC_LIGHT, dark: ZINC_DARK,
  },
  [ThemeOption.VIBRANT_ORANGE]: {
    id: ThemeOption.VIBRANT_ORANGE,
    label: 'Âmbar',
    desc: 'Laranja vibrante e energético',
    primaryLight: '#ea580c', primaryDark: '#fb923c',
    light: ZINC_LIGHT, dark: ZINC_DARK,
  },
  [ThemeOption.HIGH_CONTRAST]: {
    id: ThemeOption.HIGH_CONTRAST,
    label: 'Alto Contraste',
    desc: 'Máxima legibilidade (preto/branco)',
    primaryLight: '#18181b', primaryDark: '#3b82f6',
    light: HC_LIGHT, dark: HC_DARK,
  },
  [ThemeOption.CYBER_DARK]: {
    id: ThemeOption.CYBER_DARK,
    label: 'Cyber Dark',
    desc: 'Ciano futurista sobre escuro',
    primaryLight: '#0891b2', primaryDark: '#06b6d4',
    light: ZINC_LIGHT, dark: CYBER_DARK,
  },
  [ThemeOption.SOFT_PASTEL]: {
    id: ThemeOption.SOFT_PASTEL,
    label: 'Soft Pastel',
    desc: 'Verde-água suave',
    primaryLight: '#0d9488', primaryDark: '#14b8a6',
    light: ZINC_LIGHT, dark: ZINC_DARK,
  },
  [ThemeOption.WINDOWS_BLUE]: {
    id: ThemeOption.WINDOWS_BLUE,
    label: 'Windows Blue',
    desc: 'Azul clássico',
    primaryLight: '#0078d4', primaryDark: '#0078d4',
    light: ZINC_LIGHT, dark: ZINC_DARK,
  },
};

export const VISUAL_PADRAO = ThemeOption.MODERN_GREEN;

/** Sentinelas do override por dispositivo. */
export const VISUAL_AUTO = 'auto';
const CHAVE_LOCAL = 'mf_visual_local';

export function lerVisualLocal(): string {
  try {
    const v = localStorage.getItem(CHAVE_LOCAL);
    if (v === VISUAL_AUTO || (v && v in VISUAL_PRESETS)) return v;
  } catch { /* noop */ }
  return VISUAL_AUTO;
}

export function salvarVisualLocal(id: string): void {
  try { localStorage.setItem(CHAVE_LOCAL, id); } catch { /* noop */ }
}

interface ResolverParams {
  /** 'auto' ou id do visual (override deste dispositivo). */
  overrideLocal?: string | null;
  /** settings/general.theme (padrão do admin). */
  themeFleet?: string | null;
  /** settings/general.primaryColor (só usado em id desconhecido — legado). */
  primaryFleet?: string | null;
  isDark: boolean;
}

export interface VisualResolvido {
  id: string;
  preset: VisualPreset;
  primary: string;
  superficie: Superficie;
}

/**
 * Resolve qual visual aplicar e qual acento/superfícies usar.
 * Precedência: override local > preset do admin > default de fábrica.
 */
export function resolverVisual(p: ResolverParams): VisualResolvido {
  const local = p.overrideLocal && p.overrideLocal !== VISUAL_AUTO ? p.overrideLocal : null;
  const fleet = p.themeFleet && p.themeFleet in VISUAL_PRESETS ? p.themeFleet : null;

  const acento = (preset: VisualPreset) => (p.isDark ? preset.primaryDark : preset.primaryLight);

  // Override local (sempre id de preset válido na prática).
  if (local && local in VISUAL_PRESETS) {
    const preset = VISUAL_PRESETS[local];
    return { id: local, preset, primary: acento(preset), superficie: p.isDark ? preset.dark : preset.light };
  }

  // Preset do admin (fleet).
  if (fleet && fleet in VISUAL_PRESETS) {
    const preset = VISUAL_PRESETS[fleet];
    return { id: fleet, preset, primary: acento(preset), superficie: p.isDark ? preset.dark : preset.light };
  }

  // Id desconhecido (dado antigo): superfícies padrão + acento legado se válido.
  const preset = VISUAL_PRESETS[VISUAL_PADRAO];
  const legado = String(p.primaryFleet || '').trim();
  const verdeLegado = legado.toLowerCase() === '#0e7a4d'; // verde antigo ignorado
  const acentoLegado = /^#[0-9a-fA-F]{6}$/.test(legado) && !verdeLegado ? legado : null;
  return {
    id: VISUAL_PADRAO, preset,
    primary: acentoLegado || acento(preset),
    superficie: p.isDark ? preset.dark : preset.light,
  };
}
