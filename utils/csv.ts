/**
 * Neutraliza fórmula em célula de CSV (CSV injection).
 * Excel/LibreOffice executam células começadas por = + - @ (e tab/CR)
 * mesmo quando entre aspas — prefixar com apóstrofo força texto puro.
 */
export const celulaCsv = (valor: unknown): string => {
  const s = String(valor ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};
