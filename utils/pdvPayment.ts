// Lógica pura de COMPOSIÇÃO DE PAGAMENTO do PDV (testável em vitest).
// Espelha exatamente os checks que o AdminSalesModalDefault fazia inline —
// sem eles o fluxo é o mesmo: o SERVIDOR (Cloud Functions) continua sendo a
// palavra final sobre preços, saldo, limite semanal, estoque e caixa.
// Arredondamento para centavos SEMPRE (mesma regra do server: arredondar/2 casas).

import { parseMoeda } from './money';

export type MetodoPagamentoPDV = 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO' | 'FIADO_30';
export type MetodoLancamento = 'PIX' | 'WALLET' | 'CASH';

export interface LancamentoPagamento {
  method: MetodoLancamento;
  amount: number;
}

export interface SplitsDupla {
  secondUserId: string;
  secondWalletAmount: number;
}

export interface MontagemPagamentoInput {
  formaPagamento: MetodoPagamentoPDV;
  total: number;
  valorMisto?: { PIX: string; WALLET: string; CASH: string } | null;
  valorRecebido?: string;
  clienteSelecionado?: string | null;
  targetId?: string;
  clienteEhConsumidor: boolean;
  contaFiadoSelecionada?: { currentDebt?: number; creditLimit?: number } | null;
  fiado30UserId?: string;
  saldoCarteiraCliente?: number;
  weeklySpentCliente?: number;
  // OBRIGATÓRIO de propósito: o limite semanal configurado NÃO pode ser
  // adivinhado aqui. Este default (300) morava dentro da função e chegava
  // `undefined` de todos os chamadores — a UI exibia o limite real (calculado
  // do settings) enquanto a validação usava 300, então uma venda bloqueada na
  // tela passava na checagem local e só era recusada pelo servidor.
  weeklyWalletLimit: number;
  isJointWalletMode?: boolean;
  jointAdminAuthorized?: boolean;
  secondUserId?: string;
  secondWalletAmountInput?: string;
  saldoCarteiraSegundo?: number;
}

export interface MontagemPagamentoOk {
  ok: true;
  paymentsArray: LancamentoPagamento[] | undefined;
  changeValue: number | undefined;
  jointWalletPayload: SplitsDupla | undefined;
}

export interface MontagemPagamentoBloqueio {
  ok: false;
  message: string;
}

/** Arredonda para 2 casas decimais (moeda). Nunca lança. */
export const arredondarCentavos = (v: number): number =>
  Math.round((Number(v) || 0) * 100) / 100;

/**
 * Rótulos de forma de pagamento em PT-BR. Fonte ÚNICA: o PDV (tela de
 * pós-venda) e o modal de relatórios mostravam o mesmo campo com mapas
 * separados — qualquer ajuste de nomenclatura ("Créditos" x "Carteira") tinha
 * de ser feito em dois lugares e um deles ficava para trás.
 */
export const PAYMENT_LABELS: Record<string, string> = {
  PIX: 'PIX',
  CASH: 'Dinheiro',
  CARD: 'Cartão',
  WALLET: 'Carteira',
  FIADO: 'Fiado',
  FIADO_30: 'Fiado 30 dias',
  MIXED: 'Misto',
};

/** Rótulo legível da forma de pagamento; cai no código cru se for desconhecido. */
export const rotuloPagamento = (metodo?: string | null): string => {
  const chave = String(metodo || '').trim().toUpperCase();
  if (!chave) return '—';
  return PAYMENT_LABELS[chave] || String(metodo);
};

export interface ResumoPosVenda {
  /** Identificador curto do pedido, para o operador conferir na comanda. */
  idCurto: string;
  total: number;
  metodo: string;
  metodoRotulo: string;
  /** Troco a devolver — 0 quando não se aplica (só dinheiro/misto). */
  troco: number;
  itens: number;
  /** Venda registrada na fila offline: ainda não confirmada pelo servidor. */
  offline: boolean;
  /** Composição do pagamento misto (vazia fora do misto). */
  composicao: { metodo: string; metodoRotulo: string; valor: number }[];
}

/**
 * Deriva o resumo que a tela de pós-venda mostra ao operador.
 *
 * Extraído do componente para ficar testável (o resto da tela é JSX): total,
 * troco e composição são dinheiro na mão do cliente, então a regra mora em
 * código puro e coberto por teste, em vez de espalhada pelo JSX.
 *
 * Robustez: o pedido da fila offline é montado à mão e pode ter campos
 * ausentes, e o Firestore às vezes entrega numerais estruturados — aqui tudo é
 * tolerado e convertido, em vez de a tela exibir "NaN" numa confirmação de venda.
 * Por isso o parâmetro é `unknown`: quem chama pode passar o que o banco devolveu.
 */
