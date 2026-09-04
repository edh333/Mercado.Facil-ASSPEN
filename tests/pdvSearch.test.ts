import { describe, it, expect } from 'vitest';
import { filtrarClientesPdv } from '../utils/pdvSearch';
import type { User } from '../types';

const makeUser = (over: Partial<User>): User => ({
  id: over.id || 'u1',
  name: over.name || 'CLIENTE',
  email: over.email || 'c@c.com',
  role: 'FAMILY' as User['role'],
  status: 'active',
  approved: true,
  cpf: '',
  inmateName: '',
  inmateCpf: '',
  ...over,
});

describe('filtrarClientesPdv', () => {
  it('SEM busca digitada a lista permanece VAZIA (nada vaza do cadastro)', () => {
    const lista = [makeUser({ id: 'a', name: 'MARIA' }), makeUser({ id: 'b', name: 'JOAO' })];
    expect(filtrarClientesPdv(lista, '')).toEqual([]);
    expect(filtrarClientesPdv(lista, '   ')).toEqual([]);
  });

  it('busca por nome, case-insensitive e por trecho', () => {
    const lista = [makeUser({ name: 'MARIA JOSE' }), makeUser({ name: 'ANA MARIA SOUZA' })];
    const r = filtrarClientesPdv(lista, 'maria');
    expect(r).toHaveLength(2);
    expect(r.map(u => u.name)).toContain('MARIA JOSE');
  });

  it('busca por CPF com prefixo numérico (parcial)', () => {
    const lista = [
      makeUser({ name: 'EXATA', cpf: '529.982.247-25' }),
      makeUser({ name: 'DIFERENTE', cpf: '111.444.777-35' }),
    ];
    expect(filtrarClientesPdv(lista, '529')).toEqual([expect.objectContaining({ name: 'EXATA' })]);
    expect(filtrarClientesPdv(lista, '52998224725')).toHaveLength(1);
  });

  it('busca por CPF do interno (inmateCpf/prisonerCpf)', () => {
    const lista = [makeUser({ name: 'FAMILIAR', inmateName: 'PRESO A', inmateCpf: '000.000.000-00' })];
    expect(filtrarClientesPdv(lista, '000000000')).toHaveLength(1);
  });

  it('busca por nome do interno', () => {
    const lista = [makeUser({ name: 'FAMILIAR', inmateName: 'EDSON MENDES' })];
    expect(filtrarClientesPdv(lista, 'edson')).toHaveLength(1);
    expect(filtrarClientesPdv(lista, 'mendes')).toHaveLength(1);
  });

  it('prioriza nomes que COMEÇAM com o termo', () => {
    const lista = [
      makeUser({ name: 'MARIA JOANINA' }),
      makeUser({ name: 'JOAO BATISTA' }),
    ];
    const r = filtrarClientesPdv(lista, 'joa');
    expect(r[0].name).toBe('JOAO BATISTA');
  });

  it('respeita o limite máximo de resultados', () => {
    const lista = Array.from({ length: 50 }, (_, i) => makeUser({ id: `u${i}`, name: `CLIENTE ${i}` }));
    expect(filtrarClientesPdv(lista, 'cliente', 30)).toHaveLength(30);
    expect(filtrarClientesPdv(lista, 'cliente', 5)).toHaveLength(5);
  });

  it('retorna vazio quando nada casa', () => {
    const lista = [makeUser({ name: 'MARIA' })];
    expect(filtrarClientesPdv(lista, 'zedavo')).toEqual([]);
    expect(filtrarClientesPdv(lista, '99999999999')).toEqual([]);
  });

  it('não quebra com lista vazia ou campos ausentes', () => {
    expect(filtrarClientesPdv([], 'joao')).toEqual([]);
    expect(filtrarClientesPdv([makeUser({ name: undefined as unknown as string })], 'joao')).toEqual([]);
  });
});