// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rastrearErroCliente, obterBufferLocal } from '../utils/telemetryErro';

function criarFakeStorage() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => (dados.has(k) ? (dados.get(k) as string) : null),
    setItem: (k: string, v: string) => { dados.set(k, String(v)); },
    removeItem: (k: string) => { dados.delete(k); },
    clear: () => { dados.clear(); },
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() { return dados.size; },
  } as unknown as Storage;
}

describe('telemetryErro: buffer local de erros', () => {
  beforeEach(() => {
    // Node 22 expõe um localStorage experimental sobre o jsdom sem localStorage
    // funcional; o módulo lê o global em tempo de execução, então basta sobrescrever.
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: criarFakeStorage(),
    });
    globalThis.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('armazena erro sanitizado no buffer local', () => {
    rastrearErroCliente({ mensagem: 'Erro de teste\nquebrado', stack: 'at X (a.js:1)', origem: 'window.error' });
    const buf = obterBufferLocal();
    expect(buf.length).toBe(1);
    expect(buf[0].m).toBe('Erro de teste quebrado');
    expect(buf[0].s).toBe('at X (a.js:1)');
    expect(buf[0].o).toBe('window.error');
    expect(buf[0].h).toBeTruthy();
  });

  it('dedupe: mesmo erro+origem em menos de 10s não duplica', () => {
    rastrearErroCliente({ mensagem: 'boom', origem: 'boundary' });
    rastrearErroCliente({ mensagem: 'boom', origem: 'boundary' });
    expect(obterBufferLocal().length).toBe(1);
    rastrearErroCliente({ mensagem: 'boom', origem: 'window.error' });
    expect(obterBufferLocal().length).toBe(2);
  });

  it('ignora mensagem vazia', () => {
    rastrearErroCliente({ mensagem: undefined, origem: 'boundary' });
    rastrearErroCliente({ mensagem: '   ', origem: 'boundary' });
    expect(obterBufferLocal().length).toBe(0);
  });

  it('limita o buffer local a 20 entradas (dedupe vencido por tempo)', () => {
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(new Date(Date.now() + 11_000));
      rastrearErroCliente({ mensagem: `erro-${i}`, origem: 'teste' });
    }
    const buf = obterBufferLocal();
    expect(buf.length).toBe(20);
    expect(buf[0].m).toBe('erro-5');
    expect(buf[buf.length - 1].m).toBe('erro-24');
  });

  it('sobrevive a json corrompido no localStorage', () => {
    globalThis.localStorage.setItem('mf_erros_captura', '{lixo');
    rastrearErroCliente({ mensagem: 'apos-corrupcao', origem: 'teste' });
    expect(obterBufferLocal().length).toBe(1);
  });
});