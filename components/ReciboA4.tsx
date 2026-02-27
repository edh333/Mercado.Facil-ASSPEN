import React from "react";
import { Order, Expense, AppConfig } from "../types";
import { Shield } from "lucide-react";

interface ReciboA4Props {
  data: Order | Expense;
  type: 'ORDER' | 'EXPENSE';
  config: AppConfig;
  printerName?: string;
}

export const ReciboA4: React.FC<ReciboA4Props> = ({ data, type, config, printerName }) => {
  if (!data) return <div className="p-8 text-center text-red-600 font-bold">Erro: Dados do recibo não encontrados.</div>;

  const isOrder = type === 'ORDER';
  const order = isOrder ? (data as Order) : null;
  const expense = !isOrder ? (data as Expense) : null;

  // Safe access with defaults to prevent crashes (Applied Fix)
  const value = isOrder ? (Number(order?.total) || 0) : (Number(expense?.amount) || 0);
  
  // Date Handling with Fallback
  let dateObj = new Date();
  try {
      const rawDate = isOrder ? order?.createdAt : expense?.date;
      if (rawDate) dateObj = new Date(rawDate);
  } catch (e) {
      console.error("Invalid date in receipt", e);
  }
  const dateStr = dateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const pagadorNome = isOrder ? (order?.userName || 'Cliente Não Identificado') : config.institutionName;
  const pagadorDoc = isOrder ? (order?.userCpf || '') : config.cnpj;
  
  const beneficiarioNome = isOrder ? config.institutionName : (expense?.recipientName || 'Fornecedor Diverso');
  const beneficiarioDoc = isOrder ? config.cnpj : (expense?.recipientDoc || '');
  
  let description = '';
  if (isOrder) {
      description = `Pagamento referente ao Pedido #${(order?.id || '').slice(0,6).toUpperCase()} destinado ao interno(a) ${order?.inmateName || 'N/I'}.`;
  } else {
      description = expense?.description || 'Pagamento de despesa administrativa/operacional.';
      if (expense?.category) description += ` (Categoria: ${expense.category})`;
  }

  const valorFormatado = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const docId = (isOrder ? order?.id : expense?.id) || '---';

  return (
    <div className="bg-white text-black p-12 w-[210mm] min-h-[297mm] mx-auto relative font-serif leading-relaxed shadow-2xl print:shadow-none print:w-full print:m-0 print:p-8 box-border">
      
      {/* Moldura Dupla Clássica */}
      <div className="border-[3px] border-double border-slate-900 h-full p-10 flex flex-col justify-between relative z-10">
        
        {/* CABEÇALHO OFICIAL */}
        <div className="border-b-[3px] border-slate-900 pb-8 mb-8 flex flex-col items-center text-center">
            <Shield size={64} className="mb-4 text-slate-900" />
            <h1 className="text-2xl font-black uppercase tracking-widest text-black">{config.institutionName}</h1>
            <p className="text-sm font-bold uppercase text-slate-900 mt-1">{config.systemName || config.appName}</p>
            <p className="text-xs mt-1 font-mono text-black">{config.contactAddress} | CNPJ: {config.cnpj}</p>
        </div>

        {/* NUMERAÇÃO E TÍTULO */}
        <div className="flex justify-between items-end mb-10">
            <div>
                <span className="block text-xs font-bold uppercase text-slate-800">Documento Nº</span>
                <span className="text-xl font-mono font-bold text-red-700">#{docId.slice(0,8).toUpperCase()}</span>
            </div>
            <div className="text-right">
                <h2 className="text-3xl font-black uppercase text-black tracking-tight">RECIBO DE {isOrder ? 'VENDA' : 'PAGAMENTO'}</h2>
                <p className="text-sm font-bold text-slate-900 mt-1">{dateStr}</p>
            </div>
        </div>

        {/* VALOR EM DESTAQUE */}
        <div className="bg-slate-50 border-2 border-slate-800 p-6 rounded-lg flex items-center justify-between mb-10 shadow-sm">
            <span className="text-lg font-bold uppercase tracking-wide text-slate-900">Valor Líquido</span>
            <span className="text-4xl font-black text-black">{valorFormatado}</span>
        </div>

        {/* CORPO DO RECIBO */}
        <div className="flex-1 space-y-8 text-base text-slate-900 font-medium">
            
            {/* DADOS DAS PARTES */}
            <div className="grid grid-cols-2 gap-10">
                <div className="border-l-4 border-slate-900 pl-4">
                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Pagador</p>
                    <p className="font-bold text-lg uppercase text-black">{pagadorNome}</p>
                    <p className="text-sm font-mono text-slate-800">{pagadorDoc || 'Documento N/I'}</p>
                </div>
                <div className="border-l-4 border-slate-900 pl-4">
                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Beneficiário</p>
                    <p className="font-bold text-lg uppercase text-black">{beneficiarioNome}</p>
                    <p className="text-sm font-mono text-slate-800">{beneficiarioDoc || 'Documento N/I'}</p>
                </div>
            </div>

            {/* DESCRIÇÃO COMPLETA */}
            <div className="mt-8">
                <p className="font-bold uppercase text-black mb-3 border-b border-slate-400 pb-1">Histórico / Discriminação</p>
                <div className="text-justify leading-7 bg-white p-6 rounded border border-slate-300 min-h-[150px] shadow-inner text-slate-900">
                    {description}
                    {expense?.observation && (
                        <div className="mt-4 pt-4 border-t border-dashed border-slate-400">
                            <span className="font-bold block text-sm uppercase text-slate-700 mb-1">Observações Adicionais:</span> 
                            {expense.observation}
                        </div>
                    )}
                    {isOrder && order?.items && (
                        <div className="mt-4 pt-4 border-t border-dashed border-slate-400">
                            <span className="font-bold block text-sm uppercase text-slate-700 mb-2">Itens do Pedido:</span>
                            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-mono text-slate-900">
                                {order.items.map((item, idx) => (
                                    <li key={idx}>• {item.quantity}x {item.name}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            <p className="mt-6 text-justify text-sm italic text-slate-800 font-medium">
                Declaramos para os devidos fins que recebemos a importância supra, dando plena, rasa e geral quitação.
            </p>
        </div>

        {/* RODAPÉ E ASSINATURA */}
        <div className="mt-16">
            <div className="flex flex-col items-center justify-center">
                <div className="w-2/3 border-t-2 border-slate-900 pt-3 text-center">
                    <p className="font-bold uppercase text-lg text-black">{beneficiarioNome}</p>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Assinatura do Recebedor</p>
                </div>
            </div>
            
            <div className="mt-12 flex justify-between items-end border-t border-slate-200 pt-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">
                    Gerado em {new Date().toLocaleString()} • {config.appName}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                    Impresso por: {printerName || 'Sistema'}
                </div>
            </div>
        </div>

        {/* MARCA D'ÁGUA DE FUNDO */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] z-0">
            <Shield size={500} />
        </div>

      </div>
    </div>
  );
};