import { formatarMoeda } from '../utils';

const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const number = (valor: unknown): number => {
  if (typeof valor === 'number') return isFinite(valor) ? valor : 0;
  return parseMoeda(valor as string);
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
 * Ponto de vírgula BR, senão ponto decimal.
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

/**
 * Preço praticado de venda de um produto. A promoção só vale quando é um
 * desconto REAL: `promoPrice > 0` E menor que o preço de tabela. É a regra
 * ÚNICA usada pelo servidor e por todo o cliente (catálogo, catálogo A4, PDV,
 * vitrine e carrinho) para que o preço exibido e o cobrado nunca divirjam.
 * Nunca cobra mais do que o preço de tabela.
 */
export const precoEfetivo = (p: { price?: unknown; promoPrice?: unknown } | null | undefined): number => {
  const preco = Number((p as any)?.price) || 0;
  const promo = Number((p as any)?.promoPrice);
  return Number.isFinite(promo) && promo > 0 && promo < preco ? promo : preco;
};

/**
 * Higieniza o que o usuário digita num campo de valor (moeda BR).
 *
 * Motivo: com `type="number"` + `Number(e.target.value)` o estado volta a
 * alimentar o input como NÚMERO, o React re-renderiza e apaga do DOM o que
 * ainda estava sendo digitado. Digitar "10,50" virava 105 (o teclado mobile
 * nem aceita vírgula) — e o valor vai direto para o QR do PIX, ou seja, o
 * familiar pagava 10x/100x o pretendido. Por isso o campo guarda TEXTO.
 *
 * Separadores (padrão pt-BR):
 *  - "1.234,56" (vírgula E ponto) → ponto é milhar: vira "1234,56"
 *  - "10,50" → vírgula é decimal
 *  - "10.50" → ponto com 1–2 casas é decimal; com 3 casas é milhar
 *  - resultado sempre normalizado para VÍRGULA, no máximo 2 casas
 */
export const sanitizeMoedaInput = (bruto: string): string => {
  const soNumeros = String(bruto ?? '').replace(/[^\d.,]/g, '');
  if (!soNumeros) return '';

  const temVirgula = soNumeros.includes(',');
  const temPonto = soNumeros.includes('.');
  let inteiro = '';
  let casas = '';

  if (temVirgula) {
    // Vírgula é sempre o decimal; pontos viram separador de milhar.
    const [antes, ...depois] = soNumeros.split(',');
    inteiro = antes.replace(/\./g, '');
    casas = depois.join('').replace(/\./g, '');
  } else if (temPonto) {
    const partes = soNumeros.split('.');
    const depoisDoPrimeiro = partes.slice(1).join('');
    // "10.50" (2 casas) é decimal; "1.234" (3 casas) é milhar.
    const ehMilhar = partes.length === 2 && depoisDoPrimeiro.length === 3;
    if (ehMilhar) {
      inteiro = soNumeros.replace(/\./g, '');
    } else {
      inteiro = partes[0];
      casas = depoisDoPrimeiro;
    }
  } else {
    inteiro = soNumeros;
  }

  inteiro = inteiro.replace(/\D/g, '').slice(0, 9);
  casas = casas.replace(/\D/g, '').slice(0, 2);
  if (casas) return `${inteiro},${casas}`;
  // Preserva o separador digitado no fim ("10,") para o familiar conseguir
  // continuar digitando os centavos sem o campo "engolir" o que ele digita.
  return /[.,]$/.test(soNumeros) ? `${inteiro},` : inteiro;
};

export { formatarMoeda };