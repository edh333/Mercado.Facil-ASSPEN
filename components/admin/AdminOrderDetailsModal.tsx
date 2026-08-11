import React from 'react';
import {
  ShoppingCart, X, MessageSquareX, Send, Users, FileText, Printer,
  RefreshCw, XCircle, CheckCircle, Box, Truck, CreditCard, MapPin, Loader2
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { Order, OrderStatus } from '../../types';
import { formatarMoeda } from '../../utils';
import { abrirJanelaImpressao } from '../../utils/printUtils';
import { ModalShell } from '../ui/ModalShell';
import ImagePreviewModal from '../ImagePreviewModal';

const ComprovanteImg: React.FC<{ src: string }> = ({ src }) => {
  const [erro, setErro] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  if (erro) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-50 rounded-xl border border-amber-200">
        <div className="text-center p-6">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600 border border-amber-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </div>
          <h5 className="font-black text-amber-700 uppercase text-sm mb-1">Imagem Indisponível</h5>
          <p className="text-[10px] text-amber-500 font-bold">O link do comprovante pode ter expirado</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <div
        className="w-full h-full block relative cursor-pointer"
        onClick={() => setPreviewOpen(true)}
      >
        <img
          src={src}
          className="w-full h-full object-contain rounded-xl"
          alt="Comprovante de Pagamento"
          onError={() => setErro(true)}
        />
      </div>
      {previewOpen && (
        <ImagePreviewModal src={src} alt="Comprovante de Pagamento" onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
};

interface AdminOrderDetailsModalProps {
  order: Order;
  onClose: () => void;
  isRejecting: boolean;
  setIsRejecting: (val: boolean) => void;
  rejectReason: string;
  setRejectReason: (val: string) => void;
  handleRejectOrder: () => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  showNotification: (msg: string, type: string) => void;
  setViewingReceipt: (data: any) => void;
  setPrintOrder: (order: Order) => void;
  setShowRefundModal: (order: Order) => void;
  translateStatus: (status: string | undefined) => string;
  setHistoryModalCpf: (cpf: string) => void;
  setHistoryModalName: (name: string) => void;
  settings?: any;
}

export const AdminOrderDetailsModal: React.FC<AdminOrderDetailsModalProps> = ({
  order, onClose, isRejecting, setIsRejecting, rejectReason, setRejectReason,
  handleRejectOrder, updateOrderStatus, showNotification, setViewingReceipt,
  setPrintOrder, setShowRefundModal, translateStatus, setHistoryModalCpf, setHistoryModalName,
  settings
}) => {
  const { colors } = useTheme();
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isRawPrinting, setIsRawPrinting] = React.useState(false);

  const handleRawPrint = () => {
    if (isRawPrinting) return;
    setIsRawPrinting(true);
    try {
      abrirJanelaImpressao({ type: 'CUPOM', data: order }, settings);
    } catch (e) {
      console.error('Falha ao abrir impressão fiscal:', e);
    } finally {
      setTimeout(() => setIsRawPrinting(false), 800);
    }
  };

  const handleApprove = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await updateOrderStatus(order.id, OrderStatus.PAID);
      showNotification('Pagamento Aprovado com sucesso!', 'success');
    } catch (e) {
      showNotification('Erro ao aprovar pagamento', 'error');
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  const handlePrepare = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await updateOrderStatus(order.id, OrderStatus.PREPARING);
      showNotification('Pedido em Separação', 'info');
    } catch (e) {
      showNotification('Erro ao iniciar separação', 'error');
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  const handleDeliver = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await updateOrderStatus(order.id, OrderStatus.DELIVERED);
      showNotification('Pedido Finalizado!', 'success');
    } catch (e) {
      showNotification('Erro ao finalizar pedido', 'error');
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  const handleRejectConfirm = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await handleRejectOrder();
    } catch (e) {
      showNotification('Erro ao reprovar pedido', 'error');
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title={`Pedido #${(order.id || '').slice(0, 8).toUpperCase()}`}
      subtitle={`${order.date ? new Date(order.date).toLocaleString('pt-BR') : 'DATA INDISPONÍVEL'} • ${translateStatus(order.status)}`}
      icon={<ShoppingCart size={22} />}
      size="xl"
      bodyClassName="relative"
    >

          {/* Rejection Overlay */}
          {isRejecting && (
            <div className="absolute inset-0 bg-white/95 z-[100] flex items-center justify-center p-8 animate-fadeIn">
              <div className="w-full max-w-xl bg-white border-2 border-red-200 shadow-xl rounded-3xl p-12 text-center">
                <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8 text-red-600 border border-red-200">
                    <MessageSquareX size={48}/>
                </div>
                <h3 className="text-2xl font-black text-red-600 uppercase tracking-tighter mb-2">Motivo da Reprovação</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-8">Esta mensagem será enviada ao familiar responsável</p>

                <textarea
                  className="w-full p-6 bg-slate-50 border-2 border-slate-200 focus:border-red-400 rounded-2xl mb-8 text-sm font-black text-slate-900 outline-none h-40 resize-none uppercase shadow-inner placeholder:text-slate-400"
                  placeholder="DESCREVA O MOTIVO (EX: COMPROVANTE ILEGÍVEL...)"
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value.toUpperCase())}
                  autoFocus
                ></textarea>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button onClick={() => setIsRejecting(false)} disabled={isProcessing} className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50 touch-target border border-slate-200">
                    Cancelar
                  </button>
                  <button onClick={handleRejectConfirm} disabled={isProcessing} className="flex-[2] py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 shadow-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-60 touch-target">
                    <Send size={20}/> {isProcessing ? 'REPROVANDO...' : 'Confirmar Reprovação'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Logistics & Items */}
            <div className="lg:col-span-7 space-y-8">

              {/* Customer/Inmate Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mb-4">Familiar Responsável</p>
                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">{order.userName}</h4>
                    <p className="text-xs font-black text-slate-500 font-mono mt-2">{order.userCpf}</p>
                    <button onClick={() => { setHistoryModalCpf(order.userCpf); setHistoryModalName(order.userName); }} className="mt-6 w-full py-3.5 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-slate-200 transition-all flex items-center justify-center gap-3">
                        <Users size={16}/> Histórico Compras
                    </button>
                  </div>

                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mb-4">Destinatário / Interno</p>
                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight truncate">{order.inmateName || 'NÃO IDENTIFICADO'}</h4>
                    <p className="text-xs font-black text-slate-500 font-mono mt-2">{order.inmateCpf || '---'}</p>
                    <div className="mt-6 flex items-center gap-2">
                        <div className="px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                            <MapPin size={14}/> {order.inmateLocation?.ray}{order.inmateLocation?.wing} - CEL {order.inmateLocation?.cell}
                        </div>
                    </div>
                  </div>
              </div>

              {/* Items Table */}
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-5">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500 flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-xl">
                            <Box size={18} className="text-emerald-600"/>
                        </div>
                        Composição do Carrinho
                    </h4>
                    <span className="text-[10px] font-black uppercase px-4 py-2 bg-slate-100 rounded-xl border border-slate-200 text-slate-600">{(order.items || []).length} Itens</span>
                </div>

                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                  {(order.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="bg-slate-100 text-slate-600 w-10 h-10 flex items-center justify-center rounded-xl text-sm font-black border border-slate-200 shadow-sm">
                            {item.quantity}x
                        </div>
                        <div>
                            <span className="text-sm font-black text-slate-900 uppercase tracking-tight leading-none block mb-1">{item?.name || 'Item'}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unidade: R$ {formatarMoeda(item.priceAtPurchase)}</span>
                        </div>
                      </div>
                      <span className="font-black text-lg text-emerald-600 tracking-tighter">R$ {formatarMoeda(item.priceAtPurchase * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-200 flex justify-between items-end">
                  <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Total Geral do Pedido</p>
                      <h3 className="text-4xl font-black text-slate-900 tracking-tighter">
                        <span className="text-xl text-emerald-600 mr-2">R$</span>
                        {formatarMoeda(Number(order.total))}
                      </h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Payment & Actions */}
            <div className="lg:col-span-5 flex flex-col gap-8">

              {/* Payment Proof Card */}
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500 flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-xl">
                            <CreditCard size={18} className="text-emerald-600"/>
                        </div>
                        Comprovante Digital
                    </h4>
                    {order.paymentMethod !== 'WALLET' && order.paymentProofUrl && order.paymentProofUrl !== 'PENDENTE_UPLOAD_LOCAL_CACHE' && (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            Anexado
                        </span>
                    )}
                </div>

                <div className="flex-1 bg-white rounded-2xl overflow-hidden border border-slate-200 relative flex items-center justify-center min-h-[350px] group shadow-inner">
                  {order.paymentMethod === 'WALLET' ? (
                    <div className="text-center p-10 animate-fadeIn">
                      <div className="w-28 h-28 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-8 text-blue-600 border border-blue-200 group-hover:scale-110 transition-transform duration-500">
                        <CreditCard size={56}/>
                      </div>
                      <h5 className="font-black text-slate-900 uppercase tracking-[0.2em] text-sm">Pago via Carteira Digital</h5>
                      <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase tracking-widest">Débito automático no saldo interno</p>
                    </div>
                  ) : order.paymentProofUrl && order.paymentProofUrl !== 'PENDENTE_UPLOAD_LOCAL_CACHE' ? (
                    <div className="w-full h-full p-3 flex flex-col items-center justify-center gap-3">
                      {(order.paymentProofUrl || '').toLowerCase().includes('.pdf') || (order.paymentProofUrl || '').toLowerCase().includes('pdf') ? (
                        <div className="w-full h-full flex-1 min-h-[300px] relative">
                          <iframe
                            src={`${order.paymentProofUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                            className="w-full h-full border-0 rounded-xl"
                            title="Comprovante PDF"
                          />
                        </div>
                      ) : (
                        <ComprovanteImg src={order.paymentProofUrl} />
                      )}
                      <a 
                        href={order.paymentProofUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-700 transition-all block text-center w-full max-w-xs"
                      >
                        ↗️ VER EM ALTA DEFINIÇÃO (FULL HD)
                      </a>
                    </div>
                  ) : order.paymentProofUrl === 'PENDENTE_UPLOAD_LOCAL_CACHE' ? (
                    <div className="text-center p-10 animate-fadeIn">
                      <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-amber-600 border border-amber-200">
                        <FileText size={40}/>
                      </div>
                      <h5 className="font-black text-amber-700 uppercase tracking-[0.1em] text-sm">COMPROVANTE PENDENTE DE UPLOAD</h5>
                      <p className="text-[10px] text-amber-500 font-bold mt-2 uppercase tracking-widest">Upload falhou — comprovante em cache local do cliente</p>
                    </div>
                  ) : (
                    <div className="text-center p-10 animate-fadeIn">
                      <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-400 border border-slate-200">
                        <FileText size={40}/>
                      </div>
                      <h5 className="font-black text-slate-500 uppercase tracking-[0.1em] text-sm">COMPROVANTE NÃO ENVIADO</h5>
                      <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-widest">Nenhum comprovante anexado a este pedido</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleRawPrint} disabled={isRawPrinting} className="py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-md disabled:opacity-50">
                        {isRawPrinting ? <Loader2 size={18} className="animate-spin"/> : <Printer size={18}/>} Bobina 48mm
                    </button>
                    <button onClick={() => setPrintOrder(order)} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-3 border border-slate-200">
                        <FileText size={18}/> Cupom PDV
                    </button>
                    <button onClick={() => setViewingReceipt({ data: order, type: 'ORDER' })} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-3 border border-slate-200">
                        <FileText size={18}/> Recibo A4
                    </button>
                    <button onClick={() => { if (order.inmateCpf) { setHistoryModalCpf(order.inmateCpf); setHistoryModalName(order.inmateName || 'INTERNO'); } else { showNotification('CPF do interno não informado', 'error'); } }} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-3 border border-slate-200">
                        <Users size={18}/> Histórico
                    </button>
                </div>

                {order.status !== OrderStatus.CANCELLED && (
                  <button onClick={() => setShowRefundModal(order)} className="w-full py-4 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-amber-100 transition-all">
                      <RefreshCw size={18}/> Estornar Total de Produtos
                  </button>
                )}

                <div className="pt-4 border-t border-slate-200 mt-4">
                    {order.status === OrderStatus.PENDING ? (
                      <div className="flex flex-col xl:flex-row gap-3">
                        <button onClick={() => setIsRejecting(true)} disabled={isProcessing} className="flex-1 py-4 bg-red-50 text-red-600 border border-red-200 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-red-600 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                            <XCircle size={22}/> Reprovar
                        </button>
                        <button
                          onClick={handleApprove}
                          disabled={isProcessing}
                          className="flex-[1.5] py-4 bg-emerald-600 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          <CheckCircle size={22}/> {isProcessing ? 'APROVANDO...' : 'Aprovar Pedido'}
                        </button>
                      </div>
                    ) : order.status === OrderStatus.PAID ? (
                        <button onClick={handlePrepare} disabled={isProcessing} className="w-full py-5 bg-blue-600 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.3em] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50">
                            <Box size={24}/> {isProcessing ? 'PROCESSANDO...' : 'Iniciar Separação'}
                        </button>
                    ) : order.status === OrderStatus.PREPARING ? (
                        <button onClick={handleDeliver} disabled={isProcessing} className="w-full py-5 bg-purple-600 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.3em] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50">
                            <Truck size={24}/> {isProcessing ? 'PROCESSANDO...' : 'Marcar como Entregue'}
                        </button>
                    ) : (
                        <div className="w-full py-4 bg-white rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3">
                            <CheckCircle size={20}/> Pedido {translateStatus(order.status)}
                        </div>
                    )}
                </div>
              </div>
            </div>
            </div>
        </ModalShell>
  );
};
