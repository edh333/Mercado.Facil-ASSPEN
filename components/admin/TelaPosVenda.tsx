import React, { useMemo } from 'react';
import { Printer, Eye, ShoppingCart, CheckCircle2, WifiOff } from 'lucide-react';
import { Order } from '../../types';
import { formatarMoeda } from '../../utils';
import { resumoPosVenda } from '../../utils/pdvPayment';

interface TelaPosVendaProps {
  pedido: Order;
  /** A impressão automática concluiu com sucesso. */
  cupomImpressoAuto: boolean;
  /** Reimpressão pedida pelo operador em andamento (desabilita o botão). */
  reimprimindo: boolean;
  onImprimir: () => void;
  onVisualizar: () => void;
  onConcluir: () => void;
}

/**
 * Confirmação de venda do PDV.
 *
 * Aparece SEMPRE que a venda é concluída (online ou offline), independente do
 * ajuste de impressão automática — antes essa tela estava atrelada ao autoPrint
 * e sumia inteira quando ele estava desligado.
 *
 * Vive num componente próprio (e não inline no TelaPDV) por dois motivos: o
 * TelaPDV já tem quatro dígitos de linhas e este é um bloco autocontido; e
 * assim a tela tem cobertura de teste de renderização de verdade, em vez de
 * depender de simular a venda inteira pelo balcão.
 *
 * Todos os valores vêm de `resumoPosVenda` (função pura testada): aqui não há
 * conta de dinheiro, só exibição.
 */
export const TelaPosVenda: React.FC<TelaPosVendaProps> = ({
  pedido,
  cupomImpressoAuto,
  reimprimindo,
  onImprimir,
  onVisualizar,
  onConcluir,
}) => {
  const resumo = useMemo(() => resumoPosVenda(pedido), [pedido]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-slideUp">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Venda concluída"
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        {/* Cabeçalho */}
        <div className="px-6 pt-7 pb-5 text-center bg-gradient-to-b from-emerald-50 to-white">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <CheckCircle2 size={32} strokeWidth={2.5} />
          </div>
          <h2 className="mt-4 text-xl font-black uppercase tracking-widest text-slate-900">
            Venda concluída
          </h2>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {resumo.idCurto || 'Pedido sem número'}
          </p>
        </div>

        {/* Resumo financeiro */}
        <div className="px-6 pb-5">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Total
              </span>
              <span className="text-2xl font-black text-emerald-600 tabular-nums">
                {formatarMoeda(resumo.total)}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wider">
                  Pagamento
                </span>
                <span className="font-black text-slate-700">
                  {resumo.metodoRotulo}
                </span>
              </div>
              {resumo.composicao.length > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 uppercase tracking-wider">
                    Composição
                  </span>
                  <span className="font-black text-slate-700 text-right">
                    {resumo.composicao
                      .map((p) => `${p.metodoRotulo} ${formatarMoeda(p.valor)}`)
                      .join(' · ')}
                  </span>
                </div>
              )}
              {resumo.troco > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 uppercase tracking-wider">
                    Troco
                  </span>
                  <span className="font-black text-amber-600 tabular-nums">
                    {formatarMoeda(resumo.troco)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wider">
                  Itens
                </span>
                <span className="font-black text-slate-700">
                  {resumo.itens}
                </span>
              </div>
            </div>
          </div>

          {/* Avisos: impressão e venda ainda não sincronizada */}
          <div className="mt-3 space-y-2">
            {cupomImpressoAuto ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Cupom impresso automaticamente
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
                <Printer size={14} className="text-amber-600 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Cupom não impresso — imprima ou baixe agora
                </span>
              </div>
            )}
            {resumo.offline && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-100">
                <WifiOff size={14} className="text-sky-600 shrink-0 mt-0.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
                  Venda offline — na fila, será confirmada quando a internet voltar
                </span>
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="mt-4 grid grid-cols-1 gap-2.5">
            <button
              onClick={onImprimir}
              disabled={reimprimindo}
              className="h-12 w-full rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-60 disabled:active:scale-100"
            >
              <Printer size={16} />
              {reimprimindo ? 'Imprimindo...' : cupomImpressoAuto ? 'Reimprimir cupom' : 'Imprimir cupom'}
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={onVisualizar}
                className="h-12 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-slate-700"
              >
                <Eye size={16} />
                Visualizar
              </button>
              <button
                onClick={onConcluir}
                className="h-12 rounded-2xl bg-white border-2 border-slate-300 text-slate-800 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-slate-50"
              >
                <ShoppingCart size={16} />
                Nova venda
              </button>
            </div>
          </div>

          <p className="mt-3 text-center text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Enter ou Esc para a próxima venda
          </p>
        </div>
      </div>
    </div>
  );
};