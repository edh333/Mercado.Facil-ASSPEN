import { describe, it, expect } from 'vitest';
import {
  formatCPF,
  formatPhone,
  validateCPF,
  cleanProductName,
  normalizeName,
  stringSimilarity,
  formatarMoeda,
  generatePixPayload,
  mascararCpf,
  isAdminRole,
} from '../utils';
import { montarEscPos, gerarCupomEntregaRaw, gerarRelatorioInadimplentes } from '../utils/printUtils';

describe('validateCPF', () => {
  it('aceita CPFs válidos', () => {
    expect(validateCPF('52998224725')).toBe(true);
    expect(validateCPF('11144477735')).toBe(true);
    expect(validateCPF('529.982.247-25')).toBe(true);
  });

  it('rejeita CPFs inválidos', () => {
    expect(validateCPF('52998224726')).toBe(false);
    expect(validateCPF('12345678900')).toBe(false);
    expect(validateCPF('00000000000')).toBe(false);
  });

  it('rejeita dígitos repetidos e entradas malformadas', () => {
    expect(validateCPF('11111111111')).toBe(false);
    expect(validateCPF('22222222222')).toBe(false);
    expect(validateCPF('123')).toBe(false);
    expect(validateCPF('')).toBe(false);
    expect(validateCPF('abc')).toBe(false);
  });
});

describe('formatCPF', () => {
  it('formata com máscara completa', () => {
    expect(formatCPF('12345678901')).toBe('123.456.789-01');
  });

  it('formata progressivamente e ignora não-dígitos', () => {
    expect(formatCPF('123456789')).toBe('123.456.789');
    expect(formatCPF('123.456.789-01')).toBe('123.456.789-01');
  });
});

describe('mascararCpf', () => {
  it('mascara o meio do CPF mantendo 3 primeiros e 2 últimos dígitos (LGPD)', () => {
    expect(mascararCpf('52998224725')).toBe('529.***.***-25');
    expect(mascararCpf('123.456.789-01')).toBe('123.***.***-01');
  });

  it('nunca expõe o CPF completo', () => {
    const mascarado = mascararCpf('52998224725');
    expect(mascarado).not.toContain('52998224725');
    expect(mascarado).not.toContain('9822');
  });

  it('retorna "***" para entradas vazias, curtas ou nulas', () => {
    expect(mascararCpf('')).toBe('***');
    expect(mascararCpf(null)).toBe('***');
    expect(mascararCpf(undefined)).toBe('***');
    expect(mascararCpf('123')).toBe('***');
  });
});

describe('formatPhone', () => {
  it('formata celular com DDD', () => {
    expect(formatPhone('65999999999')).toBe('(65) 99999-9999');
  });
});

describe('cleanProductName', () => {
  it('expande abreviações comuns', () => {
    expect(cleanProductName('BISC')).toBe('Biscoito');
    expect(cleanProductName('DET LIMAO')).toBe('Detergente Limao');
    expect(cleanProductName('SAB NEUTRO')).toBe('Sabonete Neutro');
  });

  it('remove preço e código do início', () => {
    expect(cleanProductName('1.75 CHOCOLATE LACTA')).toBe('Chocolate Lacta');
  });

  it('remove palavras-lixo e normaliza espaços', () => {
    expect(cleanProductName('ARROZ  5KG   PACOTE')).toMatch(/^Arroz 5kg/i);
  });

  it('retorna vazio para entrada vazia', () => {
    expect(cleanProductName('')).toBe('');
    expect(cleanProductName(null as unknown as string)).toBe('');
  });
});

describe('normalizeName', () => {
  it('remove acentos e caracteres especiais', () => {
    expect(normalizeName('Açúcar Refinado')).toBe('ACUCARREFINADO');
    expect(normalizeName('Chocolate Lacta')).toBe('CHOCOLATELACTA');
  });
});

