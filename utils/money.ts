import { formatarMoeda } from '../utils';

const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const number = (valor: unknown): number => {
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
};

/**
 * Formata valor em Real completo: R$ 1.234,56
 */
export const formatBRL = (valor: number): string => {
  const v = number(valor);
  const centavos = Math.round(v * 100) / 100;
  return nfBRL.format(centavos).replace(/\u00A0/g, ' ');
};

/**
 * Formata com sinal explícito: "+ R$ 10,00" / "- R$ 10,00" (0 não tem sinal)
 */
export const formatBRLSigned = (valor: number): string => {
  const v = number(valor);
  if (Math.abs(v) < 0.005) return formatBRL(0);
  return v > 0 ? `+ ${formatBRL(v)}` : `- ${formatBRL(Math.abs(v))}`;
};

/**
 * Formata valor absoluto mantendo o sinal negativo à frente: "- R$ 12,34"
 */
export const formatBRLSignedAbs = (valor: number): string => {
  const v = number(valor);
  return v < 0 ? `- ${formatBRL(Math.abs(v))}` : formatBRL(v);
};

/**
 * Converte string de moeda de volta em número centavo-exato.
 * Padrão `parseMoeda` do utils.ts (compatível) — ponto de vírgula BR, senão ponto decimal.
 */
export const parseMoeda = (valor: string | number | null | undefined): number => {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') return isFinite(valor) ? valor : 0;
  const s = String(valor).trim();
  if (!s) return 0;
  const semSimbolo = s.replace(/[^\d,.\-]/g, '');
  const limpo = semSimbolo.includes(',') ? semSimbolo.replace(/\./g, '').replace(',', '.') : semSimbolo;
  const n = parseFloat(limpo);
  return isFinite(n) ? n : 0;
};

/**
 * Arredonda para centavos (evita 0.1 + 0.2 = 0.30000000000000004)
 */
export const roundCents = (valor: number): number => Math.round((valor + Number.EPSILON) * 100) / 100;

export { formatarMoeda };