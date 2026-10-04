// Regressão do cupom térmico (utils/printUtils.ts -> gerarCupomEntregaRaw).
//
// Bug: o cupom imprimia "DESTINATARIO" (nome do PRESO) na PRIMEIRA linha do
// bloco e o FAMILIAR (o titular da carteira, escolhido pelo operador na busca
// do PDV) vinha depois e ainda podia sumir quando os nomes coincidiam por
// diferença de caixa. Agora o responsável vem em destaque.
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

/** Índice da linha que começa com um rótulo, ou -1. */
const linhaDoRotulo = (cupom: string, rotulo: string): number =>
  cupom.split('\n').findIndex(l => l.trim().startsWith(rotulo));

describe('cupom térmico — destaque é o responsável', () => {
  it('imprime FAMILIAR antes de DESTINATARIO', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: 'MARIA SOUZA',
      userCpf: '52998224725',
      inmateName: 'JOSÉ SOUZA',
      inmateCpf: '11144477735',
    });

    const iFam = linhaDoRotulo(cupom, 'FAMILIAR:');
    const iDest = linhaDoRotulo(cupom, 'DESTINATARIO:');

    expect(iFam).toBeGreaterThanOrEqual(0);
    expect(iDest).toBeGreaterThanOrEqual(0);
    expect(iFam).toBeLessThan(iDest);
  });

  it('imprime o nome do responsável na linha de FAMILIAR e o do interno em DESTINATARIO', () => {
    const cupom = gerarCupomEntregaRaw({
      ...vendaBase,
      userName: 'MARIA SOUZA',
      inmateName: 'JOSÉ SOUZA',
    });
    expect(cupom).toMatch(/FAMILIAR:\s+MARIA SOUZA/);
    expect(cupom).toMatch(/DESTINATARIO:\s+JOS. SOUZA/);
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
    expect(cupom).toMatch(/DESTINATARIO:\s+JOS/);
  });
});