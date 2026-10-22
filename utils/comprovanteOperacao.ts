import { Order } from '../types';
import {
  gerarCupomEntregaRaw,
  imprimirBobinaFiscal,
  imprimirCupom,
  abrirJanelaImpressao,
  baixarCupomTxt,
} from './printUtils';

/**
 * COMPROVANTE DE CANCELAMENTO / ESTORNO
 *
 * Reusa o gerador de cupom já existente (`gerarCupomEntregaRaw`): ele sabe
 * desenhar o cupom térmico completo (itens, cliente, total) e — quando o
 * pedido chega com status cancelado/estornado — imprime o banner
 * "* CUPOM CANCELADO / DEVOLVIDO *". Assim o comprovante sai com a mesma
 * identidade visual da venda, sem duplicar o gerador de cupom.
 *
 * Regras profissionais aplicadas aqui:
 *  - O comprovante de cancelamento NÃO é documento fiscal: o `fiscalEmission`
 *    é desligado à força, então o cupom sai marcado "NAO E DOCUMENTO FISCAL"
 *    mesmo numa loja que emite NF-e. (Emitir "CUPOM FISCAL" num cancelamento
 *    seria um documento fiscal inválido.)
 *  - A gaveta do caixa NÃO abre: `drawerKick` desligado — o dinheiro não
 *    entrou/saiu do caixa, só o papel do estorno.
 *  - Impressora fiscal = bobina (QZ Tray). Impressora comum = janela de
 *    impressão (navegador) ou impressão silenciosa na padrão (desktop).
 *  - Sempre existe a 3ª via: baixar o comprovante em .txt.
 */

export type AcaoOperacao = 'cancelar' | 'estorno';
export type DestinoImpressao = 'fiscal' | 'comum' | 'arquivo';

export const STATUS_POR_ACAO: Record<AcaoOperacao, string> = {
  cancelar: 'CANCELLED',
  estorno: 'REFUNDED',
};

export const TITULO_POR_ACAO: Record<AcaoOperacao, string> = {
  cancelar: 'COMPROVANTE DE CANCELAMENTO',
  estorno: 'COMPROVANTE DE ESTORNO',
};

export interface DadosComprovanteOperacao {
  order: Order | any;
  acao: AcaoOperacao;
  motivo?: string;
  operador?: string;
  config?: any;
}

export interface ResultadoImpressao {
  ok: boolean;
  via: DestinoImpressao | 'nenhuma';
  mensagem: string;
}

/**
 * Prepara o pedido para gerar o comprovante: marca o status da operação e
 * guarda motivo/responsável/data. Função PURA (sem efeito colateral) para
 * poder ser testada de forma isolada.
 */
export function montarPedidoComprovante(
  order: Order | any,
  acao: AcaoOperacao,
  motivo?: string,
  operador?: string,
  quando?: string
): any {
  const base = order || {};
  const status = STATUS_POR_ACAO[acao] || STATUS_POR_ACAO.cancelar;
  return {
    ...base,
    status,
    cancelReason: motivo || base.cancelReason || base.refundReason || '',
    cancelReasonAt: quando || new Date().toISOString(),
    cancelledBy: operador || base.cancelledBy || base.refundedBy || base.operatorName || '',
  };
}

/**
 * Configuração do comprovante: nunca fiscal, nunca abre gaveta e com o
 * título da operação. É a rede de proteção contra emitir "CUPOM FISCAL" de
 * um cancelamento.
 */
export function configComprovante(config: any, acao: AcaoOperacao): any {
  return {
    ...(config || {}),
    fiscalEmission: false,
    drawerKick: false,
    customReceiptDocName: TITULO_POR_ACAO[acao] || TITULO_POR_ACAO.cancelar,
  };
}

/** Texto cru (bobina 80mm) do comprovante da operação. */
export function gerarTextoComprovante(dados: DadosComprovanteOperacao): string {
  const { order, acao, motivo, operador, config } = dados || ({} as DadosComprovanteOperacao);
  const pedido = montarPedidoComprovante(order, acao || 'cancelar', motivo, operador);
  return gerarCupomEntregaRaw(pedido, configComprovante(config, acao || 'cancelar'));
}

/**
 * Imprime o comprovante no destino escolhido.
 *
 * - `fiscal`: bobina fiscal via QZ Tray. Se a fiscal não estiver conectada,
 *   devolve erro claro (NÃO desvia para a comum: a escolha do operador foi
 *   explícita) — a UI oferece "comum" e ".txt" como saída.
 * - `comum`: janela de impressão profissional (navegador) ou impressão
 *   silenciosa na impressora padrão (app desktop). Cai no cupom na própria
 *   tela se o navegador bloquear o popup.
 * - `arquivo`: baixa o .txt do comprovante.
 */
export async function imprimirComprovanteOperacao(
  dados: DadosComprovanteOperacao,
  destino: DestinoImpressao
): Promise<ResultadoImpressao> {
  const { order, acao, motivo, operador, config } = dados || ({} as DadosComprovanteOperacao);
  const acaoSegura = acao === 'estorno' ? 'estorno' : 'cancelar';
  const texto = gerarTextoComprovante(dados);
  const conf = configComprovante(config, acaoSegura);

  if (destino === 'arquivo') {
    try {
      baixarCupomTxt(texto, `comprovante-${acaoSegura}`);
      return { ok: true, via: 'arquivo', mensagem: 'Comprovante baixado em .txt.' };
    } catch (e: any) {
      return { ok: false, via: 'nenhuma', mensagem: e?.message || 'Não foi possível baixar o comprovante.' };
    }
  }

  if (destino === 'fiscal') {
    try {
      const ok = await imprimirBobinaFiscal(texto, conf);
      if (ok) {
        return { ok: true, via: 'fiscal', mensagem: 'Comprovante enviado para a impressora fiscal.' };
      }
    } catch {
      /* cai no erro amigável abaixo */
    }
    return {
      ok: false,
      via: 'nenhuma',
      mensagem: 'Impressora fiscal indisponível (QZ Tray não conectado). Use a impressora comum ou baixe o comprovante.',
    };
  }

  // Destino "comum": abre a janela /print com o layout térmico. No app desktop
  // (Electron) o main cria a janela dedicada; no navegador, o popup padrão.
  const pedido = montarPedidoComprovante(order, acaoSegura, motivo, operador);
  const janela = abrirJanelaImpressao({ type: 'CUPOM_COMUM', data: pedido }, conf);
  const isEletron = !!(window as any).electronAPI;
  if (!janela && !isEletron) {
    // Popup bloqueado: imprime o cupom na própria tela (dialogo do navegador).
    imprimirCupom(texto);
    return { ok: true, via: 'comum', mensagem: 'Janela bloqueada — o comprovante foi enviado para a impressão do navegador.' };
  }
  return { ok: true, via: 'comum', mensagem: 'Comprovante enviado para a impressora comum.' };
}
