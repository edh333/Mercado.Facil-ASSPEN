/**
 * Lembra a última aba aberta (painel admin e dashboard do usuário) em
 * localStorage para que, ao reabrir o app, o operador volte para onde estava
 * sem refazer a navegação a cada login. Tudo protegido (quota/privacidade):
 * falha silenciosa e sempre cai no padrão quando o valor guardado não é válido.
 */
const PREFIXO = 'mf_ultima_aba:';

const ehValida = (set: readonly string[]) => (aba: string): boolean =>
  (set as readonly string[]).includes(aba);

/** Abas do painel administrativo (ids exatos usados pelo AdminDashboard). */
export const ABAS_ADMIN = [
  'home', 'orders', 'products', 'stock_alerts', 'cash', 'inmates', 'users',
  'messages', 'finance', 'wallet', 'customers', 'audit', 'reports', 'bi',
  'maintenance', 'settings',
] as const;

/** Abas do dashboard do usuário comum. */
export const ABAS_USUARIO = ['store', 'orders'] as const;

export function salvarUltimaAba(chave: string, aba: string): void {
  try {
    localStorage.setItem(PREFIXO + chave, aba);
  } catch {
    /* lembrar aba é conveniência — nunca pode quebrar a tela */
  }
}

export function lerUltimaAba(chave: string, valida: (aba: string) => boolean, padrao: string): string {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    if (v && valida(v)) return v;
  } catch {
    /* ignora */
  }
  return padrao;
}

export const lerUltimaAbaAdmin = (): string =>
  lerUltimaAba('admin', ehValida(ABAS_ADMIN), 'home');
export const salvarUltimaAbaAdmin = (aba: string): void => salvarUltimaAba('admin', aba);

export const lerUltimaAbaUsuario = (): string =>
  lerUltimaAba('usuario', ehValida(ABAS_USUARIO), 'store');
export const salvarUltimaAbaUsuario = (aba: string): void => salvarUltimaAba('usuario', aba);