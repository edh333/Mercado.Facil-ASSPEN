import React from 'react';
import { Users, PlusCircle, Trash2, Search, UserPlus, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface Inmate {
  id: string;
  name: string;
  cpf: string;
}

interface AdminInmateManagementProps {
  newInmate: { name: string; cpf: string; };
  setNewInmate: (data: any) => void;
  handleAddInmate: () => void;
  preRegisteredInmates: Inmate[];
  deletePreRegisteredInmate: (id: string) => void;
}

export const AdminInmateManagement: React.FC<AdminInmateManagementProps> = ({
  newInmate, setNewInmate, handleAddInmate,
  preRegisteredInmates, deletePreRegisteredInmate
}) => {
  const { colors } = useTheme();
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredInmates = React.useMemo(() => {
    const termo = (searchTerm || '').toLowerCase();
    return (preRegisteredInmates || [])
      .sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [preRegisteredInmates, searchTerm]);

  return (
    <div className="bg-[var(--bg-card)] p-8 rounded-[3rem] border border-[var(--border-color)] shadow-2xl space-y-8 animate-fadeIn">
      <div className="flex items-center gap-4 border-b border-[var(--border-color)] pb-6">
          <div className="p-4 bg-orange-500/10 text-orange-600 rounded-[2rem] shadow-sm"><Users size={28}/></div>
          <div>
              <h3 className="text-xl font-black uppercase tracking-tighter text-[var(--text-main)]">Base de Custodiados</h3>
              <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1">Pré-cadastro para validação de compras</p>
          </div>
      </div>

      {/* Registration Form */}
      <div className="bg-[var(--bg-main)] p-8 rounded-[2.5rem] border-2 border-[var(--border-color)] shadow-inner">
        <h4 className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-6 flex items-center gap-2">
            <UserPlus size={16}/> Novo Registro no Sistema
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest ml-1">Nome Oficial (SISDEP)</label>
            <input
                className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-orange-500 rounded-2xl font-black text-sm text-[var(--text-main)] uppercase tracking-tight outline-none transition-all"
                value={newInmate?.name || ''}
                onChange={e => setNewInmate({...newInmate, name: e.target.value.toUpperCase()})}
                placeholder="EX: JOÃO DA SILVA SAURO"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest ml-1">Documento CPF</label>
            <input
                className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-orange-500 rounded-2xl font-black text-sm text-[var(--text-main)] outline-none transition-all font-mono"
                value={newInmate?.cpf || ''}
                onChange={e => setNewInmate({...newInmate, cpf: e.target.value})}
                placeholder="000.000.000-00"
            />
          </div>
        </div>
        <button onClick={handleAddInmate} className="w-full bg-orange-600 text-white p-5 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-orange-600/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-3">
            <PlusCircle size={20}/> Efetivar Pré-cadastro
        </button>
      </div>

      {/* List Header & Search */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
            <p className="text-[10px] font-black uppercase text-[var(--text-muted)] tracking-widest">Registros Atuais: {(preRegisteredInmates || []).length}</p>
            <div className="flex items-center bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl px-3 py-1.5 shadow-sm">
                <Search size={14} className="text-[var(--text-muted)] mr-2"/>
                <input
                    className="bg-transparent border-none outline-none text-[10px] font-black uppercase text-[var(--text-main)] w-32 md:w-48"
                    placeholder="PESQUISAR BASE..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-3 pr-4 custom-scrollbar">
            {filteredInmates.length === 0 ? (
                <div className="text-center py-12 opacity-10">
                    <Users size={48} className="mx-auto mb-4"/>
                    <p className="font-black uppercase tracking-[0.3em] text-[10px]">Nenhum interno localizado</p>
                </div>
            ) : (
                filteredInmates.map(inmate => (
                    <div key={inmate.id} className="flex justify-between items-center p-5 bg-[var(--bg-card)] rounded-[2rem] border border-[var(--border-color)] hover:border-orange-500/50 hover:shadow-xl transition-all group">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-[var(--bg-main)] rounded-2xl text-[var(--text-muted)] group-hover:text-orange-600 transition-colors">
                                <ShieldCheck size={20}/>
                            </div>
                            <div>
                                <p className="font-black text-xs text-[var(--text-main)] uppercase tracking-tight leading-none mb-1">{inmate?.name || 'Preso'}</p>
                                <p className="text-[10px] font-black text-[var(--text-muted)] font-mono">CPF: {inmate?.cpf || '—'}</p>
                            </div>
                        </div>
                        <button onClick={() => { if(confirm(`EXCLUIR DEFINITIVAMENTE ${inmate?.name || 'este preso'}?`)) deletePreRegisteredInmate(inmate?.id); }} className="p-3 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/5 rounded-xl transition-all active:scale-90">
                            <Trash2 size={20}/>
                        </button>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
};
