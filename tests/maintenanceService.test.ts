import { describe, it, expect, beforeEach } from 'vitest';
import {
  quarentenaDeJsonCorrompido,
  limparImpressoesObsoletas,
  podarPontosRestauracao,
  estimarUsoArmazenamento,
  executarManutencao,
  lerUltimoRelatorio,
  StorageLike,
} from '../utils/maintenanceService';

/** localStorage falso em memória (mesma interface mínima do serviço). */
class FakeStorage implements StorageLike {
  private dados = new Map<string, string>();
  getItem(k: string) { return this.dados.has(k) ? this.dados.get(k)! : null; }
  setItem(k: string, v: string) { this.dados.set(k, String(v)); }
  removeItem(k: string) { this.dados.delete(k); }
  key(i: number) { return Array.from(this.dados.keys())[i] ?? null; }
  get length() { return this.dados.size; }
}

describe('maintenanceService', () => {
  let s: FakeStorage;
  beforeEach(() => { s = new FakeStorage(); });

  it('coloca JSON corrompido em QUARENTENA preservando o original', () => {
    s.setItem('appSettings', '{quebrado::::');
    const acoes = quarentenaDeJsonCorrompido(s);
    expect(acoes).toHaveLength(1);
    expect(s.getItem('appSettings')).toBeNull();
    const chaves = [s.key(0)];
    expect(chaves[0]).toMatch(/^appSettings\.corrompido\.\d+$/);
    expect(s.getItem(chaves[0])).toBe('{quebrado::::');
  });

  it('não toca em JSON válido', () => {
    s.setItem('appSettings', '{"tema":"escuro"}');
    expect(quarentenaDeJsonCorrompido(s)).toHaveLength(0);
    expect(s.getItem('appSettings')).toBe('{"tema":"escuro"}');
  });

  it('remove impressão órfã antiga e mantém a recente', () => {
    const velha = { data: { createdAt: new Date(Date.now() - 72 * 36e5).toISOString() } };
    const recente = { data: { createdAt: new Date().toISOString() } };
    s.setItem('printItem', JSON.stringify(velha));
    s.setItem('printTicket', '1');
    expect(limparImpressoesObsoletas(s)).toHaveLength(1);
    expect(s.getItem('printItem')).toBeNull();

    s.setItem('printItem', JSON.stringify(recente));
    expect(limparImpressoesObsoletas(s)).toHaveLength(0);
    expect(s.getItem('printItem')).not.toBeNull();
  });

  it('poda pontos de restauração excedentes mantendo os mais recentes', () => {
    const lista = Array.from({ length: 12 }, (_, i) => ({ id: `p-${i}` }));
    s.setItem('sistema_pontos_restauracao', JSON.stringify(lista));
    const acoes = podarPontosRestauracao(s, 8);
    expect(acoes).toHaveLength(1);
    const restante = JSON.parse(s.getItem('sistema_pontos_restauracao')!);
    expect(restante).toHaveLength(8);
    expect(restante[0].id).toBe('p-0'); // mais recentes primeiro
  });

  it('executa manutenção completa, grava relatório e respeita guarda diária', () => {
    s.setItem('appSettings', 'não é json');
    const r1 = executarManutencao(s);
    expect(r1).not.toBeNull();
    expect(r1!.limpezas.some((a) => a.includes('QUARENTENA'))).toBe(true);
    expect(r1!.saude.length).toBeGreaterThanOrEqual(3);

    // Segunda chamada no mesmo dia NÃO refaz o pesado (retorna relatório salvo)
    s.setItem('appSettings', 'outro quebra');
    const r2 = executarManutencao(s);
    expect(lerUltimoRelatorio(s)!.executadoEm).toBe(r1!.executadoEm);
    // com forcar=true refaz: o novo JSON quebrado vai para quarentena nesta rodada
    const r3 = executarManutencao(s, true);
    expect(r3!.limpezas.filter((a) => a.includes('QUARENTENA')).length).toBe(1);
    expect(s.getItem('appSettings')).toBeNull();
  });

  it('estima uso de armazenamento entre 0 e 100%', () => {
    s.setItem('x', 'a'.repeat(100_000)); // ≈ 3,8% da cota típica de 5 MB
    const pct = estimarUsoArmazenamento(s);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });
});
