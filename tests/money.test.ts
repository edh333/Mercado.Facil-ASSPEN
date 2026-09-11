import { describe, it, expect } from 'vitest';
import { formatBRL, formatBRLSigned, formatBRLSignedAbs, parseMoeda, roundCents } from '../utils/money';
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
});

describe('roundCents', () => {
  it('arredonda ponto flutuante para centavos', () => {
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(roundCents(10.005)).toBe(10.01);
  });
});

describe('formatarMoeda (compat)', () => {
  it('mantém função original', () => {
    expect(formatarMoeda(1234.56)).toBe('1.234,56');
  });
});