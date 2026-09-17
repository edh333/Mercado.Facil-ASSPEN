import React from 'react';
import {
  Users, Search, Eye, EyeOff, FileText, MinusCircle, CheckCircle, Ban, Trash2, RefreshCw,
  PlusCircle, ShieldCheck, CheckSquare, Square, Link2, BarChart2, Download, Lock, Unlock,
  MoreVertical
} from 'lucide-react';
import { formatarMoeda, isAdminRole } from '../../utils';
import { getLocalDateStr } from './adminUtils';
import { User, Order } from '../../types';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';

interface AdminUsersTabProps {
  users: User[];
  orders?: Order[];
  userSearch: string;
  setUserSearch: (val: string) => void;
  showPasswords: boolean;
  setShowPasswords: (val: boolean) => void;
  setViewingUser: (user: User) => void;
  setShowWithdrawalModal: (data: any) => void;
  approveUser: (id: string) => void;
  suspendUser: (id: string, val: boolean) => void;
  toggleUserCredit: (id: string, allow: boolean) => void;
  deleteUser: (id: string) => void;
  onAddCredit: (user: User) => void;
  canManageCredits?: boolean;
  toggleExcepcionalFlag?: (userId: string, value: boolean) => void;
  usersLimit?: number;
  loadMoreUsers?: () => void;
  loadAllUsers?: () => void;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  users, orders = [], userSearch, setUserSearch, showPasswords, setShowPasswords,
  setViewingUser, setShowWithdrawalModal, approveUser, suspendUser, toggleUserCredit, deleteUser,
  onAddCredit, canManageCredits = true, toggleExcepcionalFlag,
  usersLimit = 500, loadMoreUsers, loadAllUsers
}) => {
  const [mainTab, setMainTab] = React.useState<'CARDS' | 'VINCULOS'>('VINCULOS');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | 'PENDING' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [selectedUsers, setSelectedUsers] = React.useState<Set<string>>(new Set());

  // Busca client-side exige TODOS os usuários no stream: quando o admin
  // digita, expande a carga para cobrir o cadastro inteiro (escala 1.500+).
  React.useEffect(() => {
    if ((userSearch || '').trim().length >= 2 && loadAllUsers) loadAllUsers();
    if (loadMoreUsers && (users || []).length >= usersLimit - 1) loadMoreUsers();
  }, [userSearch, usersLimit]);
  const [showBulkActions, setShowBulkActions] = React.useState(false);
  const [openDropdown, setOpenDropdown] = React.useState<string | null>(null);
  const [confirmAction, setConfirmAction] = React.useState<null | {
    tipo: 'suspender' | 'excluir' | 'bulkSuspender';
    userId?: string;
    nome?: string;
    saldo?: number;
    bulkCount?: number;
  }>(null);

  const executarConfirmacao = () => {
    if (!confirmAction) return;
    const { tipo, userId, bulkCount } = confirmAction;
    if (tipo === 'suspender' && userId) suspendUser(userId, true);
    else if (tipo === 'excluir' && userId) deleteUser(userId);
    else if (tipo === 'bulkSuspender') {
      for (const uid of selectedUsers) suspendUser(uid, true);
      setSelectedUsers(new Set());
      setShowBulkActions(false);
    }
    setConfirmAction(null);
  };

  const filteredUsers = React.useMemo(() => {
    const termo = (userSearch || '').toLowerCase();
    return (users || []).filter(u => {
      const notAdmin = !isAdminRole(u.role);
      const matchSearch = (u.name || '').toLowerCase().includes(termo) ||
                         (u.cpf || '').includes(userSearch || '') ||
                         (u.inmateName || '').toLowerCase().includes(termo);
      const matchStatus = statusFilter === 'ALL' ||
                         (statusFilter === 'PENDING' && u.status === 'pending') ||
                         (statusFilter === 'ACTIVE' && u.status === 'active') ||
                         (statusFilter === 'SUSPENDED' && u.status === 'suspended');
      return notAdmin && matchSearch && matchStatus;
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [users, userSearch, statusFilter]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) newSet.delete(userId);
      else newSet.add(userId);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredUsers.length) setSelectedUsers(new Set());
    else setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
  };

  const handleBulkApprove = async () => {
    for (const userId of selectedUsers) await approveUser(userId);
    setSelectedUsers(new Set()); setShowBulkActions(false);
  };
  const handleBulkSuspend = async () => {
    setConfirmAction({ tipo: 'bulkSuspender', bulkCount: selectedUsers.size });
  };
  const handleBulkCredit = async () => {
    for (const userId of selectedUsers) await toggleUserCredit(userId, true);
    setSelectedUsers(new Set()); setShowBulkActions(false);
  };

  // ─── Extrato: gerar download JSON com histórico completo do usuário ───
  const downloadUserReport = (u: User) => {
    const userOrders = (orders || []).filter(o => o.userCpf === u.cpf || o.userId === u.id);
    const report = {
      usuario: { id: u.id, nome: u.name, cpf: u.cpf, email: u.email, status: u.status, saldo: u.walletBalance || 0 },
      interno_vinculado: { nome: u.inmateName || '—', cpf: u.inmateCpf || '—' },
      total_compras: userOrders.length,
      valor_total_gasto: userOrders.reduce((s, o) => s + (o.total || 0), 0),
      historico_pedidos: userOrders.map(o => ({
        id: o.id,
        data: o.date || o.createdAt,
        total: o.total,
        status: o.status,
        pagamento: o.paymentMethod,
        itens: (o.items || []).map((i: any) => ({ nome: i.name, qtd: i.quantity, valor: i.priceAtPurchase }))
      })),
      exportado_em: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `extrato_${(u.name || 'usuario').replace(/ /g,'_')}_${getLocalDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const statusBadge = (status: string) =>
    status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    status === 'suspended' ? 'bg-red-100 text-red-600 border-red-200' :
    'bg-amber-100 text-amber-700 border-amber-200';

  // Lista de Presença: cada familiar com CPF, interno vinculado e saldo,
  // com coluna de assinatura para impressão física.
  const printPresenceList = () => {
    const items = (users || []).filter(u => !isAdminRole(u.role))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (items.length === 0) return;
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const hoje = new Date().toLocaleDateString('pt-BR');
    const totalizado = items.reduce((s, u) => s + Number(u.walletBalance || 0), 0);
    const rows = items.map((u, idx) => {
      const saldo = Number(u.walletBalance || 0);
      const st = u.status === 'active' ? 'Ativo' : u.status === 'suspended' ? 'Bloqueado' : 'Pendente';
      return `<tr>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;font-weight:700;color:#94a3b8;">${idx + 1}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:800;text-transform:uppercase;">${esc(u.name)}<div style="font-size:9px;color:#64748b;font-weight:700;letter-spacing:1px;">CPF ${esc(u.cpf || '—')}</div></td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:700;text-transform:uppercase;">${esc(u.inmateName || 'GERAL / CDP')}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:11px;font-weight:800;color:${saldo > 0 ? '#059669' : '#0f172a'};">R$ ${formatarMoeda(saldo)}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;color:${st === 'Ativo' ? '#059669' : st === 'Bloqueado' ? '#dc2626' : '#d97706'};">${st}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;"></td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Lista de Presença - Familiares</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; color:#0f172a; padding:32px; background:#fff; }
    .cabecalho { border-bottom:3px solid #0f766e; padding-bottom:14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-end; }
    .cabecalho h1 { font-size:18px; text-transform:uppercase; letter-spacing:1px; color:#0f766e; }
    .cabecalho p { font-size:11px; color:#64748b; margin-top:3px; }
    .meta { text-align:right; font-size:11px; color:#64748b; }
    .cards { display:flex; gap:12px; margin-bottom:18px; }
    .card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 14px; }
    .card .titulo { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:3px; }
    .card .valor { font-size:16px; font-weight:800; }
    table { width:100%; border-collapse:collapse; }
    thead th { background:#0f172a; color:#fff; padding:9px; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; }
    .rodape { margin-top:16px; text-align:center; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
    @media print { @page { size: A4; margin: 14mm 12mm; } body { padding:14px; } }
</style>
</head>
<body>
    <div class="cabecalho">
        <div>
            <h1>Lista de Presença — Familiares</h1>
            <p>Mercado Fácil — saldos de crédito e vinculação</p>
        </div>
        <div class="meta">
            <p>Emitido em: <b>${hoje}</b></p>
            <p>${items.length} familiares</p>
        </div>
    </div>
    <div class="cards">
        <div class="card"><p class="titulo">Familiares</p><p class="valor">${items.length}</p></div>
        <div class="card"><p class="titulo">Com Saldo</p><p class="valor">${items.filter(u => Number(u.walletBalance || 0) > 0).length}</p></div>
        <div class="card"><p class="titulo">Saldo Total</p><p class="valor" style="color:#059669">R$ ${formatarMoeda(totalizado)}</p></div>
    </div>
    <table>
        <thead><tr><th style="text-align:center;width:40px;">Nº</th><th>Familiar</th><th>Interno Vinculado</th><th style="text-align:right;">Saldo</th><th style="text-align:center;">Status</th><th style="width:140px;">Assinatura</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:34px;display:flex;justify-content:space-between;">
        <div style="width:40%;border-top:1px solid #64748b;padding-top:8px;font-size:10px;text-transform:uppercase;text-align:center;color:#475569;">Responsável / Carimbo</div>
    </div>
    <p class="rodape">Documento gerado pelo sistema Mercado Fácil</p>
</body>
</html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      // print() síncrono logo após document.write() imprime PÁGINA EM BRANCO
      // no Chromium (snapshot antes de o layout terminar). O atraso curto
      // espera a renderização sem abrir diálogo duplicado.
      setTimeout(() => { try { printWindow.print(); } catch { /* janela fechou */ } }, 350);
    }
  };

  return (
    <div className="animate-slideUp space-y-6 pb-20">

      {/* ─── Main Tab Toggle ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
          <Users size={24} className="text-emerald-500" /> Gestão de Usuários
        </h2>
        <div className="flex bg-slate-100 rounded-2xl p-1 border border-slate-200">
          <button
            onClick={() => setMainTab('CARDS')}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mainTab === 'CARDS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Users size={14} /> Cadastros
          </button>
          <button
            onClick={() => setMainTab('VINCULOS')}
            className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${mainTab === 'VINCULOS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Link2 size={14} /> Vínculos Prisionais
          </button>
        </div>
        {mainTab === 'CARDS' && (
          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200 w-full md:w-auto overflow-x-auto custom-scrollbar">
            {(['ALL','PENDING','ACTIVE','SUSPENDED'] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === f ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}>
                {f === 'ALL' ? 'Tudo' : f === 'PENDING' ? 'Pendentes' : f === 'ACTIVE' ? 'Ativos' : 'Bloqueados'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Search ─── */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-white p-2.5 rounded-2xl border border-slate-200 group-focus-within:bg-slate-900 group-focus-within:border-slate-900 transition-all duration-300 z-10 shadow-sm">
            <Search className="text-slate-400 group-focus-within:text-white transition-colors" size={20} />
          </div>
          <input
            className="w-full pl-16 pr-6 py-4 bg-white border-2 border-slate-200 focus:border-emerald-500 rounded-[2.5rem] outline-none font-black text-xs text-slate-900 transition-all placeholder:text-slate-400 uppercase tracking-widest shadow-sm"
            placeholder="PESQUISAR FAMILIAR OU INTERNO..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
          />
        </div>
        {mainTab === 'CARDS' && (
          <>
            <button onClick={() => setShowPasswords(!showPasswords)} className={`px-8 py-4 rounded-[2.5rem] border-2 transition-all flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest shadow-sm ${showPasswords ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
              {showPasswords ? <><EyeOff size={18}/> Ocultar</> : <><Eye size={18}/> Senhas</>}
            </button>
            <button onClick={() => setShowBulkActions(!showBulkActions)} className={`px-6 py-4 rounded-[2.5rem] border-2 transition-all flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest shadow-sm ${showBulkActions ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
              <CheckSquare size={18}/> {showBulkActions ? 'Cancelar' : 'Selecionar'}
            </button>
            <button onClick={printPresenceList} title="Gerar Lista de Presença com saldos para impressão" className="px-6 py-4 rounded-[2.5rem] border-2 border-teal-600/30 bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white hover:border-teal-600 transition-all flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest shadow-sm">
              <FileText size={18}/> Lista de Presença
            </button>
          </>
        )}
      </div>

      {/* ─── VINCULOS TAB ─── */}
      {mainTab === 'VINCULOS' && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 text-sm">
              <Link2 size={18} className="text-emerald-500"/> Cruzamento Familiar ↔ Interno
            </h3>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">
              {filteredUsers.length} vínculo(s) encontrado(s)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                <tr>
                  <th className="p-5 text-left">Familiar / Comprador</th>
                  <th className="p-5 text-left">Interno Vinculado</th>
                  <th className="p-5 text-center">Status</th>
                  <th className="p-5 text-right">Saldo</th>
                  <th className="p-5 text-center">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr><td colSpan={5} className="p-16 text-center text-slate-300 font-black uppercase tracking-widest text-xs">Nenhum usuário encontrado.</td></tr>
                ) : filteredUsers.map(u => (
                  <tr key={u.id} onClick={() => setViewingUser(u)} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                    <td className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white text-sm flex-shrink-0"
                          style={{ backgroundColor: u.status === 'active' ? '#10b981' : u.status === 'suspended' ? '#ef4444' : '#f59e0b' }}>
                          {(u.name || '?').charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 uppercase tracking-tight text-sm truncate max-w-[180px]">{u.name || '—'}</p>
                          <p className="text-[9px] text-slate-400 font-mono">{u.cpf || '—'}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 truncate max-w-[200px]">
                            {[u.relationship || u.kinship, u.phone && 'Tel: ' + u.phone, u.rg && 'RG: ' + u.rg].filter(Boolean).join(' • ') || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={14} className="text-slate-400 flex-shrink-0" />
                        <div>
                          <p className="font-black text-slate-900 uppercase tracking-tight text-sm truncate max-w-[180px]">{u.inmateName || '—'}</p>
                          <p className="text-[9px] text-slate-400 font-mono">{u.inmateCpf || '—'}</p>
                          {u.address ? (
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 truncate max-w-[200px]">{u.address}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusBadge(u.status || '')}`}>
                        {u.status === 'active' ? 'Ativo' : u.status === 'suspended' ? 'Bloqueado' : 'Pendente'}
                      </span>
                    </td>
                    <td className="p-5 text-right font-black text-slate-900">
                      R$ {formatarMoeda(u.walletBalance || 0)}
                    </td>
                    <td className="p-5">
                      <div className="flex items-center justify-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {/* Editar */}
                        <button
                          onClick={() => setViewingUser(u)}
                          className="p-2.5 bg-slate-100 text-slate-600 hover:bg-emerald-500 hover:text-white rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all"
                          title="Editar Cadastro"
                        >
                          <FileText size={16} />
                        </button>
                        {/* Extrato */}
                        <button
                          onClick={() => downloadUserReport(u)}
                          className="p-2.5 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl border border-blue-200 shadow-sm active:scale-95 transition-all"
                          title="Baixar Extrato JSON"
                        >
                          <Download size={16} />
                        </button>
                        {/* Depósito / Aporte */}
                        {canManageCredits && (
                          <button
                            onClick={() => onAddCredit(u)}
                            className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl border border-emerald-200 shadow-sm active:scale-95 transition-all"
                            title="Aporte Manual de Saldo"
                          >
                            <PlusCircle size={16} />
                          </button>
                        )}
                        {/* Suspender / Reativar */}
                        {u.status !== 'suspended' ? (
                          <button
                            onClick={() => setConfirmAction({ tipo: 'suspender', userId: u.id, nome: u.name })}
                            className="p-2.5 bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl border border-amber-200 shadow-sm active:scale-95 transition-all"
                            title="Suspender Acesso"
                          >
                            <Lock size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => suspendUser(u.id, false)}
                            className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl border border-emerald-200 shadow-sm active:scale-95 transition-all"
                            title="Reativar Acesso"
                          >
                            <Unlock size={16} />
                          </button>
                        )}
                        {/* Autorização Excepcional */}
                        {toggleExcepcionalFlag && (
                          <button
                            onClick={() => toggleExcepcionalFlag(u.id, !u.autorizacaoExcepcional)}
                            className={`p-2.5 rounded-xl border shadow-sm active:scale-95 transition-all ${u.autorizacaoExcepcional ? 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200' : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-purple-50 hover:text-purple-500'}`}
                            title={u.autorizacaoExcepcional ? 'Exceção ativa - clique para remover' : 'Permitir ultrapassar limite semanal'}
                          >
                            <CheckSquare size={16} />
                          </button>
                        )}
                        {/* Soft Delete */}
                        <button
                          onClick={() => setConfirmAction({ tipo: 'excluir', userId: u.id, nome: u.name, saldo: Number(u?.walletBalance || 0) })}
                          className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                          title="Excluir (desativar conta)"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── CARDS TAB ─── */}
      {mainTab === 'CARDS' && (
        <>
          {/* Bulk Actions Bar */}
          {selectedUsers.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900 rounded-2xl text-white animate-slideDown">
              <span className="font-black text-sm uppercase tracking-wide">{selectedUsers.size} selecionado(s)</span>
              <div className="flex-1" />
              <button onClick={handleBulkApprove} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-black text-xs uppercase flex items-center gap-2"><CheckCircle size={16}/> Aprovar</button>
              <button onClick={handleBulkCredit} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-xl font-black text-xs uppercase flex items-center gap-2"><PlusCircle size={16}/> Creditar</button>
              <button onClick={handleBulkSuspend} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 rounded-xl font-black text-xs uppercase flex items-center gap-2"><Ban size={16}/> Bloquear</button>
              <button onClick={() => { setSelectedUsers(new Set()); setShowBulkActions(false); }} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-black text-xs uppercase">Limpar</button>
            </div>
          )}

          {showBulkActions && filteredUsers.length > 0 && (
            <button onClick={toggleSelectAll} className="text-xs font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-wide flex items-center gap-2">
              <CheckSquare size={16}/> {selectedUsers.size === filteredUsers.length ? 'Desmarcar Tudo' : 'Selecionar Todos'}
            </button>
          )}

          {/* User Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredUsers.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-4 border-dashed border-slate-200 text-slate-300">
                <Users size={64} className="mx-auto mb-4"/>
                <p className="font-black uppercase tracking-[0.2em]">Nenhum familiar encontrado</p>
              </div>
            ) : filteredUsers.map(u => (
              <div key={u.id} onClick={() => setViewingUser(u)} className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 hover:shadow-xl transition-all group relative overflow-visible cursor-pointer ${showBulkActions && selectedUsers.has(u.id) ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'}`}>
                <div className={`absolute top-0 right-0 w-24 h-24 blur-[50px] -mr-12 -mt-12 opacity-5 ${u.status === 'active' ? 'bg-emerald-500' : u.status === 'suspended' ? 'bg-red-500' : 'bg-amber-500'}`} />

                <div className="flex items-start gap-5 relative z-10">
                  {showBulkActions && (
                    <button onClick={(e) => { e.stopPropagation(); toggleUserSelection(u.id); }} className="flex-shrink-0 p-2 rounded-xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all">
                      {selectedUsers.has(u.id) ? <CheckCircle className="text-emerald-500" size={24}/> : <Square className="text-slate-400" size={24}/>}
                    </button>
                  )}
                  <div className="w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-2xl text-white shadow-lg flex-shrink-0 group-hover:rotate-6 transition-transform duration-500"
                    style={{ backgroundColor: u.status === 'active' ? '#10b981' : u.status === 'suspended' ? '#ef4444' : '#f59e0b' }}>
                    {(u.name || '?').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-black text-base text-slate-900 uppercase tracking-tight truncate">{u?.name || 'Sem nome'}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border ${statusBadge(u.status || '')}`}>{({ active: 'Ativo', pending: 'Pendente', suspended: 'Suspenso' } as any)[u.status] || u.status}</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight truncate">CPF: {u?.cpf || '—'} • Tel: {u?.phone || '—'}</p>
                    {u?.address ? (
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight truncate mt-0.5">{u.address}</p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full border border-slate-200 text-slate-500 text-[9px] font-black uppercase tracking-tighter">
                        <ShieldCheck size={12}/> {u?.inmateName || '—'}
                      </div>
                      {u?.relationship || u?.kinship ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 rounded-full border border-indigo-200 text-indigo-600 text-[9px] font-black uppercase tracking-tighter">
                          <Users size={12}/> {u.relationship || u.kinship}
                        </div>
                      ) : null}
                      {u?.rg ? (
                        <div className="px-3 py-1 bg-slate-50 rounded-full border border-slate-200 text-slate-500 text-[9px] font-black uppercase tracking-tighter">
                          RG: {u.rg}
                        </div>
                      ) : null}
                      <div className="px-3 py-1 bg-emerald-50 rounded-full border border-emerald-200 text-emerald-700 text-[10px] font-bold tracking-tighter">
                        SALDO: R$ {formatarMoeda(u.walletBalance || 0)}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); toggleUserCredit(u.id, !(u.allowCredit !== false)); }} className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-tighter border transition-all ${u.allowCredit !== false ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60'}`}>
                        CRÉDITO: {u.allowCredit !== false ? 'LIBERADO' : 'BLOQUEADO'}
                      </button>
                    </div>

                    {showPasswords && (
                      <div className="mt-3 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl inline-flex items-center gap-2">
                        <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Senha PDV:</span>
                        <span className="text-xs font-black text-amber-700">{u.authUid ? 'Definida' : 'Não definida'}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-5 border-t border-slate-100 relative z-10">
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setViewingUser(u)} className="p-3 bg-slate-100 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all" title="Ver Documentação"><FileText size={18}/></button>
                    <button onClick={() => downloadUserReport(u)} className="p-3 bg-blue-50 text-blue-500 hover:bg-blue-600 hover:text-white rounded-xl border border-blue-200 shadow-sm active:scale-95 transition-all" title="Extrato JSON"><BarChart2 size={18}/></button>
                    {/* Dropdown com mais ações */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === u.id ? null : u.id)}
                        className="p-3 bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-all"
                        title="Mais Ações"
                      >
                        <MoreVertical size={18}/>
                      </button>
                      {openDropdown === u.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                          <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 min-w-[200px] animate-scaleIn origin-top-right">
                            {canManageCredits && (
                              <button onClick={() => { onAddCredit(u); setOpenDropdown(null); }} className="w-full flex items-center gap-3 px-5 py-3 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 text-xs font-black uppercase tracking-widest transition-all"><PlusCircle size={16}/> Aporte Manual</button>
                            )}
                            <button onClick={() => { setShowWithdrawalModal({ userId: u?.id || '', userName: u?.name || '', isRefund: true }); setOpenDropdown(null); }} className="w-full flex items-center gap-3 px-5 py-3 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 text-xs font-black uppercase tracking-widest transition-all"><RefreshCw size={16}/> Estornar</button>
                            <button onClick={() => { setShowWithdrawalModal({ userId: u?.id || '', userName: u?.name || '' }); setOpenDropdown(null); }} className="w-full flex items-center gap-3 px-5 py-3 text-slate-700 hover:bg-orange-50 hover:text-orange-600 text-xs font-black uppercase tracking-widest transition-all"><MinusCircle size={16}/> Retirada Manual</button>
                            {toggleExcepcionalFlag && (
                              <button onClick={() => { toggleExcepcionalFlag(u.id, !u.autorizacaoExcepcional); setOpenDropdown(null); }} className={`w-full flex items-center gap-3 px-5 py-3 text-xs font-black uppercase tracking-widest transition-all ${u.autorizacaoExcepcional ? 'text-purple-700 hover:bg-purple-50' : 'text-slate-700 hover:bg-purple-50 hover:text-purple-600'}`}><CheckSquare size={16}/> {u.autorizacaoExcepcional ? 'Remover Exceção' : 'Autorização Excepcional'}</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {u.status === 'pending' && (
                      <button onClick={() => approveUser(u.id)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all">
                        <CheckCircle size={16}/> Aprovar
                      </button>
                    )}
                    {u.status !== 'suspended' ? (
                      <button onClick={() => suspendUser(u.id, true)} className="bg-red-500 text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all">
                        <Ban size={16}/> Bloquear
                      </button>
                    ) : (
                      <button onClick={() => suspendUser(u.id, false)} className="px-5 py-2.5 bg-slate-100 text-slate-900 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">
                        Desbloquear
                      </button>
                    )}
                    <button onClick={() => setConfirmAction({ tipo: 'excluir', userId: u?.id, nome: u?.name, saldo: Number(u?.walletBalance || 0) })} className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95">
                      <Trash2 size={20}/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <ConfirmacaoDestrutiva
        isOpen={confirmAction !== null}
        titulo={confirmAction?.tipo === 'excluir' ? 'Excluir Usuário' : 'Bloquear Acesso'}
        descricao={
          confirmAction?.tipo === 'excluir'
            ? (confirmAction.saldo && confirmAction.saldo > 0
                ? `EXCLUIR ${confirmAction.nome || 'este usuário'}? Ele(a) tem R$ ${confirmAction.saldo.toFixed(2).replace('.', ',')} de crédito em carteira — o saldo ficará retido (não é possível sacar após a exclusão).`
                : `EXCLUIR ${confirmAction.nome || 'este usuário'}? O histórico será preservado.`)
            : confirmAction?.tipo === 'bulkSuspender'
                ? `Bloquear o acesso de ${confirmAction.bulkCount} usuário(s)? A ação pode ser revertida depois (Desbloquear).`
                : `Bloquear o acesso de ${confirmAction?.nome || 'este usuário'}? A ação pode ser revertida depois (Desbloquear).`
        }
        palavraChave={confirmAction?.tipo === 'excluir' ? 'EXCLUIR' : 'BLOQUEAR'}
        onConfirm={executarConfirmacao}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
};