describe('stringSimilarity', () => {
  it('retorna 1 para strings idênticas', () => {
    expect(stringSimilarity('arroz', 'arroz')).toBe(1);
    expect(stringSimilarity('', '')).toBe(1);
  });

  it('calcula similaridade de Levenshtein normalizada', () => {
    expect(stringSimilarity('abc', 'abd')).toBeCloseTo(2 / 3);
    expect(stringSimilarity('coca', 'cocacola')).toBeCloseTo(0.5);
  });
});

describe('formatarMoeda', () => {
  it('formata em pt-BR com 2 casas', () => {
    expect(formatarMoeda(10.5)).toBe('10,50');
    expect(formatarMoeda(1234.567)).toBe('1.234,57');
    expect(formatarMoeda(-5)).toBe('-5,00');
  });

  it('arredonda corretamente ponto flutuante', () => {
    expect(formatarMoeda(0.1 + 0.2)).toBe('0,30');
    expect(formatarMoeda(19.9 * 3)).toBe('59,70');
  });

  it('trata valores inválidos como zero', () => {
    expect(formatarMoeda(NaN)).toBe('0,00');
    expect(formatarMoeda(null as unknown as number)).toBe('0,00');
    expect(formatarMoeda(undefined as unknown as number)).toBe('0,00');
  });
});

describe('generatePixPayload', () => {
  const payload = generatePixPayload('11999999999', 'Mercado Facil', 'Cuiaba', 25.9, 'MERCFACIL-1');

  it('gera payload EMV estruturado', () => {
    expect(payload.startsWith('000201')).toBe(true);
    expect(payload).toContain('01');
    expect(payload).toContain('54');
  });

  it('termina com CRC16 válido (6304 + 4 hex maiúsculos)', () => {
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(/^[0-9A-F]{4}$/.test(payload.slice(-4))).toBe(true);
  });

  it('é determinístico para a mesma entrada', () => {
    expect(generatePixPayload('11999999999', 'Mercado Facil', 'Cuiaba', 25.9))
      .toBe(generatePixPayload('11999999999', 'Mercado Facil', 'Cuiaba', 25.9));
  });

  it('embute valor mínimo quando o montante é inválido', () => {
    const p = generatePixPayload('11999999999', 'Teste', 'Cuiaba', 0);
    expect(p).toContain('54040.01');
  });
});

describe('montarEscPos (ESC/POS 80mm)', () => {
  const decodificar = (base64: string) =>
    Array.from(atob(base64)).map(c => c.charCodeAt(0));

  it('inicia com ESC @ (reset) e define codepage PC850 + fonte A', () => {
    const bytes = decodificar(montarEscPos('TESTE\n'));
    expect(bytes.slice(0, 4)).toEqual([0x1B, 0x40, 0x1B, 0x74]);
    expect(bytes[4]).toBe(0x02);
    expect(bytes.slice(5, 8)).toEqual([0x1B, 0x4D, 0x00]);
    expect(bytes.slice(8, 10)).toEqual([0x1B, 0x61, 0x00].slice(0, 2));
  });

  it('converte acentos para PC850 (Ç → 0x80, Ã → 0xC7, É → 0x90) sem gerar 2 bytes', () => {
    const bytes = decodificar(montarEscPos('GRAÇA SÃO JOSÉ\n'));
    const conteudo = bytes.slice(11, bytes.length - 4);
    expect(conteudo).toContain(0x80);
    expect(conteudo).toContain(0xC7);
    expect(conteudo).toContain(0x90);
  });

  it('termina com avanço de papel + corte PARCIAL por padrão (GS V 1)', () => {
    const bytes = decodificar(montarEscPos('A\n'));
    expect(bytes[bytes.length - 3]).toBe(0x1D);
    expect(bytes[bytes.length - 2]).toBe(0x56);
    expect(bytes[bytes.length - 1]).toBe(0x01);
  });

  it('usa corte TOTAL quando cutMode=full (GS V 65 0)', () => {
    const bytes = decodificar(montarEscPos('A\n', { cutMode: 'full' }));
    expect(bytes[bytes.length - 4]).toBe(0x1D);
    expect(bytes[bytes.length - 3]).toBe(0x56);
    expect(bytes[bytes.length - 1]).toBe(0x00);
  });

  it('não corta quando autoCutPaper=false', () => {
    const bytes = decodificar(montarEscPos('A\n', { autoCutPaper: false }));
    expect(bytes.slice(-1)[0]).not.toBe(0x01);
  });

  it('abre gaveta (ESC p) apenas quando drawerKick=true', () => {
    const comGaveta = decodificar(montarEscPos('A\n', { drawerKick: true }));
    expect(comGaveta).toContain(0x1B);
    expect(comGaveta).toContain(0x70);
    const semGaveta = decodificar(montarEscPos('A\n'));
    expect(semGaveta).not.toContain(0x70);
  });

  it('cupom de entrega é texto 48 colunas com CNPJ, itens e totais', () => {
    const cupom = gerarCupomEntregaRaw({
      id: 'TESTE123',
      status: 'PREPARING',
      items: [{ name: 'ARROZ 5KG', quantity: 2, priceAtPurchase: 25.9 }],
      total: 51.8,
      payments: [{ method: 'CASH', amount: 60 }],
      change: 8.2,
    }, { institutionName: 'MERCADO FACIL', cnpj: '00.000.000/0001-00' });
    expect(cupom).toContain('CNPJ:');
    expect(cupom).toContain('NAO E DOCUMENTO FISCAL');
    expect(cupom).toContain('TOTAL PEDIDO:');
    expect(cupom).toContain('TROCO');
    expect(cupom).toContain('BOBINA 80MM');
    cupom.split('\n').forEach(linha => {
      expect(linha.length).toBeLessThanOrEqual(48);
    });
  });
});

