import React from 'react';
import {
  CheckCircle, Ban, Trash2, Lock, Unlock, Save, ShieldCheck, FileText,
  Printer, ExternalLink, CreditCard, ShoppingCart, Users, AlertTriangle,
  Camera, Loader2
} from 'lucide-react';
import { User, Order, WalletTransaction } from '../../types';
import { formatarMoeda } from '../../utils';
import { ModalShell } from '../ui/ModalShell';
import ImagePreviewModal from '../ImagePreviewModal';

interface AdminUserDetailsModalProps {
  user: User;
  orders: Order[];
  walletTx: WalletTransaction[];
  onClose: () => void;
  onSave: (id: string, fields: Partial<User>) => Promise<void>;
  approveUser: (id: string) => void;
  suspendUser: (id: string, val: boolean) => void;
  deleteUser: (id: string) => void;
  toggleUserCredit: (id: string, allow: boolean) => void;
  toggleExcepcionalFlag?: (userId: string, value: boolean) => void;
  onAddCredit?: (user: User) => void;
  canManageCredits?: boolean;
  showNotification: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const isPdfUrl = (url: string) => (url || '').toLowerCase().includes('.pdf') || (url || '').toLowerCase().includes('pdf');

export const AdminUserDetailsModal: React.FC<AdminUserDetailsModalProps> = ({
  user, orders, walletTx, onClose, onSave, approveUser, suspendUser, deleteUser,
  toggleUserCredit, toggleExcepcionalFlag, onAddCredit, canManageCredits = true, showNotification
}) => {
  const [form, setForm] = React.useState<Partial<User>>({});
    const [saving, setSaving] = React.useState(false);
  const [previewDoc, setPreviewDoc] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<'GERAL' | 'HISTORICO' | 'SALDO'>('GERAL');

  React.useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        rg: user.rg || '',
        address: user.address || '',
        relationship: user.relationship || user.kinship || '',
        inmateName: user.inmateName || user.prisonerName || '',
        inmateCpf: user.inmateCpf || user.prisonerCpf || ''
      });
    }
  }, [user]);

  if (!user) return null;

  const userOrders = (orders || []).filter(o => o.userId === user.id || o.userCpf === user.cpf);
  const userTxs = (walletTx || []).filter(tx => tx.userId === user.id || tx.inmateCpf === user.cpf);

  const totalGasto = userOrders.filter(o => !['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'reembolsado'].includes(String(o.status || '').toLowerCase())).reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalDepositos = userTxs.filter(tx => tx.status === 'approved' && tx.type === 'deposit').reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

  const docUrl = user.documentUrl || '';
  const docPendente = docUrl === 'PENDENTE_UPLOAD_LOCAL_CACHE';
  const isPdf = !docPendente && docUrl && isPdfUrl(docUrl);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(user.id, { ...form, relationship: form.relationship, inmateName: form.inmateName, inmateCpf: form.inmateCpf });
      showNotification('Cadastro atualizado com sucesso!', 'success');
    } catch (e: any) {
      showNotification('Erro ao salvar: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const printPdf = () => {
    const win = window.open('', '_blank');
    if (!win) { alert('Popup bloqueado. Permita popups para imprimir o documento.'); return; }
    win.document.write(`<html><head><title>Documento do Familiar</title></head><body style="margin:0"><iframe src="${docUrl}" style="width:100vw;height:100vh;border:0"></iframe></body></html>`);
    win.document.close();
    setTimeout(() => { try { win.focus(); win.print(); } catch (e) { /* noop */ } }, 800);
  };

  const statusBadge =
    user.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    user.status === 'suspended' ? 'bg-red-100 text-red-600 border-red-200' :
    'bg-amber-100 text-amber-700 border-amber-200';

  const statusLabel =
    user.status === 'active' ? 'Ativo' : user.status === 'suspended' ? 'Bloqueado' : 'Pendente de Aprovação';

  const inputCls = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-400 uppercase transition-all";
  const labelCls = "text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5 ml-1";

  return (
    <ModalShell
      open
      onClose={onClose}
      title={user.name || 'Sem nome'}
      subtitle={`CPF: ${user.cpf || '—'} • ID: ${user.id?.slice(0, 8)}`}
      icon={
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg text-white"
          style={{ backgroundColor: user.status === 'active' ? '#10b981' : user.status === 'suspended' ? '#ef4444' : '#f59e0b' }}>
          {(user.name || '?').charAt(0).toUpperCase()}
        </div>
      }
      actions={
        <span className={`text-[9px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest border ${statusBadge}`}>{statusLabel}</span>
      }
      size="lg"
      bodyClassName="p-6"
    >

        {/* Sections Nav */}
        <div className="sticky top-0 z-10 flex bg-slate-100 border-b border-slate-200 p-2 gap-2 shrink-0">
          {([
            { key: 'GERAL', label: 'Dados & Documento', icon: FileText },
            { key: 'SALDO', label: 'Saldo & Créditos', icon: CreditCard },
            { key: 'HISTORICO', label: `Histórico (${userOrders.length + userTxs.length})`, icon: ShoppingCart },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeSection === key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

          {/* ═══ GERAL / DADOS + DOCUMENTO ═══ */}
          {activeSection === 'GERAL' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Form */}
                <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">Dados Cadastrais</h4>
                    {user.status === 'pending' && (
                      <button
                        onClick={() => { if (confirm(`Aprovar cadastro de ${user.name}?`)) { approveUser(user.id); showNotification('Cadastro aprovado!', 'success'); onClose(); } }}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all"
                      >
                        <CheckCircle size={15} /> Aprovar Cadastro
                      </button>
                    )}
                  </div>

                  <div>
                    <label className={labelCls}>Nome Completo</label>
                    <input className={inputCls} value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Telefone</label>
                      <input className={inputCls} value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>E-mail</label>
                      <input className={inputCls} value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>RG</label>
                      <input className={inputCls} value={form.rg || ''} onChange={e => setForm({ ...form, rg: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>Parentesco</label>
                      <input className={inputCls} value={form.relationship || ''} onChange={e => setForm({ ...form, relationship: e.target.value.toUpperCase() })} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Endereço</label>
                    <input className={inputCls} value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Interno Vinculado</label>
                        <input className={inputCls} value={form.inmateName || ''} onChange={e => setForm({ ...form, inmateName: e.target.value.toUpperCase() })} />
                      </div>
                      <div>
                        <label className={labelCls}>CPF do Interno</label>
                        <input className={inputCls} value={form.inmateCpf || ''} onChange={e => setForm({ ...form, inmateCpf: e.target.value.replace(/\D/g, '') })} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 min-w-[160px] py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar Alterações
                    </button>
                    {user.authUid && (
                      <button
                        type="button"
                        disabled
                        className="flex-1 min-w-[160px] py-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 opacity-90"
                      >
                        <Lock size={16} /> Senha: Definida via Auth
                      </button>
                    )}
                  </div>
                </div>

                {/* Documento */}
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4 flex items-center gap-2">
                    <Camera size={15} className="text-emerald-600" /> Documento do Cadastro
                  </h4>

                  {docPendente ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-amber-50 rounded-2xl border border-amber-200">
                      <AlertTriangle size={40} className="text-amber-500 mb-3" />
                      <p className="font-black text-amber-700 uppercase text-sm">Documento pendente de upload</p>
                      <p className="text-[10px] text-amber-600 font-bold mt-1 uppercase tracking-widest">Peça ao familiar que reenvie o anexo</p>
                    </div>
                  ) : docUrl ? (
                    <>
                      {isPdf ? (
                        <div className="flex-1 min-h-[260px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative">
                          <iframe src={`${docUrl}#toolbar=0&navpanes=0&scrollbar=0`} className="w-full h-full min-h-[260px] border-0" title="Documento PDF" />
                        </div>
                      ) : (
                        <div
                          className="flex-1 min-h-[260px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer flex items-center justify-center"
                          onClick={() => setPreviewDoc(true)}
                        >
                          <img src={docUrl} alt="Documento do cadastro" className="w-full h-full object-contain" />
                        </div>
                      )}
                      <div className="flex gap-2 mt-4">
                        {isPdf ? (
                          <button
                            onClick={printPdf}
                            className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all"
                          >
                            <Printer size={15} /> Imprimir
                          </button>
                        ) : (
                          <button
                            onClick={() => setPreviewDoc(true)}
                            className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all"
                          >
                            <FileText size={15} /> Visualizar / Imprimir
                          </button>
                        )}
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-3 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-200 active:scale-95 transition-all"
                        >
                          <ExternalLink size={15} /> Nova Aba
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-100 rounded-2xl border border-slate-200">
                      <FileText size={40} className="text-slate-300 mb-3" />
                      <p className="font-black text-slate-400 uppercase text-sm">Nenhum documento anexado</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ SALDO / CRÉDITOS ═══ */}
          {activeSection === 'SALDO' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Saldo Disponível</p>
                  <h3 className="text-3xl font-black text-emerald-600 tracking-tighter">R$ {formatarMoeda(user.walletBalance || 0)}</h3>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Depositado</p>
                  <h3 className="text-3xl font-black text-blue-600 tracking-tighter">R$ {formatarMoeda(totalDepositos)}</h3>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Gasto</p>
                  <h3 className="text-3xl font-black text-red-600 tracking-tighter">R$ {formatarMoeda(totalGasto)}</h3>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Gasto Semanal</p>
                  <h3 className="text-3xl font-black text-amber-600 tracking-tighter">R$ {formatarMoeda(user.weeklySpent || 0)}</h3>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">Ações de Crédito</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {canManageCredits && onAddCredit && (
                    <button
                      onClick={() => onAddCredit(user)}
                      className="py-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-emerald-100 active:scale-95 transition-all"
                    >
                      <CreditCard size={17} /> Aporte Manual de Saldo
                    </button>
                  )}
                  <button
                    onClick={() => toggleUserCredit(user.id, !(user.allowCredit !== false))}
                    className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border active:scale-95 transition-all ${user.allowCredit !== false ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <ShieldCheck size={17} /> Crédito: {user.allowCredit !== false ? 'LIBERADO' : 'BLOQUEADO'}
                  </button>
                  {toggleExcepcionalFlag && (
                    <button
                      onClick={() => toggleExcepcionalFlag(user.id, !user.autorizacaoExcepcional)}
                      className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 border active:scale-95 transition-all ${user.autorizacaoExcepcional ? 'bg-purple-100 border-purple-300 text-purple-700 hover:bg-purple-200' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-purple-50 hover:text-purple-600'}`}
                    >
                      <AlertTriangle size={17} /> {user.autorizacaoExcepcional ? 'Exceção Semanal ATIVA' : 'Autorização Excepcional'}
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">Status de Acesso</h4>
                <div className="flex flex-wrap gap-3">
                  {user.status !== 'active' && (
                    <button
                      onClick={() => { suspendUser(user.id, false); }}
                      className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:brightness-110 active:scale-95 transition-all"
                    >
                      <Unlock size={17} /> Reativar Acesso
                    </button>
                  )}
                  {user.status !== 'suspended' && (
                    <button
                      onClick={() => { if (confirm(`Bloquear acesso de ${user.name}?`)) suspendUser(user.id, true); }}
                      className="flex-1 py-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-amber-100 active:scale-95 transition-all"
                    >
                      <Ban size={17} /> Suspender Acesso
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm(`EXCLUIR ${user.name}? O histórico será preservado (soft delete).`)) deleteUser(user.id); }}
                    className="flex-1 py-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-red-100 active:scale-95 transition-all"
                  >
                    <Trash2 size={17} /> Excluir (Soft Delete)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ HISTÓRICO ═══ */}
          {activeSection === 'HISTORICO' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pedidos */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
                    <ShoppingCart size={15} className="text-emerald-600" /> Pedidos ({userOrders.length})
                  </h4>
                </div>
                <div className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                  {userOrders.length === 0 ? (
                    <p className="p-10 text-center text-slate-300 font-black uppercase text-xs">Nenhum pedido</p>
                  ) : userOrders.map(o => (
                    <div key={o.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 text-xs uppercase tracking-tight truncate">#{o.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                          {o.date ? new Date(o.date).toLocaleString('pt-BR') : '—'} • {o.items?.reduce((s, i) => s + (i.quantity || 0), 0)} itens
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-black text-slate-900 text-sm">R$ {formatarMoeda(o.total || 0)}</p>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${o.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-200' : o.status === 'delivered' ? 'bg-blue-50 text-blue-600 border-blue-200' : o.status === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transações de Carteira */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 flex items-center gap-2">
                    <CreditCard size={15} className="text-blue-600" /> Aportes & Movimentações ({userTxs.length})
                  </h4>
                </div>
                <div className="max-h-[420px] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                  {userTxs.length === 0 ? (
                    <p className="p-10 text-center text-slate-300 font-black uppercase text-xs">Nenhuma movimentação</p>
                  ) : userTxs.map(tx => (
                    <div key={tx.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 text-xs uppercase tracking-tight truncate">{tx.type}</p>
                        <p className="text-[9px] text-slate-400 font-bold mt-0.5">{tx.createdAt ? new Date(tx.createdAt).toLocaleString('pt-BR') : '—'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-black text-sm ${tx.type === 'withdrawal' ? 'text-red-600' : 'text-emerald-600'}`}>
                          {tx.type === 'withdrawal' ? '−' : '+'} R$ {formatarMoeda(Math.abs(tx.amount || 0))}
                        </p>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${tx.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : tx.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex items-center justify-between gap-3">
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
            <Users size={14} /> Familiar cadastrado em {user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : '—'}
          </p>
          <button onClick={onClose} className="px-8 py-3.5 bg-slate-100 text-slate-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all">
            Fechar
          </button>
        </div>

      {previewDoc && !isPdf && (
        <ImagePreviewModal src={docUrl} alt="Documento do cadastro" onClose={() => setPreviewDoc(false)} />
      )}
    </ModalShell>
  );
};
