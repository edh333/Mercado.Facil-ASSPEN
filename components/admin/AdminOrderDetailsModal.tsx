import React from 'react';
import {
  ShoppingCart, X, MessageSquareX, Send, Users, FileText, Printer,
  RefreshCw, XCircle, CheckCircle, Box, Truck, CreditCard, MapPin, Loader2, ExternalLink, Shield, ShieldCheck, AlertTriangle, Copy
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { Order, OrderStatus } from '../../types';
import { formatarMoeda, formatCPF } from '../../utils';
import { abrirJanelaImpressao } from '../../utils/printUtils';
import { ModalShell } from '../ui/ModalShell';
import ImagePreviewModal from '../ImagePreviewModal';
import { useApp } from '../../context/StoreContext';
import { toDate } from '../../utils/dateUtils';

const ComprovanteImg: React.FC<{ src: string }> = ({ src }) => {
  const [erro, setErro] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  React.useEffect(() => {
    setErro(false);
  }, [src]);

  if (erro) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-50/95 rounded-xl border border-amber-200 p-4 z-10">
        <div className="text-center p-4">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-600 border border-amber-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          </div>
          <h5 className="font-black text-amber-800 uppercase text-xs mb-1">Visualização Direta Indisponível</h5>
          <p className="text-[10px] text-amber-600 font-bold mb-3">Tente abrir o link diretamente ou recarregar</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => setErro(false)} className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-800 rounded-lg text-[10px] font-black uppercase transition-all">Tentar Novamente</button>
            {src && src.startsWith('http') && (
              <a href={src} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-black uppercase transition-all">Abrir Link ↗</a>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div
        className="w-full h-full block relative cursor-pointer group"
        onClick={() => setPreviewOpen(true)}
      >
        <img
          src={src}
          className="w-full h-full object-contain rounded-xl"
          alt="Comprovante de Pagamento"
          onError={() => setErro(true)}
        />
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
          <span className="bg-white/90 text-slate-900 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg">Clique para Ampliar</span>
        </div>
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
  const { attachAdminProof, showNotification: notifCtx, aprovarPedido } = useApp();
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isRawPrinting, setIsRawPrinting] = React.useState(false);
  const [proofLocal, setProofLocal] = React.useState('');
  const [isAttaching, setIsAttaching] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const proofSrc = proofLocal || order.paymentProofUrl || '';

  const temComprovante = order.paymentMethod === 'WALLET' || !!(proofSrc && proofSrc !== 'PENDENTE_UPLOAD_LOCAL_CACHE');

  // Spelling normalizado: o servidor grava 'pending'; dados legados podem ter
  // 'pendente'/'pending_payment'/'pago_pendente'. Todos precisam do fluxo de
  // aprovação — sem isso o botão "Aprovar" desaparecia silenciosamente.
  const ehPedidoAguardandoAprovacao = ['pending', 'pendente', 'pending_payment', 'pago_pendente'].includes(String(order.status || '').toLowerCase());

  // Fecha o modal SOMENTE em caso de sucesso. Em erro, mantém aberto com a
  // mensagem exibida — o admin nunca perde a janela com o pedido pendente.
  const executarAprovacao = async (finalizar: boolean) => {
    if (isProcessing) return;
    if (!temComprovante) {
      showNotification('Pedido sem comprovante de pagamento. Anexe o comprovante antes de aprovar.', 'error');
      return;
    }
    setIsProcessing(true);
    try {
      await aprovarPedido(order.id, finalizar);
      showNotification(finalizar ? 'Comprovante verificado — Pedido Aprovado e Finalizado!' : 'Pagamento aprovado com sucesso!', 'success');
      onClose();
    } catch (e: any) {
      showNotification(e?.message || (finalizar ? 'Erro ao finalizar pedido' : 'Erro ao aprovar pagamento'), 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = () => executarAprovacao(false);

  const handleApproveAndFinalize = () => executarAprovacao(true);

  const handleAttachProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsAttaching(true);
    try {
      const url = await attachAdminProof('orders', order.id, order.userId, file);
      setProofLocal(url);
      notifCtx('Comprovante anexado ao pedido com sucesso!', 'success');
    } catch (err: any) {
      notifCtx('Erro ao anexar comprovante: ' + (err?.message || 'tente novamente'), 'error');
    } finally {
      setIsAttaching(false);
    }
  };

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

  const handlePrint = () => {
    if (!proofSrc) return;
    const win = window.open(proofSrc, '_blank');
    if (win) {
      setTimeout(() => { try { win.print(); } catch { /* noop */ } }, 1000);
    } else {
      notifCtx('Popup bloqueado. Permita popups para imprimir.', 'error');
    }
  };

  const handlePrepare = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await updateOrderStatus(order.id, OrderStatus.PREPARING);
      showNotification('Pedido em Separação', 'info');
      onClose();
    } catch (e) {
      showNotification('Erro ao iniciar separação', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeliver = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await updateOrderStatus(order.id, OrderStatus.DELIVERED);
      showNotification('Pedido Finalizado!', 'success');
      onClose();
    } catch (e) {
      showNotification('Erro ao finalizar pedido', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await handleRejectOrder();
      onClose();
    } catch (e) {
      showNotification('Erro ao reprovar pedido', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title={`Pedido #${(order.id || '').slice(0, 8).toUpperCase()}`}
      subtitle={`${order.date ? toDate(order.date)?.toLocaleString('pt-BR') || '' : 'DATA INDISPONÍVEL'} • ${translateStatus(order.status)}`}
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
                <h3 className="text-2xl font-bold text-red-600 tracking-tight mb-2">Motivo da Reprovação</h3>
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
                    <h4 className="text-xl font-bold text-slate-900 tracking-tight truncate">{order.userName}</h4>
                    <p className="text-xs font-black text-slate-500 font-mono mt-2">{formatCPF(order.userCpf)}</p>
                    <button onClick={() => { setHistoryModalCpf(order.userCpf); setHistoryModalName(order.userName); }} className="mt-6 w-full py-3.5 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border border-slate-200 transition-all flex items-center justify-center gap-3">
                        <Users size={16}/> Histórico Compras
                    </button>
                  </div>

                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mb-4">Destinatário / Interno</p>
                    <h4 className="text-xl font-bold text-slate-900 tracking-tight truncate">{order.inmateName || 'NÃO IDENTIFICADO'}</h4>
                    <p className="text-xs font-black text-slate-500 font-mono mt-2">{formatCPF(order.inmateCpf)}</p>
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
                    {order.paymentMethod !== 'WALLET' && proofSrc && proofSrc !== 'PENDENTE_UPLOAD_LOCAL_CACHE' && (
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
                  ) : proofSrc && proofSrc !== 'PENDENTE_UPLOAD_LOCAL_CACHE' ? (
                    <div className="flex flex-col h-full w-full">
                      {/* Preview Area */}
                      <div className="flex-1 min-h-[350px] max-h-[500px] bg-white rounded-xl border border-slate-200 relative overflow-hidden flex flex-col">
                        {(proofSrc).toLowerCase().includes('.pdf') || (proofSrc).toLowerCase().includes('pdf') ? (
                          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl">
                            <FileText size={64} className="text-emerald-500 mb-4" />
                            <p className="font-black text-emerald-600 text-lg mb-2">Comprovante em PDF</p>
                            <p className="text-sm text-slate-500 text-center mb-6 max-w-md">PDFs não podem ser visualizados inline devido a restrições de segurança do navegador. Use os botões abaixo para abrir, imprimir ou baixar.</p>
                          </div>
                        ) : (
                          <ComprovanteImg src={proofSrc} />
                        )}
                        {/* Loading indicator for PDF */}
                        {(proofSrc).toLowerCase().includes('.pdf') && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-100 to-transparent h-16 pointer-events-none" />
                        )}
                      </div>
                      
                      {/* Action Buttons Below Preview */}
                      <div className="flex flex-wrap gap-3 mt-4 p-2 bg-slate-50 rounded-xl border border-slate-200">
                        {(proofSrc).toLowerCase().includes('.pdf') ? (
                          <>
                            <button 
                              onClick={() => window.open(proofSrc, '_blank')} 
                              className="flex-1 min-w-[140px] py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                            >
                              <ExternalLink size={14} /> Abrir PDF em Nova Aba
                            </button>
                            <button 
                              onClick={handlePrint} 
                              className="flex-1 min-w-[140px] py-3 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                            >
                              <Printer size={14} /> Imprimir
                            </button>
                            <a 
                              href={proofSrc} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex-1 min-w-[140px] py-3 px-4 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 hover:bg-slate-200"
                            >
                              <ExternalLink size={14} className="mr-1" /> Nova Aba
                            </a>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => window.open(proofSrc, '_blank')} 
                              className="flex-1 min-w-[140px] py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                            >
                              <ExternalLink size={14} /> Abrir em Nova Aba
                            </button>
                            <button 
                              onClick={handlePrint} 
                              className="flex-1 min-w-[140px] py-3 px-4 bg-slate-600 hover:bg-slate-500 text-white rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                            >
                              <Printer size={14} /> Imprimir
                            </button>
                            <a 
                              href={proofSrc} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex-1 min-w-[140px] py-3 px-4 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 hover:bg-slate-200"
                            >
                              <ExternalLink size={14} className="mr-1" /> Nova Aba
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ) : proofSrc === 'PENDENTE_UPLOAD_LOCAL_CACHE' ? (
                    <div className="text-center p-10 animate-fadeIn">
                      <div className="w-20 h-20 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-amber-600 border border-amber-200">
                        <FileText size={40}/>
                      </div>
                      <h5 className="font-black text-amber-700 uppercase tracking-[0.1em] text-sm">COMPROVANTE PENDENTE DE UPLOAD</h5>
                      <p className="text-[10px] text-amber-500 font-bold mt-2 uppercase tracking-widest">Upload falhou no aparelho do familiar. Peça para reenviar ou anexe manualmente abaixo.</p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAttaching}
                        className="mt-6 px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-50 mx-auto"
                      >
                        {isAttaching ? <Loader2 size={16} className="animate-spin"/> : <FileText size={16}/>} Anexar Comprovante (Admin)
                      </button>
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

              {order.paymentMethod !== 'WALLET' && (order.proofHash || order.proofSize || order.proofMime) && (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Shield size={14}/> Integridade do Comprovante
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase shrink-0">Assinatura SHA-256</span>
                    {order.proofHash ? (
                      <span className="text-[9px] font-mono font-black text-emerald-600 flex items-center gap-1 break-all text-right">
                        <ShieldCheck size={12} className="shrink-0"/> {order.proofHash.slice(0, 18)}…
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-amber-600 uppercase flex items-center gap-1 shrink-0">
                        <AlertTriangle size={12}/> Sem assinatura
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase shrink-0">Tamanho</span>
                    <span className={`text-[10px] font-black ${order.proofSize != null && order.proofSize > 0 && order.proofSize < 3 * 1024 ? 'text-red-600' : 'text-slate-700'}`}>
                      {order.proofSize
                        ? (order.proofSize < 1024 ? `${order.proofSize} B` : (order.proofSize < 1024 * 1024 ? `${(order.proofSize / 1024).toFixed(1)} KB` : `${(order.proofSize / (1024 * 1024)).toFixed(2)} MB`))
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase shrink-0">Tipo</span>
                    <span className="text-[10px] font-black text-slate-700 uppercase">{order.proofMime || 'imagem'}</span>
                  </div>
                  {order.proofHash && (
                    <button
                      onClick={() => { try { navigator.clipboard?.writeText(order.proofHash || ''); } catch { /* ignore */ } }}
                      className="w-full py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Copy size={12}/> Copiar Hash Completo
                    </button>
                  )}
                </div>
              )}

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
                    {order.paymentMethod !== 'WALLET' && !(proofSrc && proofSrc !== 'PENDENTE_UPLOAD_LOCAL_CACHE') && (
                      <button onClick={() => fileInputRef.current?.click()} disabled={isAttaching} className="py-4 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-amber-100 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                        {isAttaching ? <Loader2 size={18} className="animate-spin"/> : <FileText size={18}/>} Anexar Comprovante
                      </button>
                    )}
                </div>

                {order.status !== OrderStatus.CANCELLED && (
                  <button onClick={() => setShowRefundModal(order)} className="w-full py-4 bg-amber-50 text-amber-600 border border-amber-200 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-amber-100 transition-all">
                      <RefreshCw size={18}/> Estornar Total de Produtos
                  </button>
                )}

                <div className="pt-4 border-t border-slate-200 mt-4">
                    {ehPedidoAguardandoAprovacao ? (
                      <>
                        <button
                          onClick={handleApproveAndFinalize}
                          disabled={isProcessing}
                          className="w-full py-5 bg-emerald-600 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                        >
                          <CheckCircle size={22}/> {isProcessing ? 'PROCESSANDO...' : 'Aprovar e Finalizar Compra'}
                        </button>
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest text-center -mt-1">
                          Aprova o pagamento e finaliza o pedido em um único passo
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setIsRejecting(true)} disabled={isProcessing} className="py-4 bg-red-50 text-red-600 border border-red-200 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-red-600 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                              <XCircle size={22}/> Reprovar
                          </button>
                          <button
                          onClick={handleApprove}
                          disabled={isProcessing}
                          className="py-4 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          <CheckCircle size={22}/> Só Aprovar Pagamento
                        </button>
                        </div>
                      </>
                    ) : order.status === OrderStatus.PAID ? (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button onClick={handlePrepare} disabled={isProcessing} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50">
                                <Box size={22}/> {isProcessing ? 'PROCESSANDO...' : 'Iniciar Separação'}
                            </button>
                            <button onClick={handleDeliver} disabled={isProcessing} className="flex-[1.3] py-4 bg-purple-600 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50">
                                <Truck size={22}/> {isProcessing ? 'PROCESSANDO...' : 'Finalizar Pedido'}
                            </button>
                        </div>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleAttachProof}
            />
        </ModalShell>
  );
};
