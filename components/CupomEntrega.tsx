import React from 'react';
import { formatarMoeda } from '../utils';
import { AppConfig } from '../types';
import { ShieldCheck, Hash, Printer, Scissors, QrCode, X } from 'lucide-react';

interface CupomEntregaProps {
  order?: any;
  venda?: any;
  printerName?: string;
  customText?: string;
  title?: string;
  subtitle?: string;
  docName?: string;
  remainingBalance?: number;
  config?: AppConfig;
  onClose?: () => void;
}

export const CupomEntrega: React.FC<CupomEntregaProps> = ({
  order, venda, printerName, customText, title, subtitle, docName, remainingBalance, config, onClose
}) => {
  const data = order || venda;
  if (!data) return <div className="p-10 text-center font-black uppercase text-slate-400">Dados Indisponíveis</div>;

  const itens = data.items || data.itens || [];
  const total = Math.abs(data.total || 0);
  const dataCriacao = data.createdAt || data.date || data.data;
  const creditoRestante = data.walletBalanceAfter !== undefined ? data.walletBalanceAfter : (data.userName ? (data.userBalance || remainingBalance) : undefined);

  const formatDate = (date: string | Date) => {
    if (!date) return new Date().toLocaleString('pt-BR');
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const fontSize = config?.receiptFontSize || 10;
  const authHash = `SEC-${(data.id || 'XXXX').slice(0,8).toUpperCase()}-${Math.floor(Date.now()/1000).toString(36).toUpperCase()}`;

  return (
    <div
      id="print-root"
      className="cupom-gerencial-print bg-white p-3 pt-5 font-mono text-black w-full max-w-[80mm] mx-auto print:m-0 print:p-0 print:w-[76mm] selection:bg-slate-200 overflow-hidden"
      style={{ fontSize: `${fontSize}px`, lineHeight: '1.4', color: 'black' }}
    >

      {/* TOOLBAR (no-print) */}
      {onClose && (
        <div className="print:hidden flex items-center justify-between bg-white border border-slate-200 px-3 py-2 rounded-t-lg mb-2 -mx-2 -mt-2 shadow-sm">
          <span className="font-black uppercase tracking-widest text-slate-600"><Printer size={14} className="inline mr-1" /> Pré-visualização</span>
          <button onClick={onClose} className="bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 p-2 rounded-xl transition-all active:scale-90 border border-slate-200 shadow-sm" title="Fechar"><X size={18}/></button>
        </div>
      )}

      {/* HEADER */}
      <div className="text-center border-b-2 border-black pb-2 mb-3 pt-4">
        <h1 className="text-lg font-black uppercase leading-none mb-1">
          {config?.institutionName || title || 'GESTÃO ERP'}
        </h1>
        <p className="font-black uppercase tracking-widest">{config?.appName || 'Mercado Fácil'}</p>
        <p className="font-bold uppercase mt-1 opacity-70">{subtitle || 'Cupom de Entrega - Não Fiscal'}</p>
      </div>

      {/* DOCUMENT TYPE */}
      <div className="border border-black p-1 mb-3 text-center bg-black text-white">
         <span className="font-black uppercase">{config?.customReceiptDocName || docName || 'ORDEM DE ENTREGA'}</span>
      </div>

      {/* METADATA */}
      <div className="border-b border-dashed border-black pb-2 mb-2 space-y-0.5">
        <div className="flex justify-between"><span>DATA:</span> <span className="font-black">{formatDate(dataCriacao)}</span></div>
        <div className="flex justify-between"><span>ID:</span> <span className="font-black">#{data.id?.slice(0, 10).toUpperCase() || '---'}</span></div>
        <div className="flex justify-between"><span>OPER:</span> <span className="font-black uppercase">{(data.operatorName || printerName || 'ADMIN').slice(0,15)}</span></div>
      </div>

      {/* RECEPTOR */}
      {(data.inmateName || data.userName) && (
          <div className="mb-2 border border-black p-2 rounded bg-gray-50">
              <p className="font-black uppercase opacity-60 mb-0.5">Destinatário / Interno</p>
              <p className="font-black uppercase leading-tight">{data.inmateName || 'Não identificado'}</p>
              {data.userName && (
                <p className="font-bold mt-0.5">Familiar: {data.userName}</p>
              )}
          </div>
      )}

      {/* LOCATION */}
      {(data.inmateLocation || data.deliveryLocation) && (() => {
        const loc = data.inmateLocation || data.deliveryLocation;
        const parts = [ loc.raio ? `R:${loc.raio}` : null, loc.ala ? `A:${loc.ala}` : null, loc.cela ? `C:${loc.cela}` : null ].filter(Boolean);
        if (parts.length === 0) return null;
        return (
          <div className="mb-2 p-1.5 border border-black text-center">
            <p className="font-black uppercase">{parts.join(' | ')}</p>
          </div>
        );
      })()}

      {/* ITEMS TABLE */}
      <div className="mb-3">
        <table className="w-full">
            <thead className="border-b border-black">
                <tr>
                    <th className="text-left pb-0.5">ITEM</th>
                    <th className="text-center pb-0.5">QTD</th>
                    <th className="text-right pb-0.5">VALOR</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {itens.map((item: any, idx: number) => (
                    <tr key={idx}>
                        <td className="py-1.5 pr-1">
                            <p className="font-black uppercase leading-tight">{item?.name || item?.nome || 'Item'}</p>
                            {item.brand && <p className="font-bold opacity-60">{item.brand}</p>}
                        </td>
                        <td className="text-center font-black">{item.quantity || 1}</td>
                        <td className="text-right font-black">R$ {formatarMoeda((item.priceAtPurchase || item.price || 0) * (item.quantity || 1))}</td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* TOTAL */}
      <div className="border-t-2 border-black pt-1 mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="font-black">TOTAL PEDIDO:</span>
          <span className="font-black text-xl">R$ {formatarMoeda(total)}</span>
        </div>

        <div className="border-t border-dashed border-black pt-1 space-y-0.5 font-bold">
            <div className="flex justify-between">
                <span>PAGAMENTO:</span>
                <span className="uppercase">{data.paymentMethod === 'WALLET' ? 'CARTEIRA' : data.paymentMethod === 'PIX' ? 'PIX' : 'DINHEIRO'}</span>
            </div>
            {creditoRestante !== undefined && (creditoRestante !== total) && (
                <div className="flex justify-between italic">
                    <span>SALDO ATUAL:</span>
                    <span>R$ {formatarMoeda(creditoRestante)}</span>
                </div>
            )}
        </div>
      </div>

      {/* FOOTER */}
      <div className="text-center pt-1 mb-4">
        <p className="font-black uppercase mb-2">{config?.receiptFooter || customText || 'Autêntico para conferência'}</p>

        <div className="flex items-center justify-center gap-3 py-2 border border-black rounded">
             <QrCode size={30}/>
             <div className="text-left leading-none">
                 <span className="font-black opacity-50 uppercase">Autenticação Digital</span>
                 <p className="font-black">{authHash}</p>
             </div>
        </div>
      </div>

      <div className="flex flex-col items-center print:hidden border-t border-black border-dashed w-full pt-3 mt-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-black rounded-full -mt-5">
             <Scissors size={10} className="text-white"/>
             <span className="text-[8px] font-black text-white uppercase">Corte Aqui</span>
          </div>
      </div>

      <div className="fim-do-cupom-corte text-center font-black tracking-[0.3em] opacity-20 mt-4 uppercase">
        --- FIM DO CUPOM ---
      </div>

      {/* AVANÇO DE PAPEL PARA CORTE MANUAL — sem page-break (evita loop em bobina contínua) */}
      <div className="print:block hidden">
        {'\n'.repeat(8)}
      </div>
    </div>
  );
};

export default CupomEntrega;
