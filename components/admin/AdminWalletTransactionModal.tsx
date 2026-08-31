import React from 'react';
import { Printer, CheckCircle, XCircle, User, UserCheck, DollarSign, ImageIcon, ArrowRight, Activity, FileText, Loader2 } from 'lucide-react';
import { WalletTransaction } from '../../types';
import { formatarMoeda, mascararCpf } from '../../utils';
import { ModalShell } from '../ui/ModalShell';
import { NotaPromissoriaA4 } from '../NotaPromissoriaA4';
import ImagePreviewModal from '../ImagePreviewModal';
import { useApp } from '../../context/StoreContext';

const ComprovanteImg: React.FC<{ src: string }> = ({ src }) => {
  const [erro, setErro] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  React.useEffect(() => {
    setErro(false);
  }, [src]);

  if (erro) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-50/95 rounded-2xl border border-amber-200 p-4 z-10">
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
        className="w-full h-full cursor-zoom-in transition-transform duration-700 group-hover:scale-110 relative"
        onClick={() => setPreviewOpen(true)}
      >
        <img
          src={src}
          className="w-full h-full object-contain"
          alt="Comprovante PIX"
          onError={() => setErro(true)}
        />
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-full backdrop-blur-sm pointer-events-none flex items-center gap-1.5 shadow-xl whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line><polyline points="14 21 3 21 3 12"></polyline><line x1="3" y1="3" x2="9" y2="9"></line></svg>
          Ampliar e Imprimir
        </div>
      </div>
      {previewOpen && (
        <ImagePreviewModal src={src} alt="Comprovante PIX" onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
};

interface AdminWalletTransactionModalProps {
  transaction: WalletTransaction;
  onClose: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  appName: string;
}

export const AdminWalletTransactionModal: React.FC<AdminWalletTransactionModalProps> = ({
  transaction, onClose, onApprove, onReject, appName
}) => {
  const [isApproving, setIsApproving] = React.useState(false);
  const [isRejecting, setIsRejecting] = React.useState(false);
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  const [showNotaPromissoria, setShowNotaPromissoria] = React.useState(false);
  const [proofLocal, setProofLocal] = React.useState('');
  const [isAttaching, setIsAttaching] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { attachAdminProof, showNotification: notifCtx } = useApp();
  const proofSrc = proofLocal || transaction.proofUrl || '';

  const handleAttachProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsAttaching(true);
    try {
      const url = await attachAdminProof('wallet_transactions', transaction.id, transaction.userId, file);
      setProofLocal(url);
      notifCtx('Comprovante anexado ao depósito com sucesso!', 'success');
    } catch (err: any) {
      notifCtx('Erro ao anexar comprovante: ' + (err?.message || 'tente novamente'), 'error');
    } finally {
      setIsAttaching(false);
    }
  };

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleApprove = async () => {
    if (isApproving) return;
    if (!window.confirm('CONFIRMAR RECEBIMENTO?\nO saldo será creditado imediatamente na conta do interno.')) return;
    setIsApproving(true);
    try {
      await onApprove(transaction.id);
      onClose();
    } catch (e: any) {
      // Falha ao mover dinheiro NÃO fecha o modal: o admin precisa ver o erro.
      console.error('Erro ao aprovar:', e);
      window.alert('Erro ao aprovar: ' + (e?.message || 'falha desconhecida') + '\nO modal permanecerá aberto. Tente novamente.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (isRejecting) return;
    if (!window.confirm('REJEITAR CRÉDITO?\nEsta ação impedirá que o valor seja creditado.')) return;
    setIsRejecting(true);
    try {
      await onReject(transaction.id);
      onClose();
    } catch (e: any) {
      console.error('Erro ao rejeitar:', e);
      window.alert('Erro ao rejeitar: ' + (e?.message || 'falha desconhecida') + '\nO modal permanecerá aberto. Tente novamente.');
    } finally {
      setIsRejecting(false);
    }
  };

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      alert('Não foi possível abrir a impressão.');
      iframe.remove();
      return;
    }

    const content = `
      <html>
        <head>
          <title>Comprovante de Crédito - ${appName}</title>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #0f172a; background: #fff; }
            .header { text-align: center; border-bottom: 3px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; }
            .content { line-height: 1.8; }
            .row { display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
            .label { font-weight: 900; text-transform: uppercase; font-size: 10px; color: #64748b; letter-spacing: 0.1em; }
            .value { font-weight: 800; font-size: 14px; color: #0f172a; }
            .footer { margin-top: 60px; text-align: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; text-transform: uppercase; letter-spacing: 0.2em; }
            .amount { font-size: 28px; color: #059669; font-weight: 900; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin:0; letter-spacing:-0.05em; text-transform: uppercase;">${appName}</h1>
            <p style="margin:5px 0 0; font-size:10px; font-weight:900; letter-spacing:0.3em; color:#64748b;">COMPROVANTE DE DEPÓSITO PIX</p>
          </div>
          <div class="content">
            <div class="row"><span class="label">Protocolo:</span> <span class="value">#${transaction.id.toUpperCase()}</span></div>
            <div class="row"><span class="label">Data/Hora:</span> <span class="value">${new Date(transaction.createdAt || new Date().toISOString()).toLocaleString('pt-BR')}</span></div>
            <div class="row"><span class="label">Pagador Origem:</span> <span class="value">${transaction.payerName || 'FAMILIAR / VISITANTE'}</span></div>
            <div class="row"><span class="label">Interno Destino:</span> <span class="value">${transaction.inmateName || 'N/A'}</span></div>
            <div class="row"><span class="label">Prontuário/CPF:</span> <span class="value">${mascararCpf(transaction.inmateCpf) || '---'}</span></div>
            <div class="row" style="margin-top: 30px; border-bottom: 4px solid #059669; padding-bottom: 15px;">
                <span class="label" style="align-self: center;">VALOR CREDITADO:</span>
                <span class="amount">R$ ${formatarMoeda(transaction.amount)}</span>
            </div>
          </div>
          <div class="footer">
            <p>AUTENTICAÇÃO DIGITAL DO SISTEMA MERCADO FÁCIL</p>
            <p>Gerado em: ${new Date().toLocaleString()}</p>
          </div>
        </body>
      </html>
    `;

    doc.open();
    doc.write(content);
    doc.close();
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      alert('Falha ao imprimir. Tente novamente ou use outro navegador.');
    } finally {
      setTimeout(() => iframe.remove(), 1000);
    }
  };

  if (showNotaPromissoria) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    return (
      <NotaPromissoriaA4
        data={{
          devedorNome: transaction.inmateName || transaction.payerName || 'NOME NÃO INFORMADO',
          devedorCpf: transaction.inmateCpf || '000.000.000-00',
          valor: Math.abs(transaction.amount || 0),
          dataEmissao: transaction.createdAt || new Date().toISOString(),
          dataVencimento: dueDate.toISOString(),
          protocolo: transaction.id || 'XXXX',
          instituicao: appName,
        }}
        onClose={() => setShowNotaPromissoria(false)}
      />
    );
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Auditoria de Crédito"
      subtitle="Validação de Fluxo de Caixa"
      icon={<DollarSign size={22} />}
      size="lg"
      bodyClassName="p-8 lg:p-12"
      footer={
        <div className="w-full flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identificador Interno</span>
            <span className="text-[10px] font-mono text-slate-600 font-black uppercase tracking-tight">#{transaction.id.toUpperCase()}</span>
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Gestão Profissional v1.0</p>
        </div>
      }
    >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

            {/* Transaction Data */}
            <div className="lg:col-span-7 space-y-8">
              <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] text-slate-900 group-hover:rotate-12 transition-transform duration-700"></div>

                <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] mb-8 flex items-center gap-2">
                    <Activity size={16}/> Mapa da Operação
                </h4>

                <div className="space-y-8 relative z-10">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Origem do Recurso</span>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-xl text-slate-500"><User size={16}/></div>
                            <span className="font-black text-slate-900 text-sm uppercase tracking-tight truncate">{transaction.payerName || 'FAMILIAR / VISITANTE'}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Destino (Interno)</span>
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><UserCheck size={16}/></div>
                            <span className="font-black text-slate-900 text-sm uppercase tracking-tight truncate">{transaction.inmateName || 'N/A'}</span>
                        </div>
                        <p className="text-[10px] font-black text-slate-500 mt-1.5 ml-11 uppercase">CPF: {transaction.inmateCpf || '---'}</p>
                      </div>
                  </div>

                  <div className="flex items-center gap-4 py-4">
                    <div className="h-px flex-1 bg-slate-200"></div>
                    <div className="p-2 bg-slate-100 rounded-full text-slate-600"><ArrowRight size={14}/></div>
                    <div className="h-px flex-1 bg-slate-200"></div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-end gap-6">
                    <div>
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Montante Solicitado</span>
                        <p className="text-5xl font-black text-emerald-600 tracking-tighter">
                            <span className="text-xl opacity-30 mr-1">R$</span>
                            {transaction.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Status do Protocolo</span>
                        <p className={`text-[10px] font-black uppercase px-4 py-1.5 rounded-full border shadow-sm ${transaction.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse'}`}>
                            {transaction.status === 'approved' ? 'Auditado e Aprovado' : 'Aguardando Conferência'}
                        </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Suite */}
              <div className="space-y-4 pt-4">
                {isOffline && (
                    <div className="p-4 bg-amber-500/10 border-l-4 border-amber-500 rounded-r-2xl">
                        <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest flex items-center gap-2">
                            <Activity size={14} className="animate-pulse"/> Atenção: Modo Offline
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1 font-bold">
                            As validações feitas agora serão salvas localmente e sincronizadas quando a internet voltar. Não feche o aplicativo.
                        </p>
                    </div>
                )}
                {transaction.status === 'pending' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        onClick={handleReject}
                        disabled={isApproving || isRejecting}
                        className="py-5 bg-red-50 text-red-600 border-2 border-red-200 rounded-3xl font-black text-[11px] uppercase tracking-widest hover:bg-red-100 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 touch-target"
                      >
                        <XCircle size={20}/> {isRejecting ? 'REJEITANDO...' : 'Recusar Depósito'}
                      </button>
                      <button
                        onClick={handleApprove}
                        disabled={isApproving || isRejecting}
                        className="py-5 bg-emerald-600 text-white rounded-3xl font-black text-[11px] uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 touch-target"
                      >
                        <CheckCircle size={20}/> {isApproving ? 'PROCESSANDO...' : 'Validar e Creditar'}
                      </button>
                    </div>
                )}

                <button
                    onClick={handlePrint}
                    className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-[11px] uppercase tracking-[0.2em] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                    <Printer size={20}/> Emitir Comprovante de Operação
                </button>

                <button
                    onClick={() => setShowNotaPromissoria(true)}
                    className="w-full py-5 bg-white border-2 border-slate-300 text-slate-700 rounded-3xl font-black text-[11px] uppercase tracking-[0.2em] hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                    <FileText size={20}/> Emitir Nota Promissória
                </button>
              </div>
            </div>

            {/* Proof View */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em] flex items-center gap-2 pl-4">
                  <ImageIcon size={16}/> Evidência de Depósito
              </h4>
              <div className="flex-1 min-h-[400px] bg-white p-4 rounded-[3rem] border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden shadow-2xl group relative">
                {proofSrc && proofSrc !== 'PENDENTE_UPLOAD_LOCAL_CACHE' ? (
                  (proofSrc).toLowerCase().includes('.pdf') || (proofSrc).toLowerCase().includes('pdf') ? (
                    <div className="w-full h-full relative">
                      <iframe
                        src={`${proofSrc}#toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full border-0"
                        title="Document Preview"
                      />
                      <div className="absolute bottom-4 right-4 bg-red-600 text-white text-[10px] px-3 py-1.5 rounded-xl font-black shadow-2xl uppercase tracking-widest animate-pulse">Preview PDF</div>
                    </div>
                  ) : (
                    <ComprovanteImg src={proofSrc} />
                  )
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
                      className="mt-6 px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-50 mx-auto"
                    >
                      {isAttaching ? <Loader2 size={16} className="animate-spin"/> : <FileText size={16}/>} Anexar Comprovante (Admin)
                    </button>
                  </div>
                ) : (
                  <div className="text-center opacity-70">
                    <ImageIcon size={80} className="mx-auto mb-4"/>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em]">Nenhuma evidência anexada</p>
                  </div>
                )}

                {proofSrc && proofSrc !== 'PENDENTE_UPLOAD_LOCAL_CACHE' && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                         <span className="bg-white text-black px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl">Clique para Expandir</span>
                    </div>
                )}
              </div>
              {proofSrc && proofSrc !== 'PENDENTE_UPLOAD_LOCAL_CACHE' && (
                <p className="text-[9px] text-center font-black text-slate-500 uppercase tracking-widest animate-pulse opacity-60">
                    A auditoria visual é obrigatória antes da validação
                </p>
              )}
              {!proofSrc || proofSrc === 'PENDENTE_UPLOAD_LOCAL_CACHE' ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAttaching}
                  className="w-full py-4 bg-amber-50 border-2 border-amber-200 text-amber-600 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-amber-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isAttaching ? <Loader2 size={16} className="animate-spin"/> : <FileText size={16}/>} Anexar Comprovante (Admin)
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleAttachProof}
              />
            </div>
          </div>
    </ModalShell>
  );
};
