// Testes da FILA DE VENDAS OFFLINE (utils/offlineQueue.ts)
// Validam o "caderno digital": salvar, listar, remover, marcar erro,
// limpar erros e o teto de 200 registros — com localStorage simulado.
import { describe, it, expect, beforeEach } from "vitest";
import {
  listarVendasOffline,
  salvarVendaOffline,
  removerVendaOffline,
  marcarErroVendaOffline,
  marcarAjustadaVendaOffline,
  descartarVendaOffline,
  rearmarVendaOffline,
  limparErrosVendaOffline,
  podeTentarSync,
  atrasoParaRetry,
  LIMITE_FILA,
  MAX_TENTATIVAS_AUTOMATICAS,
  VendaOffline,
} from "../utils/offlineQueue";

function venda(id: string, status: 'pending' | 'error' | 'ajustada' = 'pending'): VendaOffline {
  return {
    id,
    createdAt: new Date().toISOString(),
    targetUserId: 'balcao_anonimo',
    items: [{ productId: 'P1', name: 'Produto', price: 5.5, quantity: 2 }],
    paymentMethod: 'CASH',
    total: 11,
    status,
    tryCount: 0,
  };
}

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  store.clear();
});

describe("filas de vendas offline", () => {
  it("começa vazia", () => {
    expect(listarVendasOffline()).toEqual([]);
  });

  it("salva e recupera", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    const lista = listarVendasOffline();
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe('OFFLINE_1');
    expect(lista[0].total).toBe(11);
  });

  it("não duplica o mesmo id (sincronização repetida)", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    salvarVendaOffline(venda('OFFLINE_1'));
    expect(listarVendasOffline()).toHaveLength(1);
  });

  it("remove da fila quando sincroniza", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    removerVendaOffline('OFFLINE_1');
    expect(listarVendasOffline()).toEqual([]);
  });

  it("marca erro em venda recusada pelo servidor", () => {
    salvarVendaOffline(venda('OFFLINE_1'));
    marcarErroVendaOffline('OFFLINE_1', 'Saldo insuficiente');
    const [v] = listarVendasOffline();
    expect(v.status).toBe('error');
    expect(v.error).toBe('Saldo insuficiente');
    expect(v.tryCount).toBe(1);
  });

  it("limparErrosVendaOffline remove só as com erro (mantém pendentes)", () => {
    salvarVendaOffline(venda('OFFLINE_1', 'error'));
    salvarVendaOffline(venda('OFFLINE_2', 'pending'));
    salvarVendaOffline(venda('OFFLINE_3', 'error'));
    limparErrosVendaOffline();
    const restantes = listarVendasOffline();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].id).toBe('OFFLINE_2');
  });

  it("mantém a fila íntegra com JSON corrompido no storage", () => {
    (globalThis as any).localStorage.setItem('mf_vendas_offline', '{corrompido');
    expect(listarVendasOffline()).toEqual([]);
    salvarVendaOffline(venda('OFFLINE_1'));
    expect(listarVendasOffline()).toHaveLength(1);
  });

  it("nunca descarta venda para caber no limite: sinaliza e preserva tudo (A1)", () => {
    // Enche até o teto — nada pode ser perdido.
    for (let i = 0; i < LIMITE_FILA; i++) expect(salvarVendaOffline(venda(`OFF_${i}`))).toBe(true);
    expect(listarVendasOffline()).toHaveLength(LIMITE_FILA);

    // A venda seguinte (já cobrada do cliente) NÃO cabe. O código antigo
    // descartava as mais antigas — que são justamente as pending não
    // sincronizadas, com cupom já impresso.
    const overflow = venda('OFFLINE_OVERFLOW');
    expect(salvarVendaOffline(overflow)).toBe(false);

    const fila = listarVendasOffline();
    expect(fila).toHaveLength(LIMITE_FILA);
    // As mais antigas continuam lá — nada de receita perdida.
    expect(fila.some((v) => v.id === 'OFF_0')).toBe(true);
    expect(fila.some((v) => v.id === 'OFFLINE_OVERFLOW')).toBe(false);
  });

  it("fila cheia não trava o PDV: liberar espaço e voltar a vender", () => {
    for (let i = 0; i < LIMITE_FILA; i++) salvarVendaOffline(venda(`OFF_${i}`));
    expect(salvarVendaOffline(venda('BLOQUEADA'))).toBe(false);

    // Operador sincroniza e a fila esvazia...
    removerVendaOffline('OFF_0');
    // ...e o PDV volta a registrar venda normalmente.
    expect(salvarVendaOffline(venda('BLOQUEADA'))).toBe(true);
    expect(listarVendasOffline()).toHaveLength(LIMITE_FILA);
  });
});

