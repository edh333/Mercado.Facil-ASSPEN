import { describe, it, expect } from 'vitest';
import { sanitizeMoedaInput, parseMoeda, roundCents } from '../utils/money';

// Regressão: o campo de valor do depósito usava type="number" com
// Number(e.target.value) e `value={depositAmount || ''}`. O React realimentava o
// input com NÚMERO e apagava do DOM o separador enquanto o familiar digitava —
// "10,50" virava 105 (e o teclado mobile nem aceita vírgula). Esse valor vai
// direto para o QR do PIX: o familiar pagava 10x/100x o pretendido.
describe('sanitizeMoedaInput (campo de valor do depósito)', () => {
  it('mantém a vírgula enquanto o usuário digita', () => {
    expect(sanitizeMoedaInput('10')).toBe('10');
    expect(sanitizeMoedaInput('10,')).toBe('10,');
    expect(sanitizeMoedaInput('10,5')).toBe('10,5');
    expect(sanitizeMoedaInput('10,50')).toBe('10,50');
  });

  it('NÃO transforma vírgula em nada (o bug do valor apagado)', () => {
    // A sequência que gerava R$ 1.050,00 / R$ 105,00:
    const digitado = '10,50';
    let texto = '';
    for (const ch of digitado) texto = sanitizeMoedaInput(texto + ch);
    expect(texto).toBe('10,50');
    expect(roundCents(parseMoeda(texto))).toBe(10.5);
  });

  it('aceita ponto como separador e normaliza para vírgula', () => {
    expect(sanitizeMoedaInput('10.50')).toBe('10,50');
    expect(roundCents(parseMoeda(sanitizeMoedaInput('10.50')))).toBe(10.5);
  });

  it('trata ponto como MILHAR quando há 3 casas (padrão pt-BR)', () => {
    expect(sanitizeMoedaInput('1.234')).toBe('1234');
    expect(roundCents(parseMoeda(sanitizeMoedaInput('1.234')))).toBe(1234);
  });

  it('não come a vírgula quando o usuário digita ponto por vírgula', () => {
    // "10." -> "10," e a casa vai sendo preenchida; no 3º dígito do grupo o
    // valor já virou 2 casas, então o agrupamento de milhar nunca engoliria
    // o que está sendo digitado.
    expect(sanitizeMoedaInput('10.')).toBe('10,');
    expect(sanitizeMoedaInput('10.5')).toBe('10,5');
  });

  it('ignora o segundo separador digitado', () => {
    expect(sanitizeMoedaInput('10,5,0')).toBe('10,50');
    expect(sanitizeMoedaInput('10.5.0')).toBe('10,50');
  });

  it('limita a 2 casas decimais', () => {
    expect(sanitizeMoedaInput('10,555')).toBe('10,55');
    expect(sanitizeMoedaInput('0,999')).toBe('0,99');
  });

  it('descarta letras e símbolos (colado de elsewhere)', () => {
    expect(sanitizeMoedaInput('R$ 1.234,56')).toBe('1234,56');
    expect(sanitizeMoedaInput('abc')).toBe('');
    expect(sanitizeMoedaInput('-50')).toBe('50');
  });

  it('nunca deixa um separador solto virar o número inteiro', () => {
    expect(roundCents(parseMoeda(sanitizeMoedaInput(',')))).toBe(0);
    expect(roundCents(parseMoeda(sanitizeMoedaInput('.')))).toBe(0);
  });

  it('string vazia zera o valor (permite sair do campo sem estado sujo)', () => {
    expect(sanitizeMoedaInput('')).toBe('');
    expect(roundCents(parseMoeda(''))).toBe(0);
  });

  it('não deixa o valor passar do teto do servidor com dígitos extras', () => {
    // teto de 100.000 no depósito; o usuário pode digitar e o servidor valida,
    // mas o campo não deve gerar lixo como "100000000000"
    const texto = sanitizeMoedaInput('100000000000');
    expect(texto.length).toBeLessThanOrEqual(10);
  });

  it('milhar pt-BR colado de outra tela vira o valor certo', () => {
    // "R$ 1.234,56" — antes o ponto era lido como decimal e o familiar
    // depositava R$ 1,23 em vez de R$ 1.234,56.
    expect(sanitizeMoedaInput('R$ 1.234,56')).toBe('1234,56');
    expect(roundCents(parseMoeda(sanitizeMoedaInput('R$ 1.234,56')))).toBe(1234.56);
  });
});