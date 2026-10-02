// Testes da tradução de erro na aprovação de depósito.
//
// Bug que motivou: o admin aprovava um depósito cujo comprovante JÁ TINHA
// SIDO USADO, o servidor recusava corretamente (o crédito nunca era liberado),
// mas a tela mostrava "Erro ao aprovar: falha desconhecida" e fechava o modal.
// A causa real — "Comprovante já utilizado em outro depósito (#id)" — já era
// devolvida pelo servidor e simplesmente nunca chegava ao admin.
//
// Aqui se garante que cada causa chegue com texto acionável.

import { describe, it, expect } from 'vitest';
import { explicarErroAprovacao, mensagemDoErro } from '../utils/erroAprovacao';

describe('mensagemDoErro', () => {
  it('remove o prefixo de código do Firebase', () => {
    // Formato real do httpsCallable: "(already-exists) texto"
    expect(mensagemDoErro({ message: '(already-exists) Comprovante já utilizado.' }))
      .toBe('Comprovante já utilizado.');
    expect(mensagemDoErro({ message: '(functions/already-exists) Texto.' }))
      .toBe('Texto.');
  });

  it('preserva a mensagem quando não há prefixo', () => {
    expect(mensagemDoErro({ message: 'Valor de depósito inválido.' }))
      .toBe('Valor de depósito inválido.');
  });

  it('aceita string, objeto com details e vazio', () => {
    expect(mensagemDoErro('Falha simples')).toBe('Falha simples');
    expect(mensagemDoErro({ details: { message: 'Pelo details' } })).toBe('Pelo details');
    expect(mensagemDoErro(null)).toBe('');
    expect(mensagemDoErro(undefined)).toBe('');
  });
});

describe('comprovante já utilizado (o caso reportado)', () => {
  const erroServidor = {
    code: 'functions/already-exists',
    message: '(already-exists) Comprovante já utilizado em outro depósito. Depósito recusado automaticamente.',
  };

  it('traduz o erro de duplicidade com texto claro', () => {
    const r = explicarErroAprovacao(erroServidor);
    expect(r.motivo).toBe('comprovante-duplicado');
    expect(r.fraude).toBe(true);
    expect(r.transitorio).toBe(false);
    expect(r.mensagem).toMatch(/comprovante já utilizado/i);
  });

  it('diz que cada comprovante só pode ser usado uma vez', () => {
    expect(explicarErroAprovacao(erroServidor).mensagem)
      .toMatch(/uma vez/i);
  });

  it('NUNCA diz "falha desconhecida" para duplicidade', () => {
    expect(explicarErroAprovacao(erroServidor).mensagem.toLowerCase())
      .not.toMatch(/desconhecida/);
  });

  it('inclui o ID do depósito conflitante quando o servidor informa', () => {
    const comId = {
      code: 'functions/invalid-argument',
      message: 'Comprovante já utilizado em outro depósito (#dep-abc-123).',
    };
    const r = explicarErroAprovacao(comId);
    expect(r.motivo).toBe('comprovante-duplicado');
    expect(r.mensagem).toContain('#dep-abc-123');
  });

  it('reconhece duplicidade pelo texto mesmo sem o código already-exists', () => {
    // Validação por hash acontece antes da transação e responde
    // invalid-argument: o texto é a única pista.
    const r = explicarErroAprovacao({
      code: 'functions/invalid-argument',
      message: 'Comprovante já utilizado em outro pedido (#x1). Cada comprovante só pode ser usado uma vez.',
    });
    expect(r.motivo).toBe('comprovante-duplicado');
    expect(r.mensagem).toMatch(/comprovante já utilizado/i);
  });

  it('trata reenvio do mesmo comprovante em outro pedido como duplicidade', () => {
    expect(explicarErroAprovacao({ message: 'Comprovante já utilizado em outro pedido (#p9).' }).motivo)
      .toBe('comprovante-duplicado');
  });
});

describe('outras causas de recusa', () => {
  it('comprovante ausente', () => {
    const r = explicarErroAprovacao({ code: 'invalid-argument', message: 'Depósito sem comprovante válido. Exija o envio da imagem do comprovante PIX.' });
    expect(r.motivo).toBe('comprovante-ausente');
    expect(r.mensagem).toMatch(/comprovante/i);
  });

  it('arquivo pequeno demais (PDF/print cortado)', () => {
    const r = explicarErroAprovacao({ message: 'Comprovante suspeito: arquivo muito pequeno para ser um recibo real.' });
    expect(r.motivo).toBe('comprovante-invalido');
    expect(r.mensagem).toMatch(/pe[çc]a|comprovante completo/i);
  });

  it('tipo de arquivo não permitido', () => {
    expect(explicarErroAprovacao({ message: 'Tipo de arquivo de comprovante não permitido.' }).motivo)
      .toBe('comprovante-invalido');
  });

  it('senha do administrador não validada', () => {
    const r = explicarErroAprovacao({ message: 'Senha do administrador inválida ou não autorizada.' });
    expect(r.motivo).toBe('sem-senha');
    expect(r.fraude).toBe(false);
  });

  it('transação já processada antes', () => {
    expect(explicarErroAprovacao({ message: 'Esta transação já foi processada.' }).motivo)
      .toBe('ja-processado');
  });

  it('saldo insuficiente', () => {
    expect(explicarErroAprovacao({ message: 'Saldo insuficiente na carteira.' }).motivo)
      .toBe('saldo-insuficiente');
  });

  it('sessão expirada', () => {
    expect(explicarErroAprovacao({ code: 'functions/unauthenticated', message: 'Unauthenticated.' }).motivo)
      .toBe('sessao-expirada');
  });
});

describe('erros transitórios (vale tentar de novo)', () => {
  it('sem conexão', () => {
    const r = explicarErroAprovacao({ code: 'functions/unavailable', message: 'internal Server Error' });
    expect(r.transitorio).toBe(true);
    expect(r.mensagem).toMatch(/tente novamente/i);
  });

  it('timeout', () => {
    const r = explicarErroAprovacao({ code: 'functions/deadline-exceeded', message: 'deadline exceeded' });
    expect(r.transitorio).toBe(true);
    expect(r.motivo).toBe('sem-resposta');
  });

  it('muitas tentativas', () => {
    const r = explicarErroAprovacao({ code: 'functions/resource-exhausted', message: 'Rate limit' });
    expect(r.transitorio).toBe(true);
    expect(r.mensagem).toMatch(/1 minuto/i);
  });
});

describe('fallback preserva a causa real', () => {
  it('usa a mensagem do servidor quando ela é informativa', () => {
    const r = explicarErroAprovacao({ message: 'Valor de depósito acima do teto permitido (R$ 100.000,00).' });
    expect(r.mensagem).toMatch(/teto/i);
    expect(r.mensagem).not.toMatch(/desconhecida/i);
  });

  it('só mostra genérico quando não há mensagem alguma', () => {
    const r = explicarErroAprovacao({});
    expect(r.motivo).toBe('desconhecido');
    expect(r.mensagem).toMatch(/falha ao aprovar/i);
  });

  it('nunca devolve mensagem vazia', () => {
    for (const e of [null, undefined, {}, { message: '' }, 'x']) {
      const r = explicarErroAprovacao(e);
      expect(r.mensagem.length).toBeGreaterThan(10);
      expect(r.mensagem).not.toMatch(/undefined|null|NaN/);
    }
  });
});