export function resumoPosVenda(pedido: unknown): ResumoPosVenda {
  const p = (pedido && typeof pedido === 'object' ? pedido : {}) as Record<string, any>;
  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? arredondarCentavos(n) : 0;
  };
  const metodo = String(p.paymentMethod || '').trim().toUpperCase();
  const pagamentos = Array.isArray(p.payments) ? p.payments : [];
  return {
    idCurto: String(p.id || p.clientToken || '').slice(0, 12),
    total: num(p.total),
    metodo,
    metodoRotulo: rotuloPagamento(metodo),
    troco: num(p.change) > 0 ? num(p.change) : 0,
    itens: Array.isArray(p.items) ? p.items.length : 0,
    offline: p.offlinePending === true || p.status === 'offline_pending',
    composicao:
      pagamentos.length > 1
        ? pagamentos.map((x: any) => ({
            metodo: String(x?.method || '').trim().toUpperCase(),
            metodoRotulo: rotuloPagamento(x?.method),
            valor: num(x?.amount),
          }))
        : [],
  };
}

export const DENOMINACOES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01];

/** Quebra o troco nas cédulas/moedas disponíveis. Valor negativo → nenhuma (troco jamais negativo). */
export const calcularDenominacoes = (valor: number): { valor: number; qtd: number }[] => {
  const result: { valor: number; qtd: number }[] = [];
  const positivo = Number(valor);
  if (!Number.isFinite(positivo) || positivo < 0) return result;
  let centavos = Math.round((positivo + Number.EPSILON) * 100);
  for (const d of DENOMINACOES) {
    const dc = Math.round(d * 100);
    if (dc <= centavos) {
      const qtd = Math.floor(centavos / dc);
      centavos -= qtd * dc;
      if (qtd > 0) result.push({ valor: d, qtd });
    }
  }
  return result;
};

/**
 * Monta o lançamento (payments/change/split de dupla) a partir da forma de
 * pagamento escolhida. Regras 1:1 com o PDV:
 *  - validações "amigáveis" (ex.: valor insuficiente) retornam { ok: false, message }
 *    → o PDV mostra o aviso e NÃO tenta o fallback offline;
 *  - validações de consistência (ex.: 2º devedor igual ao dono) LANÇAM Error
 *    → propagam igual ao comportamento original do PDV.
 */
