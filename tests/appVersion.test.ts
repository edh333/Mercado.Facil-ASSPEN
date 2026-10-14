// @vitest-environment jsdom
// Blindagem da verificação de versão/atualização — o coração do aviso de
// "nova versão disponível" para o app desktop, que NÃO se auto-atualiza.
//
// Regressão real em campo: um PC continuava numa build antiga (nome do familiar
// na busca do PDV em vez do preso, lentidão) e nada avisava que havia versão
// nova. Estes testes garantem que a comparação e a leitura do manifest público
// (apps/version.json) se comportem corretamente nos caminhos Electron e web.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  compararVersoes,
  buscarVersaoPublicada,
  verificarAtualizacao,
  abrirPaginaDownload,
  URL_WEB_OFICIAL,
} from '../utils/appVersion';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  (window as any).electronAPI = undefined;
});

describe('compararVersoes', () => {
  it('retorna 0 para versões iguais', () => {
    expect(compararVersoes('1.0.8', '1.0.8')).toBe(0);
  });

  it('detecta versão publicada mais nova (deve avisar)', () => {
    expect(compararVersoes('1.0.9', '1.0.8')).toBe(1);
    expect(compararVersoes('1.1.0', '1.0.9')).toBe(1);
    expect(compararVersoes('2.0.0', '1.9.9')).toBe(1);
  });

  it('versão instalada mais nova devolve -1 (não avisa)', () => {
    expect(compararVersoes('1.0.7', '1.0.8')).toBe(-1);
  });

  it('compara bem com quantidades diferentes de partes', () => {
    expect(compararVersoes('1.0', '1.0.0')).toBe(0);
    expect(compararVersoes('1.0.1', '1.0')).toBe(1);
    expect(compararVersoes('1', '1.0.1')).toBe(-1);
  });

  it('trata entradas vazias ou inválidas como zero (nunca NaN)', () => {
    expect(compararVersoes('', '0.0.0')).toBe(0);
    expect(compararVersoes('abc', '0')).toBe(0);
  });
});

describe('buscarVersaoPublicada', () => {
  it('lê o manifest e devolve os campos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.2.3', releasedAt: '2026-01-01T00:00:00Z', webUrl: 'https://x' }),
    }));
    const r = await buscarVersaoPublicada();
    expect(r).toEqual({ version: '1.2.3', releasedAt: '2026-01-01T00:00:00Z', webUrl: 'https://x' });
  });

  it('retorna null quando a resposta não é ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await buscarVersaoPublicada()).toBeNull();
  });

  it('retorna null quando não há version no manifest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await buscarVersaoPublicada()).toBeNull();
  });

  it('retorna null quando o fetch lança (sem internet)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await buscarVersaoPublicada()).toBeNull();
  });
});

describe('verificarAtualizacao no navegador', () => {
  it('sem Electron, marca desktop=false e nunca avisa atualização', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '9.9.9' }),
    }));
    const info = await verificarAtualizacao();
    expect(info.desktop).toBe(false);
    expect(info.versaoLocal).toBe('');
    expect(info.publicada?.version).toBe('9.9.9');
    expect(info.updateAvailable).toBe(false);
  });
});

describe('verificarAtualizacao no Electron', () => {
  it('usa o IPC checkUpdate e propaga updateAvailable/versões', async () => {
    (window as any).electronAPI = {
      checkUpdate: vi.fn().mockResolvedValue({
        current: '1.0.8',
        latest: '1.1.0',
        updateAvailable: true,
        webUrl: 'https://alvo',
        releasedAt: '2026-02-02T00:00:00Z',
      }),
    };
    const info = await verificarAtualizacao();
    expect(info.desktop).toBe(true);
    expect(info.versaoLocal).toBe('1.0.8');
    expect(info.publicada).toEqual({
      version: '1.1.0',
      webUrl: 'https://alvo',
      releasedAt: '2026-02-02T00:00:00Z',
    });
    expect(info.updateAvailable).toBe(true);
  });

  it('publicada vazia vira null (sem aviso)', async () => {
    (window as any).electronAPI = {
      checkUpdate: vi.fn().mockResolvedValue({ current: '1.0.8', latest: '', updateAvailable: false }),
    };
    const info = await verificarAtualizacao();
    expect(info.desktop).toBe(true);
    expect(info.publicada).toBeNull();
    expect(info.updateAvailable).toBe(false);
  });

  it('cai para o caminho web se checkUpdate lançar', async () => {
    (window as any).electronAPI = { checkUpdate: vi.fn().mockRejectedValue(new Error('boom')) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.0.0' }) }));
    const info = await verificarAtualizacao();
    expect(info.desktop).toBe(false);
    expect(info.publicada?.version).toBe('1.0.0');
  });

  it('cai para o caminho web se checkUpdate devolver shape inválido', async () => {
    (window as any).electronAPI = { checkUpdate: vi.fn().mockResolvedValue(null) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.0.0' }) }));
    const info = await verificarAtualizacao();
    expect(info.desktop).toBe(false);
  });
});

describe('abrirPaginaDownload', () => {
  it('no Electron delega ao openUpdate (e não abre window.open)', () => {
    const openUpdate = vi.fn();
    (window as any).electronAPI = { openUpdate };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    abrirPaginaDownload('https://alvo');
    expect(openUpdate).toHaveBeenCalledWith('https://alvo');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('no navegador usa window.open com a URL oficial por padrão', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    abrirPaginaDownload();
    expect(openSpy).toHaveBeenCalledWith(URL_WEB_OFICIAL, '_blank', 'noopener');
  });
});