describe('isAdminRole', () => {
  it('reconhece admin/master em qualquer formato gravado no Firestore', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('Master')).toBe(true);
    expect(isAdminRole('MASTER')).toBe(true);
    expect(isAdminRole(' master ')).toBe(true);
  });

  it('rejeita familiares e valores inv�lidos', () => {
    expect(isAdminRole('FAMILY')).toBe(false);
    expect(isAdminRole('FAMILIAR')).toBe(false);
    expect(isAdminRole('')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});

describe('gerarRelatorioInadimplentes (antiguidade da divida)', () => {
  const diasAtras = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  const contas = [
    { nome: 'RECENTE', currentDebt: 50, transactions: [{ type: 'debt', amount: 50, timestamp: diasAtras(2) }] },
    { nome: 'VELHO', currentDebt: 200, transactions: [{ type: 'debt', amount: 200, timestamp: diasAtras(45) }] },
    { nome: 'SEM REGISTRO', currentDebt: 80, transactions: [] },
    { nome: 'QUITADO', currentDebt: 0, transactions: [{ type: 'payment', amount: 30, timestamp: diasAtras(1) }] },
  ];

  it('lista apenas devedores e mostra dias sem movimento', () => {
    const r = gerarRelatorioInadimplentes(contas as any);
    expect(r).toContain('RECENTE');
    expect(r).toContain('VELHO');
    expect(r).toContain('ha 2 dia(s) sem movimento');
    expect(r).toContain('*** ha 45 dia(s)');
    expect(r).toContain('sem movimento registrado');
    expect(r).not.toContain('QUITADO');
  });

  it('resume por faixa de antiguidade', () => {
    const r = gerarRelatorioInadimplentes(contas as any);
    expect(r).toContain('ANTIGUIDADE DAS DIVIDAS');
    expect(r).toContain('ATE 15 DIAS');
    expect(r).toContain('MAIS DE 30 DIAS');
    // total geral = 50 + 200 + 80
    expect(r).toContain('330,00');
  });

  it('nenhuma linha passa de 40 colunas (bobina)', () => {
    const r = gerarRelatorioInadimplentes(contas as any);
    r.split('\n').forEach(l => expect(l.length).toBeLessThanOrEqual(40));
  });

  it('lista vazia nao quebra', () => {
    const r = gerarRelatorioInadimplentes([]);
    expect(r).toContain('Clientes com debito: 0');
  });
});
