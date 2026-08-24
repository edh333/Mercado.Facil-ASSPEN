import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Search, Plus, X, Check, DollarSign, CreditCard,
  RefreshCw, Trash2, Save, CheckCircle, Printer, ShieldAlert,
  Download, AlertTriangle, Filter
} from 'lucide-react';

import { CustomerAccount } from '../../types';
import {
  getCustomerAccounts,
  addCustomerAccount,
  updateCustomerAccount,
  deleteCustomerAccount,
  receiveCustomerPayment
} from '../../utils/customerUtils';
import { formatarMoeda } from '../../utils';
import { getActiveSession } from '../../utils/cashSession';
import { useApp } from '../../context/StoreContext';
import { gerarRelatorioInadimplentes, imprimirCupom } from '../../utils/printUtils';

export function AdminCustomersTab() {
  const { currentUser } = useApp();
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState<Partial<CustomerAccount> | null>(null);
  const [saving, setSaving] = useState(false);

  const [filterType, setFilterType] = useState<'all' | 'debtors' | 'exhausted' | 'blocked'>('all');

  // Payment modal
  const [payModal, setPayModal] = useState<{ customer: CustomerAccount } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const exportCSV = () => {
    const debtors = accounts.filter(a => (a.currentDebt || 0) > 0);
    if (debtors.length === 0) return;
    const headers = 'Nome,CPF,Telefone,Divida,Limite,Status\n';
    const rows = debtors.map(a =>
      `"${a.nome}",${a.cpf || ''},"${a.telefone || ''}",${a.currentDebt || 0},${a.creditLimit || 0},${a.status}`
    ).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'inadimplentes.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await getCustomerAccounts();
      setAccounts(data);
    } catch (e) {
      console.error('Erro ao carregar contas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccounts(); }, []);

  const filtered = useMemo(() => {
    let list = accounts;
    const term = search.toLowerCase().trim();
    if (term) {
      list = list.filter(a =>
        a.nome.toLowerCase().includes(term) ||
        (a.cpf && a.cpf.includes(term)) ||
        (a.telefone && a.telefone.includes(term))
      );
    }
    if (filterType === 'debtors') return list.filter(a => (a.currentDebt || 0) > 0);
    if (filterType === 'exhausted') return list.filter(a => a.creditLimit > 0 && (a.currentDebt || 0) >= a.creditLimit);
    if (filterType === 'blocked') return list.filter(a => a.status === 'blocked');
    return list;
  }, [accounts, search, filterType]);

  const handleSave = async () => {
    if (!editData?.nome?.trim()) return;
    setSaving(true);
    try {
      if (editData.id) {
        await updateCustomerAccount(editData.id, {
          nome: editData.nome?.toUpperCase().trim(),
          cpf: editData.cpf || '',
          telefone: editData.telefone || '',
          creditLimit: Number(editData.creditLimit) || 0,
          status: editData.status || 'active'
        });
      } else {
        await addCustomerAccount({
          nome: editData.nome?.toUpperCase().trim() || '',
          cpf: editData.cpf || '',
          telefone: editData.telefone || '',
          creditLimit: Number(editData.creditLimit) || 0,
          currentDebt: 0,
          weeklySpent: 0,
          status: 'active'
        });
      }
      setShowModal(false);
      setEditData(null);
      await loadAccounts();
    } catch (e) {
      console.error('Erro ao salvar:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta conta permanentemente?')) return;
    try {
      await deleteCustomerAccount(id);
      await loadAccounts();
    } catch (e) {
      console.error('Erro ao excluir:', e);
    }
  };

  const handleReceivePayment = async () => {
    if (!payModal || !payAmount || parseFloat(payAmount) <= 0) return;
    setPaying(true);
    try {
      const session = await getActiveSession(currentUser?.id || '');
      await receiveCustomerPayment(
        payModal.customer.id,
        parseFloat(payAmount),
        session?.id
      );
      setPayModal(null);
      setPayAmount('');
      await loadAccounts();
    } catch (e) {
      console.error('Erro ao receber pagamento:', e);
    } finally {
      setPaying(false);
    }
  };

  const totalOwed = accounts.reduce((s, a) => s + (a.currentDebt || 0), 0);
  const totalCredit = accounts.reduce((s, a) => s + (a.creditLimit || 0), 0);
  const riskPct = totalCredit > 0 ? (totalOwed / totalCredit) * 100 : 0;
  const riskColor = riskPct < 30 ? 'bg-emerald-500' : riskPct < 60 ? 'bg-amber-500' : 'bg-red-500';
  const riskBg = riskPct < 30 ? 'from-emerald-50 to-emerald-100/50 border-emerald-200' : riskPct < 60 ? 'from-amber-50 to-amber-100/50 border-amber-200' : 'from-red-50 to-red-100/50 border-red-200';
  const riskText = riskPct < 30 ? 'text-emerald-700' : riskPct < 60 ? 'text-amber-700' : 'text-red-700';
  const riskHex = riskPct < 30 ? '#059669' : riskPct < 60 ? '#d97706' : '#dc2626';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
          <CreditCard size={24} className="text-emerald-500" /> Contas a Pagar
        </h2>
        <button
          onClick={() => { setEditData({ nome: '', telefone: '', creditLimit: 0, status: 'active' }); setShowModal(true); }}
          className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-600 transition-all active:scale-95 shadow-md"
        >
          <Plus size={18} /> Novo Cliente
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-2xl p-6 border border-red-200 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
            <ShieldAlert size={80} />
          </div>
          <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Margem Total de Risco</p>
          <p className="text-3xl font-black text-red-700">R$ {formatarMoeda(totalCredit)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-2xl p-6 border border-emerald-200 shadow-sm">
          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Custódia em Praça</p>
          <p className="text-3xl font-black text-emerald-700">R$ {formatarMoeda(totalOwed)}</p>
        </div>
        <div className={`bg-gradient-to-br ${riskBg} rounded-2xl p-6 shadow-sm`}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{color: riskHex}}>Exposição ao Risco</p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className={`text-3xl font-black ${riskText}`}>{riskPct.toFixed(1)}%</p>
            </div>
            <svg viewBox="0 0 36 36" className="w-14 h-14 shrink-0">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={riskHex} strokeWidth="3" strokeDasharray={`${Math.min(riskPct, 100)}, 100`} strokeLinecap="round" />
            </svg>
          </div>
          <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${riskColor}`} style={{ width: `${Math.min(riskPct, 100)}%` }} />
          </div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl p-6 border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Clientes Cadastrados</p>
          <p className="text-3xl font-black text-slate-700">{accounts.length}</p>
        </div>
        <div className="flex flex-col gap-2 p-4 rounded-2xl border border-slate-200 bg-white shadow-sm justify-center">
          <button onClick={() => imprimirCupom(gerarRelatorioInadimplentes(accounts))} className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm">
            <Printer size={16} /> Lista de Devedores
          </button>
          <button onClick={exportCSV} className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm">
            <Download size={16} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros Rápidos */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-slate-500" />
        {([
          { key: 'all', label: 'Todos' },
          { key: 'debtors', label: 'Com Dívida' },
          { key: 'exhausted', label: 'Limite Esgotado' },
          { key: 'blocked', label: 'Bloqueados' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setFilterType(f.key)} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 ${filterType === f.key ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-full sm:w-[480px]">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="BUSCAR CLIENTE POR NOME OU CPF..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white border border-slate-200 text-slate-900 font-bold text-sm placeholder:text-slate-500 outline-none focus:border-emerald-500 transition-all shadow-sm uppercase tracking-widest"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-emerald-500" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <CreditCard size={48} className="mx-auto mb-4 text-slate-400" />
          <p className="font-black text-slate-900 text-lg uppercase tracking-tight mb-1">
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          </p>
          <p className="text-slate-500 text-sm">Cadastre clientes para vender no fiado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map(c => {
              const usedPct = c.creditLimit > 0 ? ((c.currentDebt || 0) / c.creditLimit) * 100 : 0;
              const isOverLimit = c.currentDebt >= c.creditLimit && c.creditLimit > 0;
              return (
                <div key={c.id} className={`flex items-center gap-5 p-5 hover:bg-slate-50 transition-all ${c.status === 'blocked' ? 'opacity-50' : ''}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isOverLimit ? 'bg-red-100 text-red-600' : usedPct > 70 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    <Users size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 text-sm truncate">{c.nome}</p>
                      {c.status === 'blocked' && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded uppercase tracking-wider border border-red-200">Bloqueado</span>}
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500">{c.telefone || '—'}</p>
                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      <span className="text-xs font-black text-red-600">
                        Dívida: R$ {formatarMoeda(c.currentDebt || 0)}
                      </span>
                      <span className="text-[10px] text-slate-600 font-semibold">
                        Limite: R$ {formatarMoeda(c.creditLimit || 0)}
                      </span>
                    </div>
                    {c.creditLimit > 0 && (
                      <div className="mt-2 w-full max-w-[200px] h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${isOverLimit ? 'bg-red-500' : usedPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(usedPct, 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setPayModal({ customer: c }); setPayAmount(''); }}
                      disabled={!c.currentDebt || c.currentDebt <= 0}
                      className="px-4 py-2.5 bg-emerald-500 text-white text-xs font-black rounded-xl hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm uppercase tracking-wider"
                    >
                      <DollarSign size={14} className="inline mr-1" /> Receber
                    </button>
                    <button
                      onClick={() => setEditData({ id: c.id, nome: c.nome, cpf: c.cpf, telefone: c.telefone, creditLimit: c.creditLimit, status: c.status })}
                      className="p-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl border border-slate-200 transition-all active:scale-95"
                      title="Editar"
                    >
                      <Save size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-2.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && editData && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">
                {editData.id ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button onClick={() => { setShowModal(false); setEditData(null); }} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nome do Cliente</label>
                <input
                  type="text"
                  value={editData.nome || ''}
                  onChange={e => setEditData({ ...editData, nome: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 font-semibold outline-none focus:border-emerald-500 transition-all"
                  placeholder="NOME COMPLETO"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">CPF</label>
                  <input
                    type="text"
                    value={editData.cpf || ''}
                    onChange={e => setEditData({ ...editData, cpf: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 font-semibold outline-none focus:border-emerald-500 transition-all"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Telefone</label>
                  <input
                    type="text"
                    value={editData.telefone || ''}
                    onChange={e => setEditData({ ...editData, telefone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 font-semibold outline-none focus:border-emerald-500 transition-all"
                    placeholder="(65) 99999-9999"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Limite de Crédito (R$)</label>
                <input
                  type="number"
                  value={editData.creditLimit || 0}
                  onChange={e => setEditData({ ...editData, creditLimit: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 font-black outline-none focus:border-emerald-500 transition-all"
                />
              </div>
              {editData.id && (
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</label>
                  <button
                    onClick={() => setEditData({ ...editData, status: editData.status === 'active' ? 'blocked' : 'active' })}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${editData.status === 'active' ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-red-100 text-red-700 border border-red-300'}`}
                  >
                    {editData.status === 'active' ? 'Ativo' : 'Bloqueado'}
                  </button>
                </div>
              )}
              {editData.id && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Saldo Devedor Atual</p>
                  <p className="text-xl font-black text-red-600">R$ {formatarMoeda(accounts.find(a => a.id === editData.id)?.currentDebt || 0)}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => { setShowModal(false); setEditData(null); }} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !editData.nome?.trim()} className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm shadow-md hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                {editData.id ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-500" /> Receber Pagamento
              </h3>
              <button onClick={() => setPayModal(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cliente</p>
                <p className="font-bold text-slate-900">{payModal.customer.nome}</p>
                <p className="text-[10px] text-slate-500 mt-1">Telefone: {payModal.customer.telefone || '—'}</p>
                <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between">
                  <span className="text-xs font-black text-slate-500 uppercase">Dívida Atual</span>
                  <span className="text-lg font-black text-red-600">R$ {formatarMoeda(payModal.customer.currentDebt || 0)}</span>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Valor Recebido (R$)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-4 py-4 rounded-xl border border-emerald-200 text-slate-900 font-black text-2xl outline-none focus:border-emerald-500 transition-all text-center"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              {payAmount && parseFloat(payAmount) > 0 && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Nova Dívida</p>
                  <p className="text-xl font-black text-emerald-700">
                    R$ {formatarMoeda(Math.max(0, (payModal.customer.currentDebt || 0) - parseFloat(payAmount)))}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setPayModal(null)} className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button
                onClick={handleReceivePayment}
                disabled={paying || !payAmount || parseFloat(payAmount) <= 0}
                className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white font-bold text-sm shadow-md hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {paying ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