export function montarPagamentoPdv(input: MontagemPagamentoInput): MontagemPagamentoOk | MontagemPagamentoBloqueio {
  const { formaPagamento, total } = input;
  const valorMisto = input.valorMisto || { PIX: '', WALLET: '', CASH: '' };
  const totalArredondado = arredondarCentavos(total);
  const saldoCarteiraCliente = Math.max(0, Number(input.saldoCarteiraCliente) || 0);
  const weeklySpentCliente = Number(input.weeklySpentCliente) || 0;
  const limiteSemanalBruto = Number(input.weeklyWalletLimit);
  // Config inválida/ausente NÃO vira um número inventado: sem teto local a
  // checagem é pulada e quem decide é o servidor (mesma autoridade de saldo,
  // estoque e preço). Um default chutado aqui ou bloqueia uma venda legítima
  // (limite real maior) ou libera uma que o servidor vai recusar.
  const weeklyWalletLimit = Number.isFinite(limiteSemanalBruto) && limiteSemanalBruto >= 0
    ? limiteSemanalBruto
    : null;
  const targetId = input.targetId || input.clienteSelecionado || 'balcao_anonimo';

  if (formaPagamento === 'FIADO') {
    if (!input.clienteSelecionado) {
      throw new Error('Selecione um cliente para venda fiada.');
    }
    if (input.clienteEhConsumidor) {
      throw new Error('Venda fiada exige cliente cadastrado — escolha o cliente no início da venda (não o Consumidor Final).');
    }
    // UNIFICADO: o cliente de fiado É o usuário cadastrado selecionado no PDV
    // (clienteSelecionado), mesmo universo das vendas PIX/WALLET/CASH/CARD/MIXED.
    // Nada de conta/customer_accounts paralela — o servidor registra a dívida no
    // próprio doc do usuário e valida limite de crédito (fonte da verdade).
    return { ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined };
  }

  if (formaPagamento === 'FIADO_30') {
    if (!input.clienteSelecionado) {
      throw new Error('Selecione um cliente para venda fiada.');
    }
    if (input.clienteEhConsumidor) {
      throw new Error('Fiado 30 Dias exige cliente cadastrado — escolha o cliente no início da venda (não o Consumidor Final).');
    }
    // A validação de limite de crédito é feita no servidor (source of truth)
    return { ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined };
  }

  let paymentsArray: LancamentoPagamento[] | undefined;
  let changeValue: number | undefined;
  let jointWalletPayload: SplitsDupla | undefined;

  if (formaPagamento === 'WALLET') {
    const segundaParcela = parseMoeda(input.secondWalletAmountInput);
    if (input.isJointWalletMode && input.jointAdminAuthorized && input.secondUserId && segundaParcela > 0) {
      if (input.secondUserId === targetId) {
        throw new Error('O 2º devedor deve ser diferente do cliente principal.');
      }
      const saldo1 = saldoCarteiraCliente;
      if (saldo1 + segundaParcela < totalArredondado - 0.009) {
        throw new Error(`Saldo combinado insuficiente: R$ ${(saldo1 + segundaParcela).toFixed(2).replace('.', ',')} não cobre o total de R$ ${totalArredondado.toFixed(2).replace('.', ',')}.`);
      }
      jointWalletPayload = {
        secondUserId: input.secondUserId,
        secondWalletAmount: arredondarCentavos(segundaParcela),
      };
    }
    return { ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload };
  }

  if (formaPagamento === 'CASH') {
    const recebido = parseMoeda(input.valorRecebido);
    if (recebido < totalArredondado - 0.009) {
      return {
        ok: false,
        message: `Valor recebido insuficiente. Faltam R$ ${(totalArredondado - recebido).toFixed(2)}. Receba ao menos o total da venda em dinheiro.`,
      };
    }
    if (recebido > totalArredondado) {
      changeValue = arredondarCentavos(recebido - totalArredondado);
    }
    return { ok: true, paymentsArray: undefined, changeValue, jointWalletPayload: undefined };
  }

  if (formaPagamento === 'MIXED') {
    const pPix = parseMoeda(valorMisto.PIX);
    const pWallet = parseMoeda(valorMisto.WALLET);
    const pCash = parseMoeda(valorMisto.CASH);

    paymentsArray = [];
    if (pPix > 0) paymentsArray.push({ method: 'PIX', amount: pPix });
    if (pWallet > 0) paymentsArray.push({ method: 'WALLET', amount: pWallet });
    if (pCash > 0) paymentsArray.push({ method: 'CASH', amount: pCash });

    if (pWallet > 0) {
      if (input.clienteEhConsumidor) {
        throw new Error('Venda para consumidor final não pode usar créditos internos (WALLET).');
      }
      if (pWallet > saldoCarteiraCliente + 0.009) {
        throw new Error(`Saldo insuficiente na carteira para a parte em créditos. Disponível: R$ ${saldoCarteiraCliente.toFixed(2).replace('.', ',')}.`);
      }
      if (weeklyWalletLimit !== null) {
        const limiteSemanalDisponivel = Math.max(0, weeklyWalletLimit - weeklySpentCliente);
        if (pWallet > limiteSemanalDisponivel + 0.009) {
          throw new Error(`Limite semanal de créditos excedido para a parte em créditos. Disponível: R$ ${limiteSemanalDisponivel.toFixed(2).replace('.', ',')}.`);
        }
      }
    }

    const totalRecebido = pPix + pWallet + pCash;
    if (totalRecebido < totalArredondado - 0.009) {
      return { ok: false, message: `Valor recebido insuficiente. Faltam R$ ${(totalArredondado - totalRecebido).toFixed(2)}. Verifique os valores informados.` };
    }
    // Excedente SÓ é aceito se houver dinheiro em caixa para devolver o troco.
    if (totalRecebido > totalArredondado + 0.009 && pCash <= 0) {
      return { ok: false, message: `Excedente de R$ ${(totalRecebido - totalArredondado).toFixed(2).replace('.', ',')} sem dinheiro em caixa para devolver o troco. Ajuste os valores informados.` };
    }
    if (totalRecebido > totalArredondado && pCash > 0) {
      changeValue = arredondarCentavos(totalRecebido - totalArredondado);
      const cashIndex = paymentsArray.findIndex((p) => p.method === 'CASH');
      if (cashIndex >= 0) {
        if (changeValue > pCash + 0.009) {
          return { ok: false, message: `O troco (R$ ${changeValue.toFixed(2).replace('.', ',')}) é maior que o valor recebido em dinheiro (R$ ${pCash.toFixed(2).replace('.', ',')}). Aumente o valor em dinheiro ou reduza o excedente.` };
        }
        paymentsArray[cashIndex].amount = Math.max(0, arredondarCentavos(paymentsArray[cashIndex].amount - changeValue));
      }
      paymentsArray = paymentsArray.filter((p) => p.amount > 0);
    }
    return { ok: true, paymentsArray, changeValue, jointWalletPayload: undefined };
  }

  // PIX / CARD: nenhum lançamento local — o servidor registra e valida.
  return { ok: true, paymentsArray: undefined, changeValue: undefined, jointWalletPayload: undefined };
}