describe("backoff da fila offline (A3)", () => {
  const base = venda('B1', 'error');

  it("atraso cresce exponencialmente e satura em 30 minutos", () => {
    const minutos = (n: number) => atrasoParaRetry(n) / 60000;
    expect(minutos(0)).toBe(1);
    expect(minutos(1)).toBe(2);
    expect(minutos(2)).toBe(4);
    expect(minutos(3)).toBe(8);
    expect(minutos(4)).toBe(16);
    expect(minutos(5)).toBe(30);
    expect(minutos(99)).toBe(30);
  });

  it("'pending' sempre pode tentar; 'ajustada' nunca", () => {
    expect(podeTentarSync(venda('P1', 'pending'))).toBe(true);
    expect(podeTentarSync({ ...venda('A1'), status: 'ajustada' })).toBe(false);
  });

  it("'error' espera o intervalo antes de tentar de novo", () => {
    const t0 = 1_000_000;
    const comErro = { ...base, status: 'error' as const, tryCount: 2, ultimaTentativa: t0 };
    // Ainda dentro da janela de 4 min → não tenta.
    expect(podeTentarSync(comErro, t0 + 60_000)).toBe(false);
    // Depois da janela → tenta.
    expect(podeTentarSync(comErro, t0 + 5 * 60_000)).toBe(true);
  });

  it("sem ultimaTentativa (registro legado) tenta imediatamente", () => {
    const legado = { ...base, status: 'error' as const, tryCount: 3 };
    expect(podeTentarSync(legado, 1_000_000)).toBe(true);
  });

  it("esgota as tentativas automáticas e exige ação humana", () => {
    const esgotada = {
      ...base,
      status: 'error' as const,
      tryCount: MAX_TENTATIVAS_AUTOMATICAS,
      ultimaTentativa: 1,
    };
    expect(podeTentarSync(esgotada, 999_999_999)).toBe(false);
  });
});

describe("gestão manual da fila (A4)", () => {
  it("rearmar devolve a venda para pending e zera o backoff", () => {
    salvarVendaOffline(venda('G1'));
    marcarErroVendaOffline('G1', 'saldo insuficiente');
    let g = listarVendasOffline().find((v) => v.id === 'G1')!;
    expect(g.status).toBe('error');
    expect(g.tryCount).toBe(1);

    rearmarVendaOffline('G1');
    g = listarVendasOffline().find((v) => v.id === 'G1')!;
    expect(g.status).toBe('pending');
    expect(g.tryCount).toBe(0);
    expect(g.error).toBeUndefined();
    expect(podeTentarSync(g)).toBe(true);
  });

  it("descartar remove a venda irrecuperável", () => {
    salvarVendaOffline(venda('G2'));
    marcarErroVendaOffline('G2', 'cliente sem saldo');
    descartarVendaOffline('G2');
    expect(listarVendasOffline()).toEqual([]);
  });

  it("marcarAjustada torna a venda terminal de sincronização", () => {
    salvarVendaOffline(venda('G3'));
    marcarAjustadaVendaOffline('G3', 'Preço ajustado no servidor');
    const g = listarVendasOffline().find((v) => v.id === 'G3')!;
    expect(g.status).toBe('ajustada');
    expect(podeTentarSync(g)).toBe(false);
    // ...mas continua na fila, visível para conferência (A5).
    expect(listarVendasOffline()).toHaveLength(1);
  });
});
describe('limparErrosVendaOffline nao destrói registro de venda', () => {
  beforeEach(() => localStorage.clear());

  it('remove so o que esta com erro', () => {
    salvarVendaOffline(venda('ok-pending'));
    salvarVendaOffline(venda('com-erro', 'error'));
    expect(listarVendasOffline()).toHaveLength(2);

    limparErrosVendaOffline();

    const ids = listarVendasOffline().map((v) => v.id);
    expect(ids).toEqual(['ok-pending']);
  });

  it('PRESERVA venda ajustada (ja contabilizada no servidor)', () => {
    salvarVendaOffline(venda('ajustada-1', 'ajustada'));

    limparErrosVendaOffline();

    const restantes = listarVendasOffline();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].id).toBe('ajustada-1');
    expect(restantes[0].status).toBe('ajustada');
  });

  it('PRESERVA pending e ajustada, remove apenas error', () => {
    salvarVendaOffline(venda('p1'));
    salvarVendaOffline(venda('a1', 'ajustada'));
    salvarVendaOffline(venda('e1', 'error'));
    salvarVendaOffline(venda('e2', 'error'));

    limparErrosVendaOffline();

    const ids = listarVendasOffline().map((v) => v.id).sort();
    expect(ids).toEqual(['a1', 'p1']);
  });

  it('nao apaga nada quando nao ha erro', () => {
    salvarVendaOffline(venda('p1'));
    salvarVendaOffline(venda('a1', 'ajustada'));
    limparErrosVendaOffline();
    expect(listarVendasOffline()).toHaveLength(2);
  });
});

describe('ajustada e terminal de sincronizacao', () => {
  beforeEach(() => localStorage.clear());

  it('nunca reenvia venda ajustada, mesmo sem backoff', () => {
    const v = venda('a1', 'ajustada');
    expect(podeTentarSync(v)).toBe(false);
    expect(podeTentarSync(v, Date.now() + 60 * 60 * 1000)).toBe(false);
  });

  it('rearmar devolve para pending e zera o backoff', () => {
    salvarVendaOffline(venda('e1', 'error'));
    marcarErroVendaOffline('e1', 'sem saldo');

    rearmarVendaOffline('e1');

    const v = listarVendasOffline()[0];
    expect(v.status).toBe('pending');
    expect(v.tryCount).toBe(0);
    expect(v.ultimaTentativa).toBeUndefined();
    expect(podeTentarSync(v)).toBe(true);
  });

  it('descartar remove so a venda escolhida', () => {
    salvarVendaOffline(venda('e1', 'error'));
    salvarVendaOffline(venda('p1'));

    descartarVendaOffline('e1');

    expect(listarVendasOffline().map((v) => v.id)).toEqual(['p1']);
  });
});