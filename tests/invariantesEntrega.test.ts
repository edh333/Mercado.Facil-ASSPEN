// Invariantes de entrega que quebram o app silenciosamente.
//
// 1) Versão do cache do Service Worker: public/sw.js, index.tsx e
//    utils/deviceStorage.ts precisam do MESMO nome. Já houve divergência real
//    ('v11' num arquivo, 'v12' no outro) e o efeito era a limpeza diária
//    apagar o cache do próprio sistema, forcando re-download toda sessão.
//
// 2) OnlineStatusIndicator não pode declarar hook dentro do useEffect:
//    isso é "Minified React error #321" em produção. O lint estático
//    (scripts/check-hooks.cjs) cobre isso, mas o teste de renderização
//    prova que o componente REAL monta.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SW_CACHE_ATUAL } from '../utils/deviceStorage';

const raiz = resolve(__dirname, '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('Service Worker — versão do cache sincronizada', () => {
  it('public/sw.js usa a mesma versão de utils/deviceStorage.ts', () => {
    const sw = ler('public/sw.js');
    const match = sw.match(/const CACHE_NAME\s*=\s*'([^']+)'/);
    expect(match, 'CACHE_NAME não encontrado em public/sw.js').toBeTruthy();
    expect(match![1]).toBe(SW_CACHE_ATUAL);
  });

  it('index.tsx usa a mesma versão de utils/deviceStorage.ts', () => {
    const entry = ler('index.tsx');
    const match = entry.match(/const SW_CACHE_ATUAL\s*=\s*'([^']+)'/);
    expect(match, 'SW_CACHE_ATUAL não encontrado em index.tsx').toBeTruthy();
    expect(match![1]).toBe(SW_CACHE_ATUAL);
  });

  it('a versão é a mais recente declarada no comentário de sincronia', () => {
    const entry = ler('index.tsx');
    expect(entry).toMatch(new RegExp(`MANTER EM SINCRONIA[\\s\\S]{0,140}hoje: ${SW_CACHE_ATUAL.replace('mercado-facil-', '')}\\)`));
  });
});

describe('Regras de Hooks estáticas', () => {
  it('nenhum arquivo viola Rules of Hooks', () => {
    const out = require('node:child_process')
      .execSync('node scripts/check-hooks.cjs', { cwd: raiz, encoding: 'utf8' });
    expect(out).toContain('OK: nenhuma violacao');
  });
});

describe('Integridade de texto dos fontes', () => {
  it('nenhum arquivo tem mojibake nem BOM UTF-8', () => {
    const out = require('node:child_process')
      .execSync('node scripts/check-encoding.cjs', { cwd: raiz, encoding: 'utf8' });
    expect(out).toContain('OK: nenhum mojibake');
  });
});