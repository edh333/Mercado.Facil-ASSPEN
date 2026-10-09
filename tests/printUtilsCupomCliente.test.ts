// Regressão do cupom térmico (utils/printUtils.ts -> gerarCupomEntregaRaw).
//
// Regra (pedido do usuário): o PRESO (destinatário da mercadoria) é o DESTAQUE
// do cupom — vem primeiro, em banda de realce "* DESTINATARIO: NOME *"; o
// familiar (titular da carteira, quem paga) vem depois, em texto de apoio.
// Sem qual dos dois, o cliente é rotulado como "CLIENTE"; nunca inventa
// FAMILIAR quando só existe o interno.
import { describe, it, expect } from 'vitest';
import { gerarCupomEntregaRaw } from '../utils/printUtils';

const vendaBase = {
  id: 'abc123def456',
  createdAt: '2026-03-05T14:30:00.000Z',
  operatorName: 'ADMIN',
  status: 'approved',
  items: [{ name: 'Cafe', qty: 2, price: 5, total: 10 }],
  paymentMethod: 'wallet',
  total: 10,
};

/** Índice da linha que contém um rótulo, ou -1. */
const linhaDoRotulo = (cupom: string, rotulo: string): number =>
  cupom.split('\n').findIndex(l => l.includes(rotulo));

describe('cupom térmico — preso é o destaque, familiar é apoio', () => {
  it('imprime DESTINATARIO (preso) antes do FAMILIAR', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: 'MARIA SOUZA',
      userCpf: '52998224725',
      inmateName: 'JOSÉ SOUZA',
      inmateCpf: '11144477735',
    });

    const iFam = linhaDoRotulo(cupom, 'FAMILIAR:');
    const iDest = linhaDoRotulo(cupom, 'DESTINATARIO:');

    expect(iDest).toBeGreaterThanOrEqual(0);
    expect(iFam).toBeGreaterThanOrEqual(0);
    expect(iDest).toBeLessThan(iFam);
  });

  it('preso sai em banda de destaque e o familiar em linha de apoio', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: 'MARIA SOUZA',
      inmateName: 'JOSÉ SOUZA',
    });
    expect(cupom).toMatch(/FAMILIAR:\s+MARIA SOUZA/);
    expect(cupom).toMatch(/\*\s+DESTINATARIO:\s+JOS. SOUZA\s+\*/);
  });

  it('não imprime duas vezes o mesmo nome quando só muda a caixa', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: 'MARIA SOUZA',
      inmateName: 'maria souza',
    });
    const ocorrencias = cupom.split('\n').filter(l => l.includes('MARIA SOUZA')).length;
    expect(ocorrencias).toBe(1);
    expect(linhaDoRotulo(cupom, 'DESTINATARIO:')).toBe(-1);
    expect(linhaDoRotulo(cupom, 'FAMILIAR:')).toBe(-1);
  });

  it('sem responsável cadastrado: o nome do interno vira DESTINATARIO e nenhum FAMILIAR é inventado', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: '',
      inmateName: 'DETENTO SILVA',
      inmateCpf: '11144477735',
    });
    expect(linhaDoRotulo(cupom, 'FAMILIAR:')).toBe(-1);
    const iDest = linhaDoRotulo(cupom, 'DESTINATARIO:');
    expect(iDest).toBeGreaterThanOrEqual(0);
    expect(cupom.split('\n')[iDest]).toContain('DETENTO SILVA');
    expect(cupom).toMatch(/CPF INTERNO:\s+111\.\*\*\*\.\*\*\*-35/);
  });

  it('mascara os dois CPFs e respeita o limite de 48 colunas', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: 'MARIA',
      userCpf: '52998224725',
      inmateName: 'JOSÉ',
      inmateCpf: '11144477735',
    });
    expect(cupom).toMatch(/CPF FAMILIAR:\s+529\.\*\*\*\.\*\*\*-25/);
    expect(cupom).toMatch(/CPF INTERNO:\s+111\.\*\*\*\.\*\*\*-35/);
    for (const linha of cupom.split('\n')) expect(linha.length).toBeLessThanOrEqual(48);
  });

  it('sem nenhum dos dois nomes, não imprime o bloco nem quebra o cupom', () => {
    const cupom = gerarCupomEntregaRaw({ ...vendaBase });
    expect(linhaDoRotulo(cupom, 'FAMILIAR:')).toBe(-1);
    expect(linhaDoRotulo(cupom, 'DESTINATARIO:')).toBe(-1);
    expect(cupom).toContain('CUPOM DE ENTREGA');
  });

  it('não quebra quando o pedido traz apenas prisonerName (alias legado)', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: 'MARIA',
      prisonerName: 'JOSÉ',
    });
    expect(cupom).toMatch(/FAMILIAR:\s+MARIA/);
    expect(linhaDoRotulo(cupom, 'DESTINATARIO:')).toBeGreaterThanOrEqual(0);
  });
});