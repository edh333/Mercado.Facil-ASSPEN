// Lógica pura de COMPOSIÇÃO DE PAGAMENTO do PDV (testável em vitest).
// Espelha exatamente os checks que o AdminSalesModalDefault fazia inline —
// sem eles o fluxo é o mesmo: o SERVIDOR (Cloud Functions) continua sendo a
// palavra final sobre preços, saldo, limite semanal, estoque e caixa.
// Arredondamento para centavos SEMPRE (mesma regra do server: arredondar/2 casas).

import { parseMoeda } from '../utils';

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
  weeklyWalletLimit?: number;
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
  const weeklyWalletLimit = Math.max(0, Number(input.weeklyWalletLimit) || 300);
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
      const limiteSemanalDisponivel = Math.max(0, weeklyWalletLimit - weeklySpentCliente);
      if (pWallet > limiteSemanalDisponivel + 0.009) {
        throw new Error(`Limite semanal de créditos excedido para a parte em créditos. Disponível: R$ ${limiteSemanalDisponivel.toFixed(2).replace('.', ',')}.`);
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