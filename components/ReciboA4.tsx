import React from "react";
import { formatarMoeda, mascararCpf } from "../utils";
import { Order, Expense, AppConfig } from "../types";
import { valorPorExtenso } from "./NotaPromissoriaA4";
import { Shield, Printer, X, ShieldCheck, QrCode, Hash, FileText, User, CreditCard } from "lucide-react";

interface ReciboA4Props {
  data: Order | Expense;
  type: 'ORDER' | 'EXPENSE';
  config: AppConfig;
  printerName?: string;
  onClose?: () => void;
  embedded?: boolean;
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function formatCityDate(dateObj: Date, city: string): string {
  const day = dateObj.getDate();
  const month = MONTHS[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${city || 'Peixoto de Azevedo - MT'}, ${day} de ${month} de ${year}.`;
}

export const ReciboA4: React.FC<ReciboA4Props> = ({ data, type, config, printerName, onClose, embedded }) => {
  if (!data) return <div className="p-20 text-center text-slate-400 font-black uppercase tracking-widest">Erro: Dados não localizados</div>;
  if (!config) return <div className="p-20 text-center text-slate-400 font-black uppercase tracking-widest">Erro: Configuração não encontrada</div>;

  const isOrder = type === 'ORDER';
  const order = isOrder ? (data as Order) : null;
  const expense = !isOrder ? (data as Expense) : null;
  const rawValue = isOrder ? (Number(order?.total) || 0) : (Number(expense?.amount) || 0);
  const value = Math.abs(rawValue);
  const currencyValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const extenso = valorPorExtenso(value);

  let dateObj = new Date();
  try {
      const rawDate = isOrder ? order?.createdAt : expense?.date;
      if (rawDate) {
        if (typeof rawDate === 'object' && typeof (rawDate as any).toDate === 'function') {
          dateObj = (rawDate as any).toDate();
        } else if (typeof rawDate === 'object' && 'seconds' in (rawDate as any)) {
          dateObj = new Date((rawDate as any).seconds * 1000);
        } else {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) dateObj = d;
        }
      }
  } catch (e) {}

  const dateLong = dateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateShort = dateObj.toLocaleDateString('pt-BR');
  const timeShort = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const cityLine = formatCityDate(dateObj, config.contactAddress || 'Peixoto de Azevedo - MT');

  const pagadorNome = isOrder ? (order?.userName || 'Consumidor Geral') : (config?.institutionName || 'Instituição');
  const pagadorDoc = isOrder ? (mascararCpf(order?.userCpf) || 'Identificado no Sistema') : (config?.cnpj || '00.000.000/0001-00');
  const beneficiarioNome = isOrder ? (config?.institutionName || 'Instituição') : (expense?.recipientName || 'Favorecido Não Informado');
  const beneficiarioDoc = isOrder ? (config?.cnpj || '00.000.000/0001-00') : (mascararCpf(expense?.recipientCpf) || 'S/ DOCUMENTO');
  const numRecibo = !isOrder ? ((expense as any)?.auditDocNumber || expense?.recipientDoc || '') : '';
  const referenciaId = isOrder ? (order?.id || '') : numRecibo;

  let description = '';
  if (isOrder) {
      description = `Pagamento integral referente à aquisição de produtos/serviços conforme pedido #${(order?.id || '').slice(0,8).toUpperCase()} destinado ao interno(a) ${order?.inmateName || 'N/A'}.`;
  } else {
      description = expense?.description || 'Pagamento de despesa administrativa.';
  }

  const category = !isOrder ? (expense?.category || '') : '';
  const observation = !isOrder ? (expense?.observation || '') : '';

  // Totais consolidados dos itens (a tabela não tinha linha de TOTAL antes)
  const itensTotalQtd = isOrder && Array.isArray(order?.items)
    ? order.items.reduce((s, i) => s + (Number(i?.quantity) || 0), 0) : 0;
  const itensTotalValor = isOrder && Array.isArray(order?.items)
    ? order.items.reduce((s, i) => s + (Number(i?.priceAtPurchase) || 0) * (Number(i?.quantity) || 1), 0) : 0;

  const declaratoryPhrase = isOrder
    ? `Declaramos para os devidos fins que recebemos a importância de ${currencyValue} (${extenso}) referente a: ${description}`
    : `Recebemos da ${config.institutionName || 'MERCADO FÁCIL'} (${config.cnpj || 'CNPJ NÃO INFORMADO'}) a importância de ${currencyValue} (${extenso}), referente a: ${description}`;

  const idClean = (data.id || 'XXXX').replace(/-/g, '').toUpperCase();
  // CORREÇÃO DE INTEGRIDADE: o código de autenticação ANTES usava Date.now()
  // e mudava a cada renderização/reimpressão do mesmo recibo (falha de
  // auditoria). Agora é DETERMINÍSTICO — derivado só do ID do documento:
  // a mesma venda gera sempre o mesmo código, na tela e no papel.
  const seedA = idClean.slice(0, 8).padEnd(8, '0');
  const seedB = (idClean.slice(8, 16) + idClean.slice(0, 8)).slice(0, 8).padEnd(8, '0').split('').reverse().join('');
  const authHash = `AUTH-${seedA}-${seedB}`;
  const codigoControle = (idClean.slice(0, 24) || '00000000').replace(/(.{4})(?=.)/g, '$1-');

  return (
    <div id="print-root" className={embedded
      ? "bg-white overflow-visible"
      : "fixed inset-0 z-[500] bg-slate-100 overflow-y-auto custom-scrollbar animate-fadeIn print:overflow-visible cupom-gerencial-print"}>

      {/* ACTION BAR (PRINT PREVIEW) */}
      {!embedded && (
      <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b-2 border-slate-200 p-5 flex justify-between items-center z-[510] shadow-xl print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg"><FileText size={24} /></div>
          <div>
              <h3 className="font-black text-slate-900 uppercase tracking-tighter text-lg leading-none">Visualização de Documento</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Status: Documento Autêntico e Assinado Digitalmente</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setTimeout(() => window.print(), 350)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl hover:-translate-y-1 active:scale-95 transition-all">
            <Printer size={20} /> Imprimir Recibo
          </button>
          {onClose && (
            <button onClick={onClose} className="bg-white border-2 border-slate-300 text-slate-700 hover:text-white hover:bg-red-600 hover:border-red-600 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-95">
                <X size={20} /> Encerrar
            </button>
          )}
        </div>
      </div>
      )}

      {/* A4 CANVAS */}
      <div className={embedded
        ? "bg-white text-black p-4 sm:p-6 w-full md:max-w-[210mm] mx-auto relative font-sans shadow-xl shadow-slate-300/50 my-4 md:my-6 box-border print:shadow-none print:w-full print:m-0 print:p-6"
        : "bg-white text-black p-8 w-full max-w-[210mm] min-h-[297mm] mx-auto relative font-sans shadow-2xl print:shadow-none print:w-full print:m-0 print:p-6 box-border my-10 print:my-0"}>

        {/* EXTERNAL BORDER — overflow-visible no print garante que o footer
            (assinatura + código de controle) NÃO seja cortado na impressão A4 */}
        <div className="border-[2px] border-slate-900 p-6 sm:p-8 min-h-full relative print:overflow-visible print:h-auto">

            {/* WATERMARK */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] -rotate-12 select-none">
                <Shield size={500} />
            </div>

            <div className="relative z-10">
                {/* HEADER */}
                <div className="relative flex justify-between items-start border-b-[3px] border-slate-900 pb-3 mb-4">
                    <div className="absolute -bottom-[3px] left-0 w-28 h-[3px] bg-emerald-500"></div>
                    <div className="flex items-center gap-5">
                        <div className="bg-gradient-to-br from-slate-900 to-slate-700 p-4 rounded-2xl shadow-md print:shadow-none"><ShieldCheck size={38} className="text-emerald-400"/></div>
                        <div>
                            <h1 className="text-xl font-black uppercase tracking-tight leading-none text-slate-900">{config.institutionName}</h1>
                            <p className="text-[10px] font-black text-emerald-600 mt-1.5 uppercase tracking-[0.22em]">{config.appName || 'Sistema de Gestão'}</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{config.contactAddress || ''} | CNPJ: {config.cnpj || ''}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[8px] font-black uppercase tracking-widest rounded-full mb-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Protocolo Digital
                        </div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none">
                            {isOrder ? (config.receiptMainTitleOrder || 'Recibo de Venda') : (config.receiptMainTitleExpense || 'Recibo de Pagamento')}
                        </h2>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1.5">
                            {isOrder ? 'Comprovante Oficial de Venda' : 'Comprovante de Despesa Administrativa'}
                        </p>
                        <p className="text-xs font-bold text-slate-500 mt-1 uppercase">{dateShort} • {timeShort}h</p>
                    </div>
                </div>

                {/* EMISSION DATE — City + Date by extenso */}
                <div className="mb-3 px-2">
                    <p className="text-sm font-bold text-slate-700 italic leading-relaxed">{cityLine}</p>
                </div>

                {/* VALUE BOX */}
                <div className="grid grid-cols-3 gap-4 mb-5">
                    <div className="col-span-2 bg-white border border-slate-200 border-l-4 border-l-emerald-500 p-4 rounded-r-2xl">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Valor Total</p>
                        <p className="text-[2.2rem] leading-none font-black font-mono tracking-tighter text-slate-900">{currencyValue}</p>
                        <p className="text-[11px] font-bold text-slate-500 italic mt-2 leading-relaxed">
                            Valor por extenso: <span className="font-black not-italic uppercase text-slate-700">{extenso}</span>
                        </p>
                    </div>
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center text-center shadow-md print:shadow-none">
                        <p className="text-[9px] font-bold uppercase text-white/60 tracking-widest mb-1.5">
                            {isOrder ? 'Pedido' : 'Nº do Recibo'}
                        </p>
                        <p className="text-base font-black font-mono tracking-tight text-emerald-400 break-all">#{(referenciaId || data.id || '').slice(0, 12).toUpperCase()}</p>
                    </div>
                </div>

                {/* PARTICIPANTS */}
                <div className="grid grid-cols-2 gap-4 mb-5 print-avoid-break">
                     <div className="p-4 bg-white border border-slate-200 rounded-2xl relative">
                        <span className="absolute right-3 top-3 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center"><User size={15} className="text-slate-400"/></span>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5">{isOrder ? 'Cliente / Pagador' : 'Instituição Pagadora'}</p>
                        <p className="text-sm font-black uppercase text-slate-900 leading-tight pr-8">{pagadorNome}</p>
                        <p className="text-[11px] font-bold text-slate-500 mt-1 font-mono">DOC: {pagadorDoc}</p>
                     </div>
                     <div className="p-4 bg-white border border-slate-200 rounded-2xl relative">
                        <span className="absolute right-3 top-3 w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center"><CreditCard size={15} className="text-emerald-500"/></span>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5">{isOrder ? 'Beneficiário' : 'Recebedor'}</p>
                        <p className="text-sm font-black uppercase text-slate-900 leading-tight pr-8">{beneficiarioNome}</p>
                        <p className="text-[11px] font-bold text-slate-500 mt-1 font-mono">DOC: {beneficiarioDoc}</p>
                        {!isOrder && numRecibo && (
                            <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-lg">
                                Recibo #{numRecibo.slice(0, 14)}
                            </span>
                        )}
                     </div>
                </div>

                {/* DETAILS */}
                <div className="mb-5">
                     <div className="flex items-center gap-2 mb-3 px-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                         <h3 className="font-black uppercase text-[10px] tracking-[0.2em] text-slate-500">{config.receiptLabelHistory || 'Detalhamento Técnico da Operação'}</h3>
                     </div>
                     <div className="px-5 py-4 bg-slate-50 rounded-2xl border border-slate-200">
                        {/* DECLARATORY PHRASE */}
                        <p className="text-[14px] text-slate-700 leading-relaxed text-justify mb-4 font-medium border-l-[3px] border-emerald-400 pl-4">
                            {declaratoryPhrase}
                        </p>

                        {/* CATEGORY */}
                        {category && (
                            <div className="mb-3 p-3 bg-white rounded-xl border border-slate-200">
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Categoria</p>
                                <p className="text-sm font-bold text-slate-900 uppercase">{category}</p>
                            </div>
                        )}

                        {/* OBSERVATION */}
                        {observation && (
                            <div className="mb-2 p-3 bg-white rounded-xl border border-slate-200">
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">{config.receiptLabelObservations || 'Observações'}</p>
                                <p className="text-sm font-bold text-slate-900 whitespace-pre-wrap">{observation}</p>
                            </div>
                        )}

                        {isOrder && order?.items && (
                           <div className="mt-4 pt-4 border-t border-slate-200 border-dashed print-avoid-break">
                               <table className="w-full text-xs">
                                   <thead>
                                       <tr className="text-[8px] font-black uppercase text-slate-400 tracking-widest text-left border-b-2 border-slate-900">
                                           <th className="pb-2 px-1">Descrição do Item</th>
                                           <th className="pb-2 px-1 text-center">Qtd</th>
                                           <th className="pb-2 px-1 text-right">Unitário</th>
                                           <th className="pb-2 px-1 text-right">Subtotal</th>
                                       </tr>
                                   </thead>
                                   <tbody className="font-bold text-slate-900">
                                       {order.items.map((item, idx) => (
                                           <tr key={idx} className="border-b border-slate-100 last:border-0">
                                               <td className="py-2 px-1">
                                                   <p className="font-black uppercase text-slate-900 text-[11px] leading-tight mb-0.5">{item?.name || 'Item'}</p>
                                                   <div className="flex items-center gap-2 flex-wrap">
                                                       {(item as any).brand && <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">{(item as any).brand}</span>}
                                                       {((item as any).barcode || (item as any).ean) && <span className="text-[8px] font-bold text-slate-400 font-mono">#{(item as any).barcode || (item as any).ean}</span>}
                                                   </div>
                                               </td>
                                               <td className="py-2 px-1 text-center text-sm font-black text-slate-900">{item.quantity}</td>
                                               <td className="py-2 px-1 text-right text-sm font-bold text-slate-600">R$ {formatarMoeda(item.priceAtPurchase||0)}</td>
                                               <td className="py-2 px-1 text-right text-sm font-black text-slate-900">R$ {formatarMoeda((item.priceAtPurchase||0) * (item.quantity||1))}</td>
                                           </tr>
                                       ))}
                                   </tbody>
                                   <tfoot>
                                       <tr className="border-t-2 border-slate-900 bg-emerald-50/60">
                                           <td colSpan={2} className="py-2.5 px-1 text-right">
                                               <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Total — {itensTotalQtd} {itensTotalQtd === 1 ? 'item' : 'itens'}</span>
                                           </td>
                                           <td className="py-2.5 px-1"></td>
                                           <td className="py-2.5 px-1 text-right text-sm font-black font-mono text-emerald-700 whitespace-nowrap">R$ {formatarMoeda(itensTotalValor)}</td>
                                       </tr>
                                   </tfoot>
                               </table>
                           </div>
                        )}
                     </div>
                </div>

                {/* DECLARATION (fallback) */}
                <div className="px-6 mb-5 text-center">
                     <p className="text-[10px] text-slate-500 font-bold italic leading-relaxed max-w-2xl mx-auto">
                        "{config.receiptDeclaration || 'Documento emitido eletronicamente e válido como comprovante de pagamento.'}"
                     </p>
                </div>
            </div>

            {/* FOOTER & SIGNATURE */}
            <div className="print-avoid-break mt-4 pt-4 border-t border-slate-200">
                <div className="flex justify-between items-center mb-4 px-2">
                     <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 w-full max-w-md">
                         <QrCode size={36} className="text-emerald-600 shrink-0"/>
                         <div className="min-w-0">
                             <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-0.5">Autenticação Digital</p>
                             <p className="text-[10px] font-black text-slate-900 font-mono truncate">{authHash}</p>
                             <p className="text-[7px] font-bold text-slate-400 uppercase mt-0.5">Verificação: {config.appName || 'SISTEMA'} • Gestão Penitenciária</p>
                         </div>
                     </div>
                </div>

                {/* SIGNATURE LINE */}
                <div className="w-full text-center mb-4 px-2">
                    <div className="w-3/4 mx-auto border-t-2 border-slate-900 pt-2">
                       <p className="font-black text-sm uppercase leading-none text-slate-900 mb-1">{beneficiarioNome}</p>
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Assinatura do Recebedor / Beneficiário</p>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[8px] font-black uppercase text-slate-400 border-t border-slate-200 pt-2.5">
                    <span>Emitido em: {dateShort} às {timeShort}</span>
                    <span className="tracking-[0.28em]">Código de controle: {codigoControle}</span>
                </div>
            </div>

        </div>
      </div>

      <style>{`
        @media print {
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            width: auto !important;
            max-width: none !important;
            overflow: visible !important;
          }
          /* 1) Oculta tudo que não é o recibo (fallback universal) */
          body * { visibility: hidden !important; }
          #print-root, #print-root * { visibility: visible !important; }

          /* 2) ELIMINA PÁGINAS FANTASMA/DUPLICAÇÃO: remove do FLUXO (display:none)
             qualquer ramo da árvore que não esteja na cadeia do recibo.
             visibility:hidden mantinha o app inteiro ocupando espaço → páginas
             extras em branco/repetidas. Regra moderna (Chrome/Electron atuais). */
          body *:not(#print-root):not(:has(#print-root)):not(#print-root *) {
            display: none !important;
          }

          /* 3) Contém a largura dentro da área útil A4 (190mm com margem 10mm).
             O canvas md:max-w-[210mm] transbordava → o navegador criava uma
             página extra lateral. Nada dentro do recibo pode passar de 100%. */
          #print-root, #print-root * {
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          #print-root {
            display: block !important;
            position: static !important;
            inset: auto !important;
            background: white !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            width: auto !important;
            max-width: none !important;
            z-index: auto !important;
            animation: none !important;
          }
          .min-h-\\[297mm\\] { min-height: auto !important; height: auto !important; }
          .border-\\[2px\\] { height: auto !important; }  /* mantém borda visual */
          .h-full { height: auto !important; }
          .overflow-hidden { overflow: visible !important; }
          .p-10 { padding: 20px !important; }  /* A4: respiro sem cortar rodapé */
          .my-10, .my-4, .my-6 { margin-top: 0 !important; margin-bottom: 0 !important; }
          .shadow-2xl, .shadow-xl, .shadow-lg, .shadow-sm { box-shadow: none !important; }
          .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
          /* FOOTER do recibo: garante que assinatura + código de controle
             NUNCA sejam empurrados para fora da página impressa */
          .print-avoid-break:last-child { break-inside: avoid; page-break-inside: avoid; margin-top: 16px; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
    </div>
  );
};
