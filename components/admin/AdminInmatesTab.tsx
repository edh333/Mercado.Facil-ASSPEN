import React from 'react';
import { formatarMoeda } from '../../utils';
import { Shield, Plus, Trash2, Search, UserCheck, FileUp, LayoutGrid, Smartphone } from 'lucide-react';

interface AdminInmatesTabProps {
  preRegisteredInmates: any[];
  users: any[];
  newInmate: { name: string; cpf: string };
  setNewInmate: (data: any) => void;
  handleAddInmate: () => void;
  deletePreRegisteredInmate: (id: string) => void;
  importInmatesCsv?: (file: File) => Promise<void>;
}

export const AdminInmatesTab: React.FC<AdminInmatesTabProps> = ({
  preRegisteredInmates, users, newInmate, setNewInmate, handleAddInmate, deletePreRegisteredInmate, importInmatesCsv
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [viewMode, setViewMode] = React.useState<'table' | 'cards'>('table');

  const consolidatedData = React.useMemo(() => {
    return (preRegisteredInmates || []).map(inmate => {
        const cpfInmate = String(inmate.cpf || '').replace(/\D/g, '');
        const linkedUsers = (users || []).filter(u =>
            (u.assignedInmate?.id === inmate.id || u.assignedInmate === inmate.id) ||
            (cpfInmate && String(u.inmateCpf || u.prisonerCpf || '').replace(/\D/g, '') === cpfInmate)
        );
        const totalBalance = linkedUsers.reduce((sum, u) => sum + Number(u.walletBalance || 0), 0);
        const totalSpentWeekly = linkedUsers.reduce((sum, u) => sum + Number(u.weeklySpent || 0), 0);
        return { ...inmate, linkedUsers, totalBalance, totalSpentWeekly };
    });
  }, [preRegisteredInmates, users]);

  const filteredInmates = consolidatedData.filter(i =>
    (i.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (i.cpf || '').includes(searchTerm || '')
  ).sort((a,b) => b.totalBalance - a.totalBalance);

  const totalInmates = consolidatedData.length;
  const withFamily = consolidatedData.filter(i => i.linkedUsers.length > 0).length;

  return (
    <div className="animate-slideUp space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
        <h2 className="text-xl font-black text-[var(--text-main)] flex items-center gap-2 uppercase tracking-tight">
          <Shield size={24} className="text-emerald-500"/> Gestão de Internos
        </h2>
        <div className="flex flex-wrap gap-3">
            <label className="text-[10px] font-black uppercase text-indigo-500 border-2 border-indigo-500/20 px-4 py-2 rounded-xl bg-indigo-500/5 shadow-sm cursor-pointer hover:bg-indigo-500/10 transition-all flex items-center gap-2">
                <FileUp size={14}/> Importar CSV
                <input type="file" accept=".csv,.txt" className="hidden" onChange={e => e.target.files?.[0] && importInmatesCsv?.(e.target.files[0])} />
            </label>
            <div className="text-[10px] font-black uppercase text-[var(--text-main)] border-2 border-[var(--border-color)] px-4 py-2 rounded-xl bg-[var(--bg-main)]">
                Total: {totalInmates}
            </div>
            <div className="text-[10px] font-black uppercase text-sky-500 border-2 border-sky-500/20 px-4 py-2 rounded-xl bg-sky-500/5 shadow-sm" title="Internos que já possuem ao menos um familiar com conta cadastrada">
                {withFamily}/{totalInmates} com família ({totalInmates ? Math.round((withFamily / totalInmates) * 100) : 0}%)
            </div>
            <button
                onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
                className="text-[10px] font-black uppercase border-2 border-[var(--border-color)] px-4 py-2 rounded-xl bg-[var(--bg-card)] text-[var(--text-main)] hover:bg-[var(--bg-main)] transition-all flex items-center gap-2"
            >
                {viewMode === 'table' ? <><LayoutGrid size={14} /> Cards</> : <><Smartphone size={14} /> Tabela</>}
            </button>
            <div className="text-[10px] font-black uppercase text-emerald-500 border-2 border-emerald-500/20 px-4 py-2 rounded-xl bg-emerald-500/5 shadow-sm">
                Global: R$ {formatarMoeda(consolidatedData.reduce((s, i) => s + i.totalBalance, 0))}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Registration Form */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
          <div className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl h-fit relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 opacity-5 rounded-full -mr-16 -mt-16"></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text-main)] mb-6 flex items-center gap-2 relative z-10">
                <Plus size={18} className="text-emerald-500"/> Novo Pré-Cadastro
              </h3>
              <div className="space-y-4 relative z-10">
                  <div>
                      <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1">Nome Completo</label>
                      <input
                          className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl font-bold text-sm text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                          placeholder="EX: NOME SOBRENOME"
                          value={newInmate?.name || ''}
                          onChange={e => setNewInmate({...newInmate, name: e.target.value.toUpperCase()})}
                      />
                  </div>
                  <div>
                      <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1">CPF (Apenas Números)</label>
                      <input
                          className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl font-bold text-sm text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                          placeholder="000.000.000-00"
                          value={newInmate?.cpf || ''}
                          onChange={e => setNewInmate({...newInmate, cpf: e.target.value.replace(/\D/g, '')})}
                      />
                  </div>
                  <button
                      onClick={handleAddInmate}
                      className="w-full py-5 bg-emerald-500 text-white font-black rounded-2xl hover:opacity-90 transition-all shadow-xl uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 mt-2"
                  >
                      <UserCheck size={18}/> Salvar no Banco
                  </button>
              </div>
              <p className="mt-6 text-[9px] text-[var(--text-muted)] italic font-medium leading-relaxed">
                Nota: Apenas internos registrados poderão ter familiares vinculados e receber créditos.
              </p>
          </div>
        </div>

        {/* List of Inmates */}
        <div className="lg:col-span-7 xl:col-span-8 bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 bg-[var(--bg-main)] border-b border-[var(--border-color)]">
                <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-[var(--bg-card)] p-2.5 rounded-xl border border-[var(--border-color)] group-focus-within:bg-[var(--text-main)] group-focus-within:border-[var(--text-main)] transition-all duration-300">
                        <Search className="text-[var(--text-muted)] group-focus-within:text-[var(--bg-card)] transition-colors" size={18}/>
                    </div>
                    <input
                        className="w-full bg-[var(--bg-card)] pl-16 pr-6 py-4.5 border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl outline-none font-black text-xs text-[var(--text-main)] transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest"
                        placeholder="PESQUISAR POR NOME OU CPF..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[600px] divide-y divide-slate-200 custom-scrollbar">
                {viewMode === 'table' && (
                    <table className="w-full text-left">
                        <thead className="bg-[var(--bg-main)] text-[var(--text-muted)] font-black uppercase text-[9px] tracking-widest sticky top-0 border-b border-[var(--border-color)]">
                            <tr>
                                <th className="p-5">Nome / CPF</th>
                                <th className="p-5">Familiares</th>
                                <th className="p-5 text-right">Saldo Acumulado</th>
                                <th className="p-5 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {filteredInmates.length === 0 ? (
                                <tr><td colSpan={4} className="p-20 text-center font-black uppercase text-xs opacity-70"><Shield size={40} className="mx-auto mb-4"/> Nenhum Registro</td></tr>
                            ) : filteredInmates.map((inmate: any) => (
                                <tr key={inmate.id} className="hover:bg-[var(--bg-main)]/50 transition-all group">
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="font-black text-[var(--text-main)] text-sm uppercase tracking-tight">{inmate?.name || 'Sem nome'}</div>
                                            <span className="text-[9px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black tracking-widest">{inmate?.cpf || '—'}</span>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <div className="flex items-center gap-3">
                                            <div className="flex -space-x-2">
                                                {inmate.linkedUsers.slice(0, 3).map((u: any) => (
                                                    <div key={u.id} className="w-8 h-8 rounded-full border-2 border-white bg-[var(--bg-main)] flex items-center justify-center overflow-hidden shadow-sm" title={u.name || ''}>
                                                        <span className="text-[10px] font-black text-[var(--text-muted)]">{(u.name || '?').charAt(0)}</span>
                                                    </div>
                                                ))}
                                                {inmate.linkedUsers && inmate.linkedUsers.length > 3 && (
                                                    <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-slate-800 text-[10px] font-black shadow-sm">
                                                        +{inmate.linkedUsers.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-tight">{inmate.linkedUsers.length} Familiar(es)</div>
                                        </div>
                                    </td>
                                    <td className={`p-5 text-right font-black text-base tracking-tighter ${inmate.totalBalance > 0 ? 'text-emerald-600' : 'text-[var(--text-muted)] opacity-30'}`}>
                                        R$ {formatarMoeda(inmate.totalBalance)}
                                    </td>
                                    <td className="p-5 text-center">
                                        <button
                                            onClick={() => { if(confirm(`REMOVER DEFINITIVAMENTE ${inmate?.name || 'este preso'}?`)) deletePreRegisteredInmate(inmate?.id); }}
                                            className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                                        >
                                            <Trash2 size={18}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {viewMode === 'cards' && (
                    <>
                {filteredInmates.length === 0 ? (
                    <div className="p-20 text-center opacity-10">
                        <Shield size={48} className="mx-auto mb-2"/>
                        <p className="text-xs font-black uppercase tracking-widest">Nenhum Registro</p>
                    </div>
                ) : filteredInmates.map((inmate: any) => (
                    <div key={inmate.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-[var(--bg-main)] transition-all group border-l-4 border-transparent hover:border-emerald-500">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1.5">
                                <p className="font-black text-[var(--text-main)] text-sm uppercase tracking-tight truncate">{inmate?.name || 'Sem nome'}</p>
                                <span className="text-[9px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-black tracking-widest shrink-0">{inmate?.cpf || '—'}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-2">
                                <div className="flex -space-x-2">
                                    {inmate.linkedUsers.slice(0, 3).map((u: any) => (
                                        <div key={u.id} className="w-8 h-8 rounded-full border-2 border-white bg-[var(--bg-main)] flex items-center justify-center overflow-hidden shadow-sm" title={u.name || ''}>
                                            <span className="text-[10px] font-black text-[var(--text-muted)]">{(u.name || '?').charAt(0)}</span>
                                        </div>
                                    ))}
                                    {inmate.linkedUsers && inmate.linkedUsers.length > 3 && (
                                        <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-slate-800 text-[10px] font-black shadow-sm">
                                            +{inmate.linkedUsers.length - 3}
                                        </div>
                                    )}
                                </div>
                                <div className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-tight">
                                    {inmate.linkedUsers.length} Familiar(es)
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-8 w-full md:w-auto border-t md:border-t-0 border-[var(--border-color)] pt-4 md:pt-0 mt-2 md:mt-0">
                            <div className="flex-1 md:text-right">
                                <p className="text-[9px] font-black text-[var(--text-muted)] uppercase leading-none mb-1 tracking-widest">Saldo Acumulado</p>
                                <p className={`font-black text-xl tracking-tighter ${inmate.totalBalance > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)] opacity-30'}`}>
                                    R$ {formatarMoeda(inmate.totalBalance)}
                                </p>
                            </div>
                            <button
                                onClick={() => { if(confirm(`REMOVER DEFINITIVAMENTE ${inmate?.name || 'este preso'}?`)) deletePreRegisteredInmate(inmate?.id); }}
                                className="p-3 bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/5 rounded-xl transition-all shadow-sm active:scale-95"
                            >
                                <Trash2 size={18}/>
                            </button>
                        </div>
                    </div>
                ))}
                    </>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
