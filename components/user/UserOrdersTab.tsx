import React, { useState } from 'react';
import { Clock, CreditCard, Loader2, FileText, Package, ChevronUp, ChevronDown, Printer, Search, XCircle } from 'lucide-react';
import { Order } from '../../types';
import { formatarMoeda } from '../../utils';
import { toDate } from '../../utils/dateUtils';
import { ConfirmacaoDestrutiva } from '../admin/ConfirmacaoDestrutiva';

interface UserOrdersTabProps {
  settings: any;
  viewingWalletHistory: boolean;
  setViewingWalletHistory: (val: boolean) => void;
  walletTxs: any[];
  loadingOrders: boolean;
  myOrders: Order[];
  expandedOrders: string[];
  toggleOrderDetails: (id: string) => void;
  getStatusLabel: (status: string) => string;
  canViewCupom: (status: string) => boolean;
  setViewingOrderCupom: (order: Order) => void;
  cancelOrder?: (orderId: string) => void;
}

export const UserOrdersTab: React.FC<UserOrdersTabProps> = ({
  settings, viewingWalletHistory, setViewingWalletHistory, walletTxs,
  loadingOrders, myOrders, expandedOrders, toggleOrderDetails,
  getStatusLabel, canViewCupom, setViewingOrderCupom,
  cancelOrder
}) => {
  const [searchOrder, setSearchOrder] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const filteredOrders = (myOrders || []).filter(order => {
    const search = (searchOrder || '').toLowerCase();
    if (!search) return true;
    const orderId = (order.id || '').toLowerCase();
    const date = (toDate(order.createdAt || order.date)?.toLocaleString() || '').toLowerCase();
    const items = (order.items || []).map((i: any) => (i.name || '').toLowerCase()).join(' ');
    return orderId.includes(search) || date.includes(search) || items.includes(search);
  });

  return (
    <div className="p-5 animate-fadeIn pb-24">
      <div className="flex justify-between items-center mb-6">
          <h2 className="font-black text-xl text-white flex items-center gap-2">
              <Clock className="text-white" /> Histórico
          </h2>
          {settings?.enablePrisonerWallet && (
              <button
                  onClick={() => setViewingWalletHistory(!viewingWalletHistory)}
                  className={`text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border-2 transition-all ${viewingWalletHistory ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'border-slate-700 text-slate-400 hover:border-slate-500 bg-slate-800'}`}
              >
                  {viewingWalletHistory ? 'Ver Pedidos' : 'Extrato Carteira'}
              </button>
          )}
      </div>

      {!viewingWalletHistory && (
          <div className="mb-4 relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                  placeholder="Buscar pedido por ID, data ou produto..."
                  value={searchOrder}
                  onChange={e => setSearchOrder(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-slate-800 border-2 border-slate-700 rounded-xl focus:border-white outline-none font-black text-sm text-white placeholder:text-slate-500"
              />
              {searchOrder && (
                  <button onClick={() => setSearchOrder('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <XCircle size={16} />
                  </button>
              )}
          </div>
      )}

      {viewingWalletHistory ? (
          <div className="space-y-4 animate-fadeIn">
              {(walletTxs || []).length === 0 ? (
                  <div className="text-center py-16 opacity-50 bg-slate-800 rounded-3xl border border-dashed border-slate-700">
                      <CreditCard size={48} className="mx-auto mb-2 text-slate-500" />
                      <p className="font-bold text-xs uppercase tracking-widest text-slate-500">Nenhuma movimentação</p>
                  </div>
              ) : (
                  (walletTxs || []).map(tx => (
                      <div key={tx.id} className="bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-700 flex justify-between items-center hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                             <div className={`p-2.5 rounded-xl ${tx.amount > 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                <CreditCard size={18}/>
                             </div>
                             <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preso</p>
                                <p className="font-black text-sm uppercase leading-tight text-white">{tx.inmateName || 'Não identificado'}</p>
                                {tx.userName && (
                                  <p className="text-[10px] font-black mt-1 text-slate-300">Família: {tx.userName}</p>
                                )}
                                <p className="text-[10px] font-black mt-1 text-slate-300">CPF: {tx.userCpf || 'Identificado'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                              <p className={`font-black text-sm ${tx.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {tx.amount > 0 ? '+' : ''} R$ {formatarMoeda(Math.abs(tx.amount))}
                              </p>
                              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-sm ${tx.status === 'approved' ? 'bg-green-900/50 text-green-300' : tx.status === 'pending' ? 'bg-yellow-900/50 text-yellow-300' : 'bg-red-900/50 text-red-300'}`}>
                                  {tx.status === 'approved' ? 'Confirmado' : tx.status === 'pending' ? 'Pendente' : 'Recusado'}
                              </span>
                          </div>
                      </div>
                  ))
              )}
          </div>
      ) : loadingOrders ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-blue-500" size={40} />
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Carregando Pedidos...</p>
          </div>
      ) : (
          <div className="space-y-4">
              {filteredOrders.length === 0 ? (
                  <div className="text-center py-16 opacity-50 bg-slate-800 rounded-3xl border border-dashed border-slate-700">
                      <FileText size={48} className="mx-auto mb-2 text-slate-500" />
                      <p className="font-bold text-xs uppercase tracking-widest text-slate-500">{searchOrder ? 'Nenhum resultado encontrado' : 'Nenhum pedido recente'}</p>
                  </div>
              ) : (
                  filteredOrders.map(order => (
                      <div key={order.id} className="bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-700 relative overflow-hidden hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-4">
                               <div>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pedido #{(order.id || '').slice(0, 6).toUpperCase()}</span>
                                  <p className="font-black text-white text-sm">{toDate(order.createdAt || order.date)?.toLocaleString() || ''}</p>
                               </div>
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                                  (order.status || '').includes('paid') || (order.status || '').includes('pago') ? 'bg-green-900/30 text-green-300 border-green-800' :
                                  (order.status || '').includes('cancel') ? 'bg-red-900/30 text-red-300 border-red-800' :
                                  (order.status || '').includes('deliver') ? 'bg-blue-900/30 text-blue-300 border-blue-800' :
                                  'bg-yellow-900/30 text-yellow-300 border-yellow-800'
                              }`}>
                                  {getStatusLabel(order.status)}
                              </span>
                          </div>

                          <div className="bg-slate-900/50 rounded-2xl p-4 mb-4 border border-slate-700">
                               <div className="flex justify-between text-[10px] mb-1 font-black text-slate-400 uppercase tracking-tighter">
                                   <span>Produtos</span>
                                   <span>Total</span>
                               </div>
                              <div className="flex justify-between items-baseline mb-3">
                                  <span className="font-black text-slate-300 text-base">{(order.items || []).length} itens</span>
                                  <div className="flex flex-col items-end">
                                      {order.paymentMethod === 'WALLET' && (
                                          <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest bg-indigo-900/30 px-1.5 py-0.5 rounded mb-1 animate-pulse border border-indigo-800">Pago com Crédito</span>
                                      )}
                                      <span className="font-black text-white text-lg">R$ {formatarMoeda(Number(order.total) || 0)}</span>
                                  </div>
                              </div>

                              <button
                                  onClick={() => toggleOrderDetails(order.id)}
                                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 text-xs font-black text-slate-400 flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors shadow-sm"
                              >
                                  {expandedOrders.includes(order.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  {expandedOrders.includes(order.id) ? 'OCULTAR ITENS' : `VER ${(order.items || []).length} ITENS COMPRADOS`}
                              </button>

                              {expandedOrders.includes(order.id) && (
                                  <div className="mt-4 pt-4 border-t border-slate-700 animate-slideDown space-y-2.5">
                                      {(order.items || []).map((item: any, i: number) => (
                                          <div key={i} className="border-b border-dotted border-slate-700">
                                              <div className="flex justify-between items-center text-xs py-2">
                                                  <div className="flex items-center gap-3">
                                                      <div className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400">
                                                          <Package size={14} />
                                                      </div>
                                                      <span className="text-slate-300 font-bold line-clamp-1 max-w-[150px]">{item?.name || 'Item'}</span>
                                                  </div>
                                                  <div className="flex gap-3 items-center">
                                                      <span className="font-black bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-300">x{item.quantity}</span>
                                                      <span className="font-black text-white">R$ {formatarMoeda((Number(item.priceAtPurchase) || 0) * (Number(item.quantity) || 0))}</span>
                                                  </div>
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>

                          <div className="flex gap-2">
                              {canViewCupom(order.status) && (
                                  <button
                                      onClick={() => setViewingOrderCupom(order)}
                                      className="flex-1 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl hover:bg-black transition-all transform active:scale-95"
                                  >
                                      <Printer size={18} /> VISUALIZAR CUPOM
                                  </button>
                              )}

                               {/* BOTÃO CANCELAR */}
                               {['pending', 'paid', 'pago', 'prepar'].some(s => (order.status || '').toLowerCase().includes(s)) && cancelOrder && (
                                   <button
                                       onClick={() => setConfirmCancelId(order.id)}
                                       className="py-3 px-4 bg-red-900/30 text-red-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-red-800 hover:bg-red-800/50 transition-colors"
                                   >
                                       Cancelar
                                   </button>
                               )}

                               {/* BOTÃO VER COMPROVANTE */}
                               {order.paymentProofUrl && (
                                   <a
                                       href={order.paymentProofUrl}
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       className="py-3 px-4 bg-blue-900/30 text-blue-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-blue-800 hover:bg-blue-800/50 transition-colors flex items-center gap-2"
                                   >
                                       <FileText size={14} /> Comprovante
                                   </a>
                               )}

                              {/* BOTÃO COMPRAR NOVAMENTE */}
                              <button
                                  onClick={() => {
                                      const event = new CustomEvent('reorder', { detail: order.items });
                                      window.dispatchEvent(event);
                                  }}
                                  className="py-3 px-4 bg-emerald-900/30 text-emerald-400 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-emerald-800 hover:bg-emerald-800/50 transition-colors"
                              >
                                  Comprar Novamente
                              </button>
                          </div>
                      </div>
                  ))
              )}
          </div>
      )}

      <ConfirmacaoDestrutiva
        isOpen={confirmCancelId !== null}
        titulo="Cancelar Pedido"
        descricao="O pedido será cancelado e não poderá ser restaurado. Confirme para continuar."
        palavraChave="CANCELAR"
        onConfirm={() => { if (confirmCancelId && cancelOrder) cancelOrder(confirmCancelId); setConfirmCancelId(null); }}
        onClose={() => setConfirmCancelId(null)}
      />
    </div>
  );
};
