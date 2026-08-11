import React from "react";
import { formatarMoeda } from "../utils";
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
      if (rawDate) dateObj = new Date(rawDate);
  } catch (e) {}

  const dateLong = dateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const dateShort = dateObj.toLocaleDateString('pt-BR');
  const timeShort = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const cityLine = formatCityDate(dateObj, config.contactAddress || 'Peixoto de Azevedo - MT');

  const pagadorNome = isOrder ? (order?.userName || 'Consumidor Geral') : (config?.institutionName || 'Instituição');
  const pagadorDoc = isOrder ? (order?.userCpf || 'Identificado no Sistema') : (config?.cnpj || '00.000.000/0001-00');
  const beneficiarioNome = isOrder ? (config?.institutionName || 'Instituição') : (expense?.recipientName || 'Favorecido Não Informado');
  const beneficiarioDoc = isOrder ? (config?.cnpj || '00.000.000/0001-00') : (expense?.recipientCpf || 'S/ DOCUMENTO');
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

  const declaratoryPhrase = isOrder
    ? `Declaramos para os devidos fins que recebemos a importância de ${currencyValue} (${extenso}) referente a: ${description}`
    : `Recebemos da ${config.institutionName || 'MERCADO FÁCIL'} (${config.cnpj || 'CNPJ NÃO INFORMADO'}) a importância de ${currencyValue} (${extenso}), referente a: ${description}`;

  const idClean = (data.id || 'XXXX').replace(/-/g, '').toUpperCase();
  const authHash = `AUTH-${idClean.slice(0, 8)}-${Math.floor(Date.now() / 1000).toString(16).toUpperCase().padStart(8, '0')}`;
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
        ? "bg-white text-black p-6 sm:p-8 w-full md:max-w-[210mm] mx-auto relative font-sans shadow-xl shadow-slate-300/50 my-4 md:my-6 box-border print:shadow-none print:w-full print:m-0 print:p-8"
        : "bg-white text-black p-10 w-[210mm] min-h-[297mm] mx-auto relative font-sans shadow-2xl print:shadow-none print:w-full print:m-0 print:p-8 box-border my-10 print:my-0"}>

        {/* EXTERNAL BORDER */}
        <div className="border-[2px] border-slate-900 p-10 h-full flex flex-col justify-between relative overflow-hidden">

            {/* WATERMARK */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] -rotate-12 select-none">
                <Shield size={500} />
            </div>

            <div className="relative z-10">
                {/* HEADER */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-8">
                    <div className="flex items-center gap-6">
                        <div className="bg-slate-900 p-4 rounded-2xl"><ShieldCheck size={40} className="text-white"/></div>
                        <div>
                            <h1 className="text-2xl font-black uppercase tracking-tight leading-none text-slate-900">{config.institutionName}</h1>
                            <p className="text-[10px] font-black text-slate-500 mt-2 uppercase tracking-[0.2em]">{config.appName || 'Sistema de Gestão Prisional'}</p>
                            <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{config.contactAddress || ''} | CNPJ: {config.cnpj || ''}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="inline-block px-3 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-[8px] font-black uppercase tracking-widest rounded-md mb-2">Protocolo Digital</div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">
                            {isOrder ? (config.receiptMainTitleOrder || 'Recibo de Venda') : (config.receiptMainTitleExpense || 'Recibo de Pagamento')}
                        </h2>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                            {isOrder ? 'Comprovante Oficial de Venda' : 'Comprovante de Despesa Administrativa'}
                        </p>
                        <p className="text-sm font-bold text-slate-500 mt-1 uppercase">{dateShort} • {timeShort}h</p>
                    </div>
                </div>

                {/* EMISSION DATE — City + Date by extenso */}
                <div className="mb-6 px-2">
                    <p className="text-sm font-bold text-slate-700 italic leading-relaxed">{cityLine}</p>
                </div>

                {/* VALUE BOX */}
                <div className="grid grid-cols-3 gap-6 mb-8">
                    <div className="col-span-2 bg-slate-50 border border-slate-200 p-6 rounded-3xl">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Valor Total</p>
                        <p className="text-4xl font-black font-mono tracking-tighter text-slate-900">{currencyValue}</p>
                        <p className="text-[11px] font-bold text-slate-600 italic mt-2 leading-relaxed">
                            Valor por extenso: <span className="font-black not-italic uppercase">{extenso}</span>
                        </p>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-3xl flex flex-col items-center justify-center text-center shadow-lg">
                        <p className="text-[9px] font-bold uppercase text-white/70 tracking-widest mb-1">
                            {isOrder ? 'Pedido' : 'Nº do Recibo'}
                        </p>
                        <p className="text-xl font-black font-mono tracking-tighter text-white">#{(referenciaId || data.id || '').slice(0, 12).toUpperCase()}</p>
                    </div>
                </div>

                {/* PARTICIPANTS */}
                <div className="grid grid-cols-2 gap-6 mb-10 print-avoid-break">
                     <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm relative group">
                        <User className="absolute right-4 top-4 text-slate-100" size={32}/>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">{isOrder ? 'Cliente / Pagador' : 'Instituição Pagadora'}</p>
                        <p className="text-lg font-black uppercase text-slate-900 leading-tight">{pagadorNome}</p>
                        <p className="text-xs font-bold text-slate-500 mt-1">DOC: {pagadorDoc}</p>
                     </div>
                     <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm relative group">
                        <CreditCard className="absolute right-4 top-4 text-slate-100" size={32}/>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">{isOrder ? 'Beneficiário' : 'Recebedor'}</p>
                        <p className="text-lg font-black uppercase text-slate-900 leading-tight">{beneficiarioNome}</p>
                        <p className="text-xs font-bold text-slate-500 mt-1">DOC: {beneficiarioDoc}</p>
                        {!isOrder && numRecibo && (
                            <span className="inline-block mt-2 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-lg">
                                Recibo #{numRecibo.slice(0, 14)}
                            </span>
                        )}
                     </div>
                </div>

                {/* DETAILS */}
                <div className="mb-10">
                     <div className="flex items-center gap-2 mb-4 px-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
                         <h3 className="font-black uppercase text-[10px] tracking-[0.2em] text-slate-500">{config.receiptLabelHistory || 'Detalhamento Técnico da Operação'}</h3>
                     </div>
                     <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-200">
                        {/* DECLARATORY PHRASE */}
                        <p className="text-base text-slate-700 leading-relaxed text-justify mb-6 font-medium">
                            {declaratoryPhrase}
                        </p>

                        {/* CATEGORY */}
                        {category && (
                            <div className="mb-4 p-4 bg-white rounded-xl border border-slate-200">
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Categoria</p>
                                <p className="text-sm font-bold text-slate-900 uppercase">{category}</p>
                            </div>
                        )}

                        {/* OBSERVATION */}
                        {observation && (
                            <div className="mb-4 p-4 bg-white rounded-xl border border-slate-200">
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">{config.receiptLabelObservations || 'Observações'}</p>
                                <p className="text-sm font-bold text-slate-900 whitespace-pre-wrap">{observation}</p>
                            </div>
                        )}

                        {isOrder && order?.items && (
                           <div className="mt-4 pt-6 border-t border-slate-200 border-dashed print-avoid-break">
                               <table className="w-full text-xs">
                                   <thead>
                                       <tr className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-left">
                                           <th className="pb-3 px-2">Descrição do Item</th>
                                           <th className="pb-3 px-2 text-center">Qtd</th>
                                           <th className="pb-3 px-2 text-right">Unitário</th>
                                           <th className="pb-3 px-2 text-right">Subtotal</th>
                                       </tr>
                                   </thead>
                                   <tbody className="font-bold text-slate-900">
                                       {order.items.map((item, idx) => (
                                           <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                                               <td className="py-3 px-2">
                                                   <p className="font-black uppercase text-slate-900 text-[13px] leading-tight mb-0.5">{item?.name || 'Item'}</p>
                                                   <div className="flex items-center gap-2">
                                                       {(item as any).brand && <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">{(item as any).brand}</span>}
                                                       {((item as any).barcode || (item as any).ean) && <span className="text-[9px] font-bold text-slate-400">#{(item as any).barcode || (item as any).ean}</span>}
                                                   </div>
                                               </td>
                                               <td className="py-3 px-2 text-center text-sm font-black text-slate-900">{item.quantity}</td>
                                               <td className="py-3 px-2 text-right text-sm font-black text-slate-900">R$ {formatarMoeda(item.priceAtPurchase||0)}</td>
                                               <td className="py-3 px-2 text-right text-sm font-black text-slate-900 bg-slate-50/50">R$ {formatarMoeda((item.priceAtPurchase||0) * (item.quantity||1))}</td>
                                           </tr>
                                       ))}
                                   </tbody>
                               </table>
                           </div>
                        )}
                     </div>
                </div>

                {/* DECLARATION (fallback) */}
                <div className="px-10 mb-10 text-center">
                     <p className="text-[11px] text-slate-500 font-bold italic leading-relaxed max-w-2xl mx-auto">
                        "{config.receiptDeclaration || 'Documento emitido eletronicamente e válido como comprovante de pagamento.'}"
                     </p>
                </div>
            </div>

            {/* FOOTER & SIGNATURE */}
            <div className="print-avoid-break">
                <div className="flex justify-between items-center mb-8 px-4">
                     <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 border-dashed w-1/2">
                         <QrCode size={48} className="text-slate-900 opacity-60"/>
                         <div>
                             <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Autenticação Digital</p>
                             <p className="text-[10px] font-black text-slate-900 font-mono">{authHash}</p>
                             <p className="text-[7px] font-bold text-slate-400 uppercase mt-1">Verificação: {config.appName || 'SISTEMA'} • Gestão Penitenciária</p>
                         </div>
                     </div>
                </div>

                {/* SIGNATURE LINE */}
                <div className="w-full text-center mb-8 px-4">
                    <div className="w-3/4 mx-auto border-t-2 border-slate-900 pt-3">
                       <p className="font-black text-base uppercase leading-none text-slate-900 mb-1">{beneficiarioNome}</p>
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Assinatura do Recebedor / Beneficiário</p>
                    </div>
                </div>

                <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-300 border-t border-slate-50 pt-4">
                    <span>EMITIDO EM: {dateShort} ÀS {timeShort}</span>
                    <span className="tracking-[0.3em]">CÓDIGO DE CONTROLE: {codigoControle}</span>
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
            overflow: visible !important;
            width: auto !important;
            max-width: none !important;
          }
          body * { visibility: hidden !important; }
          #print-root, #print-root * { visibility: visible !important; }
          #print-root.cupom-gerencial-print {
            display: block !important;
            position: relative !important;
            inset: auto !important;
            background: white !important;
            overflow: visible !important;
            width: auto !important;
            max-width: none !important;
            font-family: inherit !important;
            z-index: auto !important;
          }
          .p-10 { padding: 0 !important; }
          .my-10 { margin: 0 !important; }
          .shadow-2xl { box-shadow: none !important; }
          .min-h-\\[297mm\\] { min-height: auto !important; }
          .border-\\[2px\\] { border: none !important; }
          .p-10.p-10 { padding: 24px !important; }
          .print-avoid-break { page-break-inside: avoid; }
          @page { size: A4; margin: 8mm; }
        }
      `}</style>
    </div>
  );
};
