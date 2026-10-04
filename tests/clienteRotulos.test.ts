// Testes da fonte única de destaque de nome (utils/clienteRotulos.ts).
// O bug que motivou o módulo: o nome do INTERNO ocupava a linha de destaque
// (busca do PDV, cupom térmico e cupom de entrega) enquanto o RESPONSÁVEL —
// titular da carteira e quem o operador escolhe — ficava como texto secundário.
import { describe, it, expect } from 'vitest';
import { rotularCliente } from '../utils/clienteRotulos';

describe('rotularCliente — destaque é o responsável', () => {
  it('coloca o responsável em destaque e o interno como secundário', () => {
    const r = rotularCliente({
      name: 'MARIA SOUZA',
      cpf: '52998224725',
      inmateName: 'JOSÉ SOUZA',
      inmateCpf: '11144477735',
    });
    expect(r.responsavel).toBe('MARIA SOUZA');
    expect(r.responsavelCpf).toBe('52998224725');
    expect(r.interno).toBe('JOSÉ SOUZA');
    expect(r.internoCpf).toBe('11144477735');
    expect(r.semResponsavel).toBe(false);
  });

  it('aceita o formato de PEDIDO (userName/inmateName)', () => {
    const r = rotularCliente({
      userName: 'ANA PAULA',
      userCpf: '52998224725',
      inmateName: 'CARLOS PAULA',
    });
    expect(r.responsavel).toBe('ANA PAULA');
    expect(r.interno).toBe('CARLOS PAULA');
  });

  it('aceita o alias legado prisonerName', () => {
    const r = rotularCliente({ name: 'FAMILIAR', prisonerName: 'INTERNO' });
    expect(r.responsavel).toBe('FAMILIAR');
    expect(r.interno).toBe('INTERNO');
  });

  it('prioriza name sobre userName quando ambos existem', () => {
    const r = rotularCliente({ name: 'DO CADASTRO', userName: 'DO PEDIDO' });
    expect(r.responsavel).toBe('DO CADASTRO');
  });
});

describe('rotularCliente — nunca mostra campo em branco', () => {
  it('sem responsável, o interno assume o destaque e avisa semResponsavel', () => {
    const r = rotularCliente({ name: '', inmateName: 'DETENTO', inmateCpf: '11144477735' });
    expect(r.responsavel).toBe('DETENTO');
    expect(r.responsavelCpf).toBe('11144477735');
    expect(r.interno).toBe('');
    expect(r.internoCpf).toBe('');
    expect(r.semResponsavel).toBe(true);
  });

  it('sem responsável e sem interno devolve vazio (a UI decide o fallback)', () => {
    const r = rotularCliente({});
    expect(r.responsavel).toBe('');
    expect(r.interno).toBe('');
    expect(r.semResponsavel).toBe(false);
  });

  it('tolera null/undefined e fonte inexistente', () => {
    expect(rotularCliente(null).responsavel).toBe('');
    expect(rotularCliente(undefined).responsavel).toBe('');
    expect(rotularCliente({ name: null, inmateName: undefined }).responsavel).toBe('');
  });
});

describe('rotularCliente — nunca duplica o mesmo nome', () => {
  it('mesmo nome (diferente só de caixa/espaço) imprime uma vez só', () => {
    const r = rotularCliente({
      name: 'MARIA  SOUZA',
      cpf: '52998224725',
      inmateName: 'maria souza',
      inmateCpf: '52998224725',
    });
    expect(r.responsavel).toBe('MARIA  SOUZA');
    expect(r.interno).toBe('');
    expect(r.internoCpf).toBe('');
  });

  it('mesma pessoa ignorando acentos', () => {
    const r = rotularCliente({ name: 'JOSÉ ÁVILA', inmateName: 'jose avila' });
    expect(r.interno).toBe('');
    expect(r.responsavel).toBe('JOSÉ ÁVILA');
  });

  it('nome igual mas responsável sem CPF: preserva o CPF do interno', () => {
    const r = rotularCliente({ name: 'MARIA', cpf: '', inmateName: 'MARIA', inmateCpf: '52998224725' });
    expect(r.responsavel).toBe('MARIA');
    expect(r.responsavelCpf).toBe('52998224725');
    expect(r.interno).toBe('');
  });

  it('nomes DIFERENTES continuam aparecendo os dois', () => {
    const r = rotularCliente({ name: 'MARIA', inmateName: 'JOSÉ' });
    expect(r.interno).toBe('JOSÉ');
  });
});

describe('rotularCliente — normalização', () => {
  it('ignora string só com espaços', () => {
    const r = rotularCliente({ name: '   ', inmateName: '  JOÃO  ' });
    expect(r.responsavel).toBe('JOÃO');
    expect(r.semResponsavel).toBe(true);
  });

  it('preserva a grafia original (não uppercases)', () => {
    const r = rotularCliente({ name: 'Maria Souza', inmateName: 'José Souza' });
    expect(r.responsavel).toBe('Maria Souza');
    expect(r.interno).toBe('José Souza');
  });
});
