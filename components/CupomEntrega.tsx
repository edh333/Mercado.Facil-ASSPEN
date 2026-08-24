import React from 'react';
import { formatarMoeda, mascararCpf } from '../utils';
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
  const saldoExplicito = data.walletBalanceAfter !== undefined && data.walletBalanceAfter !== null;
  const creditoRestante = saldoExplicito ? data.walletBalanceAfter : (data.userName ? (data.userBalance || remainingBalance) : undefined);
  const saldoAnteriorExplicito = data.walletBalanceBefore !== undefined && data.walletBalanceBefore !== null;
  const saldoAnterior = saldoAnteriorExplicito ? data.walletBalanceBefore : undefined;

  const status = String(data.status || '').toLowerCase();
  const cancelado = ['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'rejected', 'rejeitado'].includes(status);
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const temPagamentosMistos = payments.length > 0;
  const nomesMetodo: any = { PIX: 'PIX', WALLET: 'CARTEIRA', CASH: 'DINHEIRO', CARD: 'CARTÃO', FIADO: 'FIADO' };
  const pixKey = Array.isArray(config?.pixKeys) && config.pixKeys[0] ? String(config.pixKeys[0]) : '';
  const ehPix = String(data.paymentMethod || '').toUpperCase() === 'PIX';

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
        {config?.appName && config.appName.toUpperCase() !== String(config?.institutionName || '').toUpperCase() && (
          <p className="font-black uppercase tracking-widest">{config.appName}</p>
        )}
        <p className="font-bold uppercase mt-1 opacity-70">
          {config?.fiscalEmission === true
            ? `Cupom Fiscal - ${config?.fiscalModel || 'NF-e'}`
            : (subtitle || 'Cupom de Entrega - Não Fiscal')}
        </p>
        {config?.fiscalEmission === true && (config?.fiscalNumber || config?.fiscalSeries) && (
          <p className="font-black uppercase mt-1 bg-black text-white px-2 py-0.5 inline-block text-[9px]">
            {config?.fiscalModel || 'NF-e'} Nº {String(config?.fiscalNumber || '').padStart(9, '0')}
            {config?.fiscalSeries ? ` SERIE ${String(config?.fiscalSeries).toUpperCase()}` : ''}
          </p>
        )}
        {(config?.cnpj || config?.contactPhone) && (
          <p className="font-bold mt-1 opacity-60 text-[9px]">
            {config?.cnpj ? `CNPJ: ${config.cnpj}` : ''}
            {config?.cnpj && config?.contactPhone ? ' · ' : ''}
            {config?.contactPhone ? `TEL: ${config.contactPhone}` : ''}
          </p>
        )}
      </div>

      {/* CANCELADO */}
      {cancelado && (
        <div className="border-2 border-black bg-black text-white p-1 mb-2 text-center">
          <span className="font-black uppercase tracking-widest">Cupom Cancelado / Devolvido</span>
        </div>
      )}

      {/* DOCUMENT TYPE */}
      <div className="border border-black p-1 mb-3 text-center bg-black text-white">
         <span className="font-black uppercase">{config?.customReceiptDocName || docName || 'ORDEM DE ENTREGA'}</span>
      </div>

      {/* METADATA */}
      <div className="border-b border-dashed border-black pb-2 mb-2 space-y-0.5">
        <div className="flex justify-between"><span>DATA:</span> <span className="font-black">{formatDate(dataCriacao)}</span></div>
        <div className="flex justify-between"><span>ID:</span> <span className="font-black">#{data.id?.slice(0, 12).toUpperCase() || '---'}</span></div>
        <div className="flex justify-between"><span>OPER:</span> <span className="font-black uppercase">{(data.operatorName || printerName || 'ADMIN').slice(0,15)}</span></div>
        {data.unitName && <div className="flex justify-between"><span>UNIDADE:</span> <span className="font-black uppercase">{data.unitName}</span></div>}
      </div>

      {/* RECEPTOR */}
      {(data.inmateName || data.userName || data.prisonerName) && (
          <div className="mb-2 border-2 border-black p-2 rounded bg-gray-50">
              <p className="font-black uppercase text-[9px] opacity-70 mb-0.5">Destinatário / Interno</p>
              <p className="font-black uppercase leading-tight text-base">{data.inmateName || data.prisonerName || 'Não identificado'}</p>
              {(data.inmateCpf || data.prisonerCpf) && <p className="font-bold text-[10px] mt-0.5">CPF INTERNO: {mascararCpf(data.inmateCpf || data.prisonerCpf)}</p>}
              {data.userName && (data.userName !== data.inmateName) && (
                <div className="mt-1 pt-1 border-t border-dashed border-gray-400">
                  <p className="font-bold text-[10px]">FAMILIAR: {data.userName}</p>
                  {data.userCpf && <p className="font-bold text-[9px] opacity-80">CPF FAMILIAR: {mascararCpf(data.userCpf)}</p>}
                </div>
              )}
          </div>
      )}

      {/* LOCATION — estilo sistema 2: caixa com cabeçalho preto + 3 colunas grandes */}
      {(data.inmateLocation || data.deliveryLocation) && (() => {
        const loc = data.inmateLocation || data.deliveryLocation;
        const temAlgum = loc.raio || loc.ray || loc.ala || loc.wing || loc.cela || loc.cell;
        if (!temAlgum) return null;
        const col = (rotulo: string, valor?: string) => (
          <div>
            <span style={{ fontSize: '9px', fontWeight: 'normal', display: 'block' }}>{rotulo}</span>
            <span style={{ fontSize: '14px', fontWeight: '900' }}>{(valor || '___').toUpperCase()}</span>
          </div>
        );
        return (
          <div className="mb-2 border-2 border-black p-1">
            <div className="bg-black text-white text-center font-black uppercase text-[10px] py-0.5 mb-1">Localização Interna</div>
            <div className="flex justify-around text-center px-1 pb-0.5">
              {col('RAIO', loc.raio || loc.ray)}
              {col('ALA', loc.ala || loc.wing)}
              {col('CELA', loc.cela || loc.cell)}
            </div>
          </div>
        );
      })()}

      {/* ITEMS TABLE */}
      <div className="mb-3">
        <table className="w-full">
            <thead className="border-b border-black">
                <tr>
                    <th className="text-left pb-0.5">ITEM</th>
                    <th className="text-center pb-0.5">QTD X UN</th>
                    <th className="text-right pb-0.5">TOTAL</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {itens.map((item: any, idx: number) => (
                    <tr key={idx}>
                        <td className="py-1.5 pr-1">
                            <p className="font-black uppercase leading-tight">{item?.name || item?.nome || 'Item'}</p>
                            {item.brand && <p className="font-bold opacity-60">{item.brand}</p>}
                        </td>
                        <td className="text-center font-black whitespace-nowrap">{item.quantity || 1} X {formatarMoeda(item.priceAtPurchase || item.price || 0)}</td>
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
            {temPagamentosMistos ? (
                <>
                    <p className="font-black uppercase opacity-60">Formas de Pagamento</p>
                    {payments.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between">
                            <span className="uppercase">{nomesMetodo[p.method] || String(p.method || '?').toUpperCase()}</span>
                            <span>R$ {formatarMoeda(Number(p.amount || 0))}</span>
                        </div>
                    ))}
                    {Number(data.change || 0) > 0 && (
                        <div className="flex justify-between">
                            <span>TROCO</span>
                            <span>R$ {formatarMoeda(Number(data.change))}</span>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="flex justify-between">
                        <span>PAGAMENTO:</span>
                        <span className="uppercase">{data.paymentMethod === 'WALLET' ? 'CARTEIRA' : data.paymentMethod === 'PIX' ? 'PIX' : data.paymentMethod === 'FIADO' ? 'FIADO' : 'DINHEIRO'}</span>
                    </div>
                    {Number(data.change || 0) > 0 && (
                        <div className="flex justify-between">
                            <span>TROCO</span>
                            <span>R$ {formatarMoeda(Number(data.change))}</span>
                        </div>
                    )}
                </>
            )}
            {data.jointWallet && Number(data.jointWallet.secondWalletAmount) > 0 && (
                <div className="border-t border-dashed border-black pt-1 mt-1 space-y-0.5 font-bold">
                    <p className="font-black uppercase opacity-60">Carteira (Em Dupla)</p>
                    <div className="flex justify-between">
                        <span>DEVEDOR 1</span>
                        <span>R$ {formatarMoeda(Math.max(0, Number(data.jointWallet.firstWalletAmount !== undefined ? data.jointWallet.firstWalletAmount : total - Number(data.jointWallet.secondWalletAmount))))}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>DEVEDOR 2: {(data.jointWallet.secondUserName || 'DEVEDOR 2').toUpperCase()}</span>
                        <span>R$ {formatarMoeda(Number(data.jointWallet.secondWalletAmount))}</span>
                    </div>
                </div>
            )}
            {saldoAnterior !== undefined && (
                <div className="flex justify-between italic opacity-80">
                    <span>SALDO ANTERIOR:</span>
                    <span>R$ {formatarMoeda(saldoAnterior)}</span>
                </div>
            )}
            {creditoRestante !== undefined && (
                <div className="flex justify-between italic">
                    <span>SALDO ATUAL:</span>
                    <span>R$ {formatarMoeda(creditoRestante)}</span>
                </div>
            )}
            {ehPix && pixKey && (
                <div className="flex justify-between">
                    <span>CHAVE PIX:</span>
                    <span className="uppercase">{pixKey}</span>
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

      {/* ASSINATURA DO RECEBEDOR (padrão sistema 2 — conferência na entrega) */}
      {!cancelado && (
        <div className="text-center mt-8 mb-3">
          <div className="border-t border-black w-3/4 mx-auto"></div>
          <p className="font-black uppercase text-[9px] mt-1">Assinatura do Recebedor</p>
          {(data.inmateName || data.prisonerName) && (
            <p className="font-bold text-[9px] opacity-70">({data.inmateName || data.prisonerName})</p>
          )}
        </div>
      )}

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
