import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Regressão dos bugs P0 do fluxo de cliente de fiado:
 *
 *  1. `addCustomerAccount` não enviava `senhaMestra`, mas o servidor
 *     (`criarClienteFiado`) exige o segundo fator → a criação de cliente
 *     de fiado falhava 100% das vezes em produção.
 *
 *  2. `updateCustomerAccount` usava `if (creditLimit) { fn() } else if
 *     (payload) { updateDoc() }`. Como o modal de edição sempre envia o
 *     limite junto, nome/CPF/telefone/status eram DESCARTADOS em silêncio
 *     toda vez que o limite era alterado.
 */

// vi.mock é hoisted: os spies precisam ser criados dentro de vi.hoisted
// para existirem antes de o mock factory ser avaliado.
const { updateDoc, setDoc, deleteDoc, getDocs, getDoc, writeBatch, callable } = vi.hoisted(() => ({
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  writeBatch: vi.fn(),
  callable: vi.fn(),
}));

vi.mock('../firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db: unknown, ..._seg: unknown[]) => ({ id: String(_seg[0]) }),
  updateDoc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  writeBatch,
  arrayUnion: (...v: unknown[]) => v,
  increment: (n: number) => n,
  deleteField: () => null,
  Timestamp: { now: () => 'TS' },
  query: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_fn: unknown, nome: string) => {
    const fn = (...args: unknown[]) => callable(nome, ...args);
    return fn;
  },
}));

import { addCustomerAccount, updateCustomerAccount } from '../utils/customerUtils';

describe('customerUtils — criação de cliente de fiado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callable.mockResolvedValue({ data: { ok: true, userId: 'u1' } });
  });

  it('envia a senha mestra, que é obrigatória no servidor', async () => {
    await addCustomerAccount(
      { nome: 'joão da silva', cpf: '', telefone: '', creditLimit: 500, currentDebt: 0, weeklySpent: 0, status: 'active' },
      'senha-123'
    );

    expect(callable).toHaveBeenCalledTimes(1);
    const [nomeFuncao, payload] = callable.mock.calls[0];
    expect(nomeFuncao).toBe('criarClienteFiado');
    expect(payload.senhaMestra).toBe('senha-123');
    expect(payload.nome).toBe('JOÃO DA SILVA');
    expect(payload.creditLimit).toBe(500);
  });

  it('propaga a mensagem do servidor quando a senha mestra é recusada', async () => {
    callable.mockRejectedValue({ code: 'functions/invalid-argument', message: 'Senha mestra incorreta.' });

    await expect(
      addCustomerAccount(
        { nome: 'joão da silva', cpf: '', telefone: '', creditLimit: 0, currentDebt: 0, weeklySpent: 0, status: 'active' },
        'errada'
      )
    ).rejects.toThrow('Senha mestra incorreta.');
  });
});

describe('customerUtils — edição de cliente de fiado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callable.mockResolvedValue({ data: { ok: true } });
  });

  it('BUG: salva o perfil E o limite quando ambos vêm no mesmo payload', async () => {
    await updateCustomerAccount(
      'u1',
      { nome: 'MARIA SOUZA', cpf: '12345678901', telefone: '11988887777', creditLimit: 900, status: 'active' },
      'senha-123'
    );

    // o limite vai pela Function (exige 'finance' + senha mestra)
    expect(callable).toHaveBeenCalledTimes(1);
    expect(callable.mock.calls[0][0]).toBe('atualizarLimiteCredito');
    expect(callable.mock.calls[0][1]).toMatchObject({
      userId: 'u1',
      creditLimit: 900,
      senhaMestra: 'senha-123',
    });

    // e o perfil NÃO pode ser descartado (era exatamente o bug)
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({
      name: 'MARIA SOUZA',
      cpf: '12345678901',
      phone: '11988887777',
      status: 'active',
      allowCredit: true,
    });
  });

  it('não escreve no Firestore quando só o limite muda', async () => {
    await updateCustomerAccount('u1', { creditLimit: 300 }, 'senha-123');

    expect(callable).toHaveBeenCalledTimes(1);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('exige senha mestra quando o limite é alterado, sem gravar nada antes', async () => {
    await expect(updateCustomerAccount('u1', { nome: 'X', creditLimit: 10 })).rejects.toThrow(
      /senha mestra/i
    );

    expect(callable).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('permite editar só o perfil sem pedir senha mestra', async () => {
    await updateCustomerAccount('u1', { telefone: '11999990000' });

    expect(callable).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toEqual({ phone: '11999990000' });
  });

  it('bloqueio zera o allowCredit junto do status', async () => {
    await updateCustomerAccount('u1', { status: 'blocked' });

    expect(updateDoc.mock.calls[0][1]).toMatchObject({ status: 'blocked', allowCredit: false });
  });

  it('se a Function do limite falhar, o perfil não é gravado pela metade', async () => {
    callable.mockRejectedValue({ code: 'functions/invalid-argument', message: 'Senha mestra incorreta.' });

    await expect(
      updateCustomerAccount('u1', { nome: 'MARIA', creditLimit: 50 }, 'errada')
    ).rejects.toThrow('Senha mestra incorreta.');

    // ordem importa: Function primeiro, então nada foi gravado
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('não faz nada quando o payload é vazio', async () => {
    await updateCustomerAccount('u1', {});

    expect(callable).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });
});