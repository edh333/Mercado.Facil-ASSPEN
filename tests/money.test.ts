import { describe, it, expect } from 'vitest';
import { formatBRL, formatBRLSigned, formatBRLSignedAbs, parseMoeda, roundCents, precoEfetivo } from '../utils/money';
import { formatarMoeda } from '../utils';

describe('formatBRL', () => {
  it('formata valores inteiros', () => {
    expect(formatBRL(10)).toBe('R$ 10,00');
  });

  it('formata milhar', () => {
    expect(formatBRL(1234.56)).toBe('R$ 1.234,56');
  });

  it('formata centavos', () => {
    expect(formatBRL(0.5)).toBe('R$ 0,50');
    expect(formatBRL(123.4)).toBe('R$ 123,40');
  });

  it('trata NaN/undefined/null como zero', () => {
    expect(formatBRL(NaN as any)).toBe('R$ 0,00');
    expect(formatBRL(undefined as any)).toBe('R$ 0,00');
    expect(formatBRL(null as any)).toBe('R$ 0,00');
  });

  it('valores negativos', () => {
    expect(formatBRL(-12.34)).toBe('-R$ 12,34');
  });

  it('string com ponto decimal não vira milhar (regressão #10)', () => {
    expect(formatBRL('12.90' as any)).toBe('R$ 12,90');
    expect(formatBRL('45,67' as any)).toBe('R$ 45,67');
    expect(formatBRL('1.234,56' as any)).toBe('R$ 1.234,56');
  });
});

describe('formatBRLSigned', () => {
  it('adiciona sinal positivo', () => {
    expect(formatBRLSigned(10)).toBe('+ R$ 10,00');
  });

  it('adiciona sinal negativo', () => {
    expect(formatBRLSigned(-10)).toBe('- R$ 10,00');
  });

  it('zero sem sinal', () => {
    expect(formatBRLSigned(0)).toBe('R$ 0,00');
  });

  it('arredonda valores próximos de zero', () => {
    expect(formatBRLSigned(0.004)).toBe('R$ 0,00');
  });
});

describe('formatBRLSignedAbs', () => {
  it('mantém negativo à frente', () => {
    expect(formatBRLSignedAbs(-12.34)).toBe('- R$ 12,34');
  });

  it('positivo sem sinal', () => {
    expect(formatBRLSignedAbs(12.34)).toBe('R$ 12,34');
  });
});

describe('parseMoeda', () => {
  it('aceita número direto', () => {
    expect(parseMoeda(99.9)).toBe(99.9);
  });

  it('aceita vírgula como decimal (BR)', () => {
    expect(parseMoeda('1.234,56')).toBe(1234.56);
    expect(parseMoeda('10,50')).toBe(10.5);
  });

  it('aceita ponto como decimal (internacional)', () => {
    expect(parseMoeda('129.90')).toBe(129.9);
  });

  it('trata vazio como zero', () => {
    expect(parseMoeda('')).toBe(0);
    expect(parseMoeda(null)).toBe(0);
    expect(parseMoeda(undefined)).toBe(0);
  });

  it('superset com símbolo R$', () => {
    expect(parseMoeda('R$ 45,67')).toBe(45.67);
  });

  it('contagem física de caixa: milhar BR, zero e inválido', () => {
    expect(parseMoeda('2.500,00')).toBe(2500);
    expect(parseMoeda('0')).toBe(0);
    expect(parseMoeda('1340,5')).toBe(1340.5);
    expect(Number.isNaN(parseMoeda('abc'))).toBe(false);
  });
});

describe('roundCents', () => {
  it('arredonda ponto flutuante para centavos', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(10.005)).toBe(10.01);
  });
});

describe('precoEfetivo', () => {
  it('usa o preço de tabela quando não há promoção', () => {
    expect(precoEfetivo({ price: 10 })).toBe(10);
    expect(precoEfetivo({ price: 10, promoPrice: 0 })).toBe(10);
  });

  it('aplica a promoção quando é um desconto real', () => {
    expect(precoEfetivo({ price: 10, promoPrice: 7.5 })).toBe(7.5);
  });

  it('IGNORA promoção que não é desconto (nunca cobra mais que a tabela)', () => {
    expect(precoEfetivo({ price: 10, promoPrice: 12 })).toBe(10);
    expect(precoEfetivo({ price: 10, promoPrice: 10 })).toBe(10);
  });

  it('trata valores inválidos sem quebrar', () => {
    expect(precoEfetivo(null)).toBe(0);
    expect(precoEfetivo(undefined)).toBe(0);
    expect(precoEfetivo({ price: 'abc' } as any)).toBe(0);
    expect(precoEfetivo({ price: 10, promoPrice: NaN })).toBe(10);
    expect(precoEfetivo({ price: 10, promoPrice: -3 })).toBe(10);
  });
});

describe('formatarMoeda (compat)', () => {
  it('mantém função original', () => {
    expect(formatarMoeda(1234.56)).toBe('1.234,56');
  });
});