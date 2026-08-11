import React from 'react';
import {
  Settings, KeyRound, Database, HardDrive, Download, AlertTriangle,
  Trash2, RefreshCw, Smartphone, Palette, Shield, Lock, Save, DollarSign, Check,
  FileText, CreditCard, Building, Info, Printer, Wrench, Truck, ShoppingBag, Search, Loader2, Zap, Users,
  History, RotateCcw, Upload, Archive
} from 'lucide-react';
import { ThemeOption } from '../../types';
import {
  PontoRestauracao, criarPontoRestauracao, listarPontosRestauracao, restaurarPontoRestauracao,
  excluirPontoRestauracao, baixarPontoRestauracao, baixarBackupLocal, importarPontoRestauracao,
  aplicarChavesLocal, formatarDataPonto
} from '../../utils/backupUtils';

interface AdminSettingsTabProps {
  isMaster: boolean;
  isAuthenticated?: boolean;
  onAuthenticate?: () => void;
  newAdminPassword: string;
  setNewAdminPassword: (val: string) => void;
  confirmAdminPassword: string;
  setConfirmAdminPassword: (val: string) => void;
  handleChangeAdminPassword: () => void;
  handleProtectedAction: (action: () => void, type?: string) => void;
  clearOldData: () => void;
  backupSystem: () => void;
  resetStock: () => void;
  resetFinance: () => void;
  resetSystem: (confirm: boolean) => void;
  handleDownloadSource: () => void;
  handleBuildExe: () => void;
  showNotification?: (msg: string, type?: string) => void;

  settings: any;
  updateSettings: (val: any) => Promise<void> | void;
  defineMasterPassword?: (password: string) => Promise<boolean>;
  users: any[];
  deleteUser: (uid: string) => void;
  createAdminUser: (data: any) => void;
  // Optional legacy props forwarded by AdminDashboard
  activateSystem?: (key: string) => Promise<{ success: boolean; message: string }>;
  generateActivationKey?: (days: number) => Promise<string>;
  // PWA Install
  isInstallable?: boolean;
  installApp?: () => Promise<void>;
}

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({
  isMaster, isAuthenticated, onAuthenticate,
  newAdminPassword, setNewAdminPassword, confirmAdminPassword, setConfirmAdminPassword, handleChangeAdminPassword,
  handleProtectedAction, clearOldData, backupSystem, resetStock, resetFinance, updateSettings, settings, resetSystem,
  users, deleteUser, createAdminUser, handleDownloadSource, handleBuildExe, showNotification,
  isInstallable, installApp, defineMasterPassword
}) => {
  const [activeSubTab, setActiveSubTab] = React.useState('general');
  const [newPixKey, setNewPixKey] = React.useState('');
  const [showAddAdmin, setShowAddAdmin] = React.useState(false);
  const [adminForm, setAdminForm] = React.useState({
    name: '', email: '', password: '', cpf: '',
    permissions: ['orders', 'products', 'sales']
  });

  // Local copy for batch-save pattern
  const [localSettings, setLocalSettings] = React.useState<any>(settings || {});
  const [isSaving, setIsSaving] = React.useState(false);
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [secondaryPassword, setSecondaryPassword] = React.useState('');
  const [confirmSecondaryPassword, setConfirmSecondaryPassword] = React.useState('');
  const [isSavingSecondaryPass, setIsSavingSecondaryPass] = React.useState(false);

  // ── Ponto de Restauração ──
  const [pontosRestauracao, setPontosRestauracao] = React.useState<PontoRestauracao[]>([]);
  const [restoreTarget, setRestoreTarget] = React.useState<PontoRestauracao | null>(null);
  const fileInputRestoreRef = React.useRef<HTMLInputElement>(null);

  const refreshPontos = () => setPontosRestauracao(listarPontosRestauracao());

  React.useEffect(() => {
    refreshPontos();
  }, []);

  const handleCriarPonto = () => {
    criarPontoRestauracao(`Manual — ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
    refreshPontos();
    showNotification?.('Ponto de restauração criado com sucesso!', 'success');
  };

  const handleRestaurarPonto = (ponto: PontoRestauracao) => {
    handleProtectedAction(() => {
      const res = restaurarPontoRestauracao(ponto.id);
      if (res.ok) {
        showNotification?.('Sistema restaurado! Recarregando...', 'success');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showNotification?.(res.error || 'Erro ao restaurar o ponto.', 'error');
      }
    }, 'restore');
  };

  const handleImportarRestauracao = async (file: File) => {
    const res = await importarPontoRestauracao(file);
    if (!res.ok) {
      showNotification?.(res.error || 'Arquivo inválido.', 'error');
      return;
    }
    handleProtectedAction(() => {
      aplicarChavesLocal(res.keys || {});
      showNotification?.('Backup importado! Recarregando...', 'success');
      setTimeout(() => window.location.reload(), 1200);
    }, 'restore');
  };

  const handleSaveSecondaryPassword = async () => {
    const pwd = secondaryPassword.trim();
    const confirm = confirmSecondaryPassword.trim();
    if (!pwd || pwd.length < 4) {
      showNotification?.('A senha secundária deve ter pelo menos 4 caracteres.', 'error');
      return;
    }
    if (pwd !== confirm) {
      showNotification?.('As senhas não coincidem.', 'error');
      return;
    }
    setIsSavingSecondaryPass(true);
    try {
      if (defineMasterPassword) {
        const ok = await defineMasterPassword(pwd);
        if (!ok) throw new Error('Falha ao salvar no servidor');
      } else {
        await updateSettings({ ...localSettings, ...(settings || {}), secondaryPassword: pwd });
      }
      setSecondaryPassword('');
      setConfirmSecondaryPassword('');
      showNotification?.('Senha secundária configurada com sucesso!', 'success');
    } catch {
      showNotification?.('Erro ao salvar senha secundária.', 'error');
    } finally {
      setIsSavingSecondaryPass(false);
    }
  };

  React.useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await updateSettings(localSettings);
      showNotification?.('Configurações salvas com sucesso!', 'success');
    } catch {
      showNotification?.('Erro ao salvar configurações.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    const newPwd = newAdminPassword.trim();
    const confirmPwd = confirmAdminPassword.trim();
    if (!newPwd || newPwd.length < 4) {
      showNotification?.('A nova senha deve ter pelo menos 4 caracteres.', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showNotification?.('As senhas não coincidem. Verifique e tente novamente.', 'error');
      return;
    }
    setIsChangingPassword(true);
    try {
      await handleChangeAdminPassword();
    } finally {
      setIsChangingPassword(false);
    }
  };

  const SubTabButton = ({ id, label, icon: Icon }: { id: string; label: string; icon: React.ElementType }) => (
    <button
      onClick={() => {
        if (id === 'maintenance') {
          handleProtectedAction(() => setActiveSubTab(id));
        } else {
          setActiveSubTab(id);
        }
      }}
      className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
        activeSubTab === id
          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30'
          : 'bg-white/10 text-slate-300 hover:bg-white/20 border border-white/10'
      }`}
    >
      <Icon size={16} className="shrink-0" /> {label}
      {id === 'maintenance' && <Lock size={12} className="ml-1 opacity-70 shrink-0" />}
    </button>
  );

  if (isAuthenticated === false) {
    return (
      <div className="animate-fadeIn flex flex-col items-center justify-center min-h-[60vh] pb-32">
        <div className="bg-white p-16 rounded-[3rem] border border-slate-100 shadow-2xl text-center max-w-lg w-full">
          <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
            <Lock size={48} className="text-slate-400" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-3">Acesso Restrito</h3>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-10 leading-relaxed">
            Esta área contém configurações sensíveis do sistema.<br />
            Autentique-se como administrador para continuar.
          </p>
          <button
            onClick={onAuthenticate}
            className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <Shield size={20} /> Acessar Painel de Controle
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-8 pb-32">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6 md:p-8 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/20 rounded-full blur-[100px]"></div>
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-[100px]"></div>
        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
          <div className="max-w-full overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 shrink-0">
                <Settings size={28} />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tight">
                  Painel de Configurações
                </h2>
                <p className="text-[9px] md:text-[10px] text-slate-400 font-black mt-1 uppercase tracking-widest">
                  Gestão Profissional ASSPEN • v1.0.0 RC
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-white/10 text-emerald-300 font-black text-[9px] uppercase tracking-widest flex items-center gap-2 border border-white/10">
              <Shield size={12} /> {isMaster ? 'ACESSO MASTER' : 'ACESSO ADMIN'}
            </span>
            <span className="px-3 py-1.5 rounded-lg bg-white/10 text-white font-black text-[9px] uppercase tracking-widest flex items-center gap-2 border border-white/10">
              <Check size={12} className="text-emerald-400" /> ALTERAÇÕES EM TEMPO REAL
            </span>
          </div>
        </div>
        <div className="relative flex gap-2 w-full overflow-x-auto pb-1 pt-6 no-scrollbar scroll-smooth">
          <SubTabButton id="general" label="Geral" icon={Building} />
          <SubTabButton id="finance" label="Financeiro" icon={CreditCard} />
          <SubTabButton id="receipts" label="Impressão" icon={Printer} />
          <SubTabButton id="appearance" label="Aparência" icon={Palette} />
          <SubTabButton id="updates" label="Atualização" icon={Zap} />
          <SubTabButton id="maintenance" label="Manutenção" icon={Wrench} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">

        {/* ── GERAL ── */}
        {activeSubTab === 'general' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-slideUp">
            {/* Identidade Visual */}
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <Info size={20} className="text-blue-500" /> Identidade Visual
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">Nome do Sistema</label>
                  <input
                    className="w-full p-4 bg-slate-50 border-2 border-slate-200 focus:border-blue-500 rounded-2xl font-black text-sm text-slate-900 outline-none transition-all"
                    value={localSettings?.appName || ''}
                    onChange={e => setLocalSettings({ ...localSettings, appName: e.target.value, systemName: e.target.value })}
                    placeholder="Ex: Mercado Fácil PDV"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">Nome da Instituição</label>
                  <textarea
                    className="w-full p-4 bg-slate-50 border-2 border-slate-200 focus:border-blue-500 rounded-2xl font-black text-sm text-slate-900 outline-none transition-all min-h-[5rem] resize-none"
                    rows={2}
                    value={localSettings?.institutionName || ''}
                    onChange={e => setLocalSettings({ ...localSettings, institutionName: e.target.value })}
                    placeholder="Ex: SECRETARIA DE ADMINISTRAÇÃO PENITENCIÁRIA"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">CNPJ</label>
                    <input
                      className="w-full p-4 bg-slate-50 border-2 border-slate-200 focus:border-blue-500 rounded-2xl font-black text-sm text-slate-900 outline-none"
                      value={localSettings?.cnpj || ''}
                      onChange={e => setLocalSettings({ ...localSettings, cnpj: e.target.value })}
                      placeholder="00.000.000/0000-00"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">Telefone</label>
                    <input
                      className="w-full p-4 bg-slate-50 border-2 border-slate-200 focus:border-blue-500 rounded-2xl font-black text-sm text-slate-900 outline-none"
                      value={localSettings?.contactPhone || ''}
                      onChange={e => setLocalSettings({ ...localSettings, contactPhone: e.target.value })}
                      placeholder="(99) 99999-9999"
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={isSaving}
                className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                ) : (
                  <><Save size={16} /> Salvar Configurações</>
                )}
              </button>
            </div>

            <div className="space-y-8">
              {isInstallable && (
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-3xl shadow-2xl flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                      <Smartphone size={28} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-white font-black text-sm uppercase tracking-wider">Instalar Programa</h4>
                      <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mt-0.5">Disponível para PC e Celular</p>
                    </div>
                  </div>
                  <button
                    onClick={installApp}
                    className="flex items-center gap-2 bg-white hover:bg-blue-50 text-blue-700 font-black px-6 py-3 rounded-xl text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
                  >
                    <Download size={18} /> BAIXAR E INSTALAR PROGRAMA NO COMPUTADOR / CELULAR
                  </button>
                </div>
              )}
              {/* Gestão de Admins */}
              {isMaster && (
                <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                      <Shield size={20} className="text-indigo-600" /> Admins
                    </h3>
                    <button
                      onClick={() => setShowAddAdmin(!showAddAdmin)}
                      className={`text-[10px] font-black uppercase px-4 py-2 rounded-xl ${showAddAdmin ? 'bg-slate-900 text-white' : 'bg-indigo-600 text-white'}`}
                    >
                      {showAddAdmin ? 'FECHAR' : 'NOVO'}
                    </button>
                  </div>
                  {showAddAdmin && (
                    <div className="mb-6 p-6 bg-slate-50 rounded-2xl space-y-4">
                      <input className="w-full p-3 text-xs border bg-white rounded-xl font-black text-slate-900" placeholder="NOME" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value.toUpperCase() })} />
                      <input className="w-full p-3 text-xs border bg-white rounded-xl font-black text-slate-900" placeholder="EMAIL" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} />
                      <input className="w-full p-3 text-xs border bg-white rounded-xl font-black text-slate-900" placeholder="SENHA" type="password" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} />
                      <button
                        onClick={() => {
                          if (adminForm.name && adminForm.email && adminForm.password) {
                            createAdminUser(adminForm);
                            setShowAddAdmin(false);
                            setAdminForm({ name: '', email: '', password: '', cpf: '', permissions: ['orders', 'products', 'sales'] });
                          }
                        }}
                        className="w-full bg-slate-900 text-white p-3 rounded-xl text-xs font-black uppercase"
                      >
                        CRIAR
                      </button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {(users || []).filter(u => u.role === 'ADMIN' && u.id !== 'master').map(admin => (
                      <div key={admin.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                        <div>
                          <p className="font-black text-xs">{admin.name}</p>
                          <p className="text-[10px] text-slate-500">{admin.email}</p>
                        </div>
                        <button onClick={() => { if (confirm('REMOVER?')) deleteUser(admin.id); }} className="text-red-500 p-2">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {(users || []).filter(u => u.role === 'ADMIN' && u.id !== 'master').length === 0 && (
                      <p className="text-[10px] text-slate-400 font-black uppercase text-center py-4">Nenhum administrador extra cadastrado</p>
                    )}
                  </div>
                </div>
              )}

              {/* Credenciais Master */}
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-6 flex items-center gap-2">
                  <KeyRound size={20} className="text-blue-500" /> Segurança Master
                </h3>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-700 uppercase mb-1 block">Nova Senha</label>
                    <input
                      className="w-full p-4 bg-white border-2 border-slate-200 focus:border-blue-500 rounded-2xl font-black text-sm text-slate-900 outline-none transition-all"
                      type="password"
                      value={newAdminPassword}
                      onChange={e => setNewAdminPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-700 uppercase mb-1 block">Confirmar Nova Senha</label>
                    <input
                      className={`w-full p-4 bg-white border-2 rounded-2xl font-black text-sm text-slate-900 outline-none transition-all ${
                        confirmAdminPassword && confirmAdminPassword.trim() !== newAdminPassword.trim()
                          ? 'border-red-400 focus:border-red-500'
                          : 'border-slate-200 focus:border-blue-500'
                      }`}
                      type="password"
                      value={confirmAdminPassword}
                      onChange={e => setConfirmAdminPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    {confirmAdminPassword && confirmAdminPassword.trim() !== newAdminPassword.trim() && (
                      <p className="text-[10px] text-red-500 font-black mt-1 uppercase">As senhas não coincidem</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handlePasswordChange}
                  disabled={isChangingPassword || !newAdminPassword.trim() || newAdminPassword.trim() !== confirmAdminPassword.trim()}
                  className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isChangingPassword ? (
                    <><Loader2 size={16} className="animate-spin" /> Atualizando...</>
                  ) : (
                    <><KeyRound size={16} /> Atualizar Senha</>
                  )}
                </button>
              </div>

              {/* Senha Secundária (ações sensíveis) */}
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-1 flex items-center gap-2">
                  <Lock size={20} className="text-amber-500" /> Senha Secundária
                </h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-6">
                  Exigida em ações sensíveis (zerar financeiro, redefinir estoque, acessar manutenção). Se não definida, as ações ficam bloqueadas até configurar.
                </p>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-700 uppercase mb-1 block">Nova Senha Secundária</label>
                    <input
                      className="w-full p-4 bg-white border-2 border-slate-200 focus:border-amber-500 rounded-2xl font-black text-sm text-slate-900 outline-none transition-all"
                      type="password"
                      value={secondaryPassword}
                      onChange={e => setSecondaryPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-700 uppercase mb-1 block">Confirmar Senha Secundária</label>
                    <input
                      className={`w-full p-4 bg-white border-2 rounded-2xl font-black text-sm text-slate-900 outline-none transition-all ${
                        confirmSecondaryPassword && confirmSecondaryPassword.trim() !== secondaryPassword.trim()
                          ? 'border-red-400 focus:border-red-500'
                          : 'border-slate-200 focus:border-amber-500'
                      }`}
                      type="password"
                      value={confirmSecondaryPassword}
                      onChange={e => setConfirmSecondaryPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    {confirmSecondaryPassword && confirmSecondaryPassword.trim() !== secondaryPassword.trim() && (
                      <p className="text-[10px] text-red-500 font-black mt-1 uppercase">As senhas não coincidem</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleSaveSecondaryPassword}
                  disabled={isSavingSecondaryPass || !secondaryPassword.trim() || secondaryPassword.trim() !== confirmSecondaryPassword.trim()}
                  className="w-full bg-amber-500 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-amber-600 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingSecondaryPass ? (
                    <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                  ) : (
                    <><Save size={16} /> Salvar Senha Secundária</>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FINANCEIRO ── */}
        {activeSubTab === 'finance' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-slideUp">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <DollarSign size={20} className="text-emerald-500" /> PIX & Carteira
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-700 uppercase mb-1 block">Chaves PIX</label>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900"
                      value={newPixKey}
                      onChange={e => setNewPixKey(e.target.value)}
                      placeholder="NOVA CHAVE"
                    />
                    <button
                      onClick={() => {
                        if (newPixKey) {
                          updateSettings({ ...settings, pixKeys: [...(settings.pixKeys || []), newPixKey] });
                          setNewPixKey('');
                        }
                      }}
                      className="bg-emerald-600 text-white px-4 rounded-xl font-black text-xs"
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(settings?.pixKeys || []).map((key: string, idx: number) => (
                      <div key={idx} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-2">
                        {key}
                        <button onClick={() => updateSettings({ ...settings, pixKeys: settings.pixKeys.filter((_: any, i: any) => i !== idx) })} className="hover:text-red-500">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">Carteira do Interno / Saldo</p>
                    <p className="text-[10px] text-slate-500">Habilitar carteira e compras via saldo</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings?.allow_balance_purchases !== false} onChange={e => updateSettings({ ...settings, allow_balance_purchases: e.target.checked, enablePrisonerWallet: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">Forçar PIX</p>
                    <p className="text-[10px] text-slate-500">Exigir pagamento PIX para usuários</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={!!settings?.forcePixOnlyUsers} onChange={e => updateSettings({ ...settings, forcePixOnlyUsers: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">Liberar Compras</p>
                    <p className="text-[10px] text-slate-500">Permitir que usuários FAMILY vejam a loja</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings?.allow_user_purchases !== false} onChange={e => updateSettings({ ...settings, allow_user_purchases: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Limite de Crédito Semanal (R$)</p>
                  <input
                    type="number"
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-black text-sm text-slate-900"
                    value={settings?.weeklyWalletLimit || 300}
                    onChange={e => updateSettings({ ...settings, weeklyWalletLimit: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <Truck size={20} className="text-blue-500" /> Entregas
              </h3>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Prazo de Entrega (dias)</p>
                  <input
                    type="number"
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-black text-sm text-slate-900"
                    value={settings?.deliveryDays || 3}
                    onChange={e => updateSettings({ ...settings, deliveryDays: parseInt(e.target.value) })}
                  />
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Mensagem Boas-vindas</p>
                  <textarea
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-bold text-sm text-slate-900 h-24"
                    value={settings?.welcomeMessage || ''}
                    onChange={e => updateSettings({ ...settings, welcomeMessage: e.target.value })}
                    placeholder="Mensagem que aparece para novos usuários"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── IMPRESSÃO ── */}
        {activeSubTab === 'receipts' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-slideUp">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <Printer size={20} className="text-purple-500" /> Personalização de Recibos
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">Nome do Documento</label>
                  <input
                    className="w-full text-slate-800 bg-white border border-slate-300 px-4 py-3.5 rounded-xl font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition-all"
                    value={settings?.customReceiptDocName || 'RECIBO'}
                    onChange={e => updateSettings({ ...settings, customReceiptDocName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">Texto de Rodapé do Cupom</label>
                  <textarea
                    className="w-full text-slate-800 bg-white border border-slate-300 px-4 py-3.5 rounded-xl font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition-all h-24 resize-none"
                    value={settings?.receiptFooter || ''}
                    onChange={e => updateSettings({ ...settings, receiptFooter: e.target.value })}
                    placeholder="Ex: Obrigado pela preferência!"
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">Imprimir automaticamente</p>
                    <p className="text-[10px] text-slate-500">Abre janela de impressão após venda</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={!!settings?.autoPrint} onChange={e => updateSettings({ ...settings, autoPrint: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
              </div>
            </div>
            <div className="bg-slate-900 p-10 rounded-3xl text-white flex flex-col items-center justify-center gap-4">
              <Printer size={48} className="text-purple-400" />
              <p className="text-xs text-center text-white/40 uppercase font-black tracking-widest">Prévia do cupom térmico aparecerá aqui</p>
            </div>
          </div>
        )}

        {/* ── APARÊNCIA ── */}
        {activeSubTab === 'appearance' && (
          <div className="animate-slideUp">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2 mb-4">
                <Palette size={20} className="text-pink-600" /> Tema do Sistema
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { id: ThemeOption.POLICE_MT, label: 'Polícia Penal', colors: 'bg-slate-900', hex: '#0f172a' },
                  { id: ThemeOption.MODERN_GREEN, label: 'Modern Green', colors: 'bg-emerald-600', hex: '#064e3b' },
                  { id: ThemeOption.PROFESSIONAL_BLUE, label: 'Prof. Blue', colors: 'bg-blue-600', hex: '#1d4ed8' },
                  { id: ThemeOption.ELEGANT_PURPLE, label: 'Elegant Purple', colors: 'bg-purple-600', hex: '#7c3aed' },
                  { id: ThemeOption.CYBER_DARK, label: 'Cyber Dark', colors: 'bg-black', hex: '#000000' },
                  { id: ThemeOption.VIBRANT_ORANGE, label: 'Vibrant Orange', colors: 'bg-orange-600', hex: '#ea580c' }
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => updateSettings({ ...settings, theme: t.id, primaryColor: t.hex })}
                    className={`p-5 rounded-2xl border-4 transition-all flex flex-col items-center gap-2 ${settings?.theme === t.id ? 'border-slate-800 bg-slate-100' : 'border-transparent bg-slate-50 hover:border-slate-300'}`}
                  >
                    <div className={`w-10 h-10 rounded-full ${t.colors}`} />
                    <span className="text-[10px] font-bold uppercase text-slate-700">{t.label}</span>
                    {settings?.theme === t.id && <Check size={16} className="text-slate-800" />}
                  </button>
                ))}
              </div>

              <div className="pt-6 mt-6 border-t border-slate-200">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2 mb-4">
                  <Smartphone size={20} className="text-indigo-600" /> Layout do PDV
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => updateSettings({ ...settings, pdvLayout: 'IMAGE_1_DEFAULT' })}
                    className={`p-6 rounded-2xl border-4 transition-all flex flex-col items-center gap-3 ${(!settings?.pdvLayout || settings?.pdvLayout === 'IMAGE_1_DEFAULT') ? 'border-slate-800 bg-slate-100' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                      <ShoppingBag size={24} />
                    </div>
                    <span className="text-sm font-black text-slate-800">Padrão Moderno</span>
                    <p className="text-xs text-slate-500">Visual com imagens grandes</p>
                  </button>
                  <button
                    onClick={() => updateSettings({ ...settings, pdvLayout: 'CLASSIC' })}
                    className={`p-6 rounded-2xl border-4 transition-all flex flex-col items-center gap-3 ${settings?.pdvLayout === 'CLASSIC' ? 'border-slate-800 bg-slate-100' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                      <Search size={24} />
                    </div>
                    <span className="text-sm font-black text-slate-800">Expandido/ERP</span>
                    <p className="text-xs text-slate-500">Busca avançada de clientes</p>
                  </button>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-800 mb-3">Cor principal do PDV</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { hex: '#064e3b', name: 'Verde' }, { hex: '#0f172a', name: 'Azul' },
                    { hex: '#dc2626', name: 'Vermelho' }, { hex: '#7c3aed', name: 'Roxo' },
                    { hex: '#ea580c', name: 'Laranja' }, { hex: '#0891b2', name: 'Ciano' },
                    { hex: '#4f46e5', name: 'Índigo' }, { hex: '#be185d', name: 'Rosa' }
                  ].map(c => (
                    <button
                      key={c.hex}
                      onClick={() => updateSettings({ ...settings, pdvColor: c.hex })}
                      className={`w-10 h-10 rounded-xl border-4 transition-all ${settings?.pdvColor === c.hex ? 'border-slate-900 scale-110' : 'border-transparent hover:scale-105'}`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                  <input
                    type="color"
                    value={settings?.pdvColor || '#064e3b'}
                    onChange={e => updateSettings({ ...settings, pdvColor: e.target.value })}
                    className="w-10 h-10 rounded-xl border-2 border-white cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ATUALIZAÇÃO ── */}
        {activeSubTab === 'updates' && (
          <div className="animate-slideUp">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <Zap size={20} className="text-yellow-500" /> Portabilidade & Atualização
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={handleDownloadSource} className="p-6 border-2 border-slate-200 bg-slate-50 rounded-2xl flex flex-col items-center gap-3 hover:bg-slate-100 transition-all">
                  <div className="bg-slate-900 text-white p-3 rounded-xl"><Download size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Download Fonte</span>
                  <p className="text-[9px] text-slate-400 text-center">Código para rodar offline</p>
                </button>
                <button onClick={handleBuildExe} className="p-6 border-2 border-indigo-100 bg-indigo-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-indigo-100 transition-all">
                  <div className="bg-indigo-600 text-white p-3 rounded-xl"><HardDrive size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Build EXE</span>
                  <p className="text-[9px] text-slate-400 text-center">Gerar executável Windows</p>
                </button>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs font-bold text-blue-800">
                  Versão atual: <span className="font-black">v1.0.0 RC</span> — Mercado Fácil PDV (ASSPEN)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── MANUTENÇÃO ── */}
        {activeSubTab === 'maintenance' && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-slideUp">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl col-span-1 lg:col-span-2 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <Database size={20} className="text-indigo-600" /> Manutenção do Sistema
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={backupSystem} className="p-6 border-2 border-indigo-50 bg-indigo-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-indigo-100 transition-all">
                  <div className="bg-indigo-600 text-white p-3 rounded-xl"><HardDrive size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Backup JSON</span>
                </button>
                <button onClick={() => handleProtectedAction(clearOldData)} className="p-6 border-2 border-slate-900 bg-slate-900 text-white rounded-2xl flex flex-col items-center gap-3 hover:bg-black transition-all">
                  <div className="bg-white text-slate-900 p-3 rounded-xl"><Download size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Arquivar e Limpar</span>
                </button>
                <button onClick={() => handleProtectedAction(resetStock)} className="p-6 border-2 border-orange-50 bg-orange-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-orange-100">
                  <div className="bg-orange-600 text-white p-3 rounded-xl"><RefreshCw size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Zerar Estoque</span>
                </button>
                <button onClick={() => handleProtectedAction(resetFinance)} className="p-6 border-2 border-red-50 bg-red-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-red-100">
                  <div className="bg-red-600 text-white p-3 rounded-xl"><AlertTriangle size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Zerar Financeiro</span>
                </button>
              </div>
              {isMaster && (
                <button
                  onClick={() => handleProtectedAction(() => resetSystem(true))}
                  className="w-full p-4 bg-red-600 text-white rounded-2xl font-black uppercase text-sm hover:bg-red-700 mt-4 flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={18} /> REINICIALIZAÇÃO TOTAL DO SISTEMA
                </button>
              )}
            </div>
            <div className="space-y-6">
              <div className="bg-slate-900 p-8 rounded-3xl text-white">
                <h4 className="text-lg font-black mb-2 uppercase">Portabilidade</h4>
                <p className="text-xs text-white/50 mb-4">Baixe o código para rodar offline.</p>
                <button onClick={handleDownloadSource} className="w-full bg-white text-slate-900 p-3 rounded-xl font-black text-xs uppercase mb-2">Download Fonte</button>
                <button onClick={handleBuildExe} className="w-full bg-white/10 text-white p-3 rounded-xl font-black text-xs uppercase">Build EXE</button>
              </div>
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                  <Users size={20} className="text-emerald-600" /> Equipe de Suporte
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1 block">NOME DO DESENVOLVEDOR</label>
                    <input
                      className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-2xl font-bold text-sm text-slate-900 outline-none transition-all"
                      value={localSettings?.dev_name || localSettings?.developerName || ''}
                      onChange={e => setLocalSettings({ ...localSettings, dev_name: e.target.value, developerName: e.target.value })}
                      placeholder="Ex: Edevaldo de Lima Almeida"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1 block">E-MAIL DE SUPORTE</label>
                    <input
                      className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-2xl font-bold text-sm text-slate-900 outline-none transition-all"
                      value={localSettings?.dev_email || localSettings?.developerEmail || ''}
                      onChange={e => setLocalSettings({ ...localSettings, dev_email: e.target.value, developerEmail: e.target.value })}
                      placeholder="Ex: edh333@hotmail.com"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1 block">CONTATO TELEFÔNICO / WHATSAPP</label>
                    <input
                      className="w-full p-3 bg-slate-50 border-2 border-slate-200 focus:border-emerald-500 rounded-2xl font-bold text-sm text-slate-900 outline-none transition-all"
                      value={localSettings?.dev_phone || localSettings?.developerPhone || ''}
                      onChange={e => setLocalSettings({ ...localSettings, dev_phone: e.target.value, developerPhone: e.target.value })}
                      placeholder="Ex: (66) 99999-9999"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── PONTO DE RESTAURAÇÃO ── */}
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl col-span-1 lg:col-span-3 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                <Archive size={20} className="text-emerald-600" /> Ponto de Restauração
              </h3>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg">
                {pontosRestauracao.length} ponto(s) salvo(s)
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed -mt-2">
              Crie um ponto de restauração antes de mudanças importantes. Se algo der errado, volte o sistema para uma data anterior com um clique.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={handleCriarPonto}
                className="p-5 border-2 border-emerald-100 bg-emerald-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-emerald-100 transition-all"
              >
                <div className="bg-emerald-600 text-white p-3 rounded-xl"><Save size={22} /></div>
                <span className="text-[10px] font-black uppercase text-emerald-800">Criar Ponto Agora</span>
              </button>
              <button
                onClick={baixarBackupLocal}
                className="p-5 border-2 border-indigo-50 bg-indigo-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-indigo-100 transition-all"
              >
                <div className="bg-indigo-600 text-white p-3 rounded-xl"><Download size={22} /></div>
                <span className="text-[10px] font-black uppercase text-indigo-800">Baixar Backup Completo</span>
              </button>
              <button
                onClick={() => fileInputRestoreRef.current?.click()}
                className="p-5 border-2 border-slate-100 bg-slate-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-slate-100 transition-all"
              >
                <div className="bg-slate-700 text-white p-3 rounded-xl"><Upload size={22} /></div>
                <span className="text-[10px] font-black uppercase text-slate-700">Importar Backup</span>
              </button>
              <input
                type="file"
                accept="application/json,.json"
                hidden
                ref={fileInputRestoreRef}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleImportarRestauracao(f);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="pt-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-3">Histórico de pontos</p>
              {pontosRestauracao.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <History size={32} className="mx-auto mb-3 opacity-30 text-slate-400" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Nenhum ponto de restauração ainda</p>
                  <p className="text-[10px] text-slate-400 mt-1">Os backups automáticos diários aparecerão aqui.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {pontosRestauracao.map(p => (
                    <div key={p.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.origin === 'auto' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        <History size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 uppercase truncate">{p.label}</p>
                        <p className="text-[10px] text-slate-500">
                          {formatarDataPonto(p.createdAt)}
                          <span className={`ml-2 font-black uppercase ${p.origin === 'auto' ? 'text-emerald-600' : 'text-indigo-600'}`}>{p.origin === 'auto' ? 'Automático' : 'Manual'}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setRestoreTarget(p)}
                          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                        >
                          <RotateCcw size={14} /> Restaurar
                        </button>
                        <button
                          onClick={() => baixarPontoRestauracao(p.id)}
                          className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-xl transition-all"
                          title="Baixar ponto"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => { excluirPontoRestauracao(p.id); refreshPontos(); }}
                          className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 rounded-xl transition-all"
                          title="Excluir ponto"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </>
        )}

      </div>

      {/* CONFIRMAÇÃO DE RESTAURAÇÃO */}
      {restoreTarget && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-fadeIn">
            <div className="w-16 h-16 mx-auto mb-5 bg-amber-100 rounded-2xl flex items-center justify-center">
              <RotateCcw size={28} className="text-amber-600" />
            </div>
            <h3 className="text-lg font-black uppercase tracking-wide text-slate-900 mb-2">Restaurar Sistema?</h3>
            <p className="text-sm font-semibold text-slate-500 leading-relaxed mb-2">
              O sistema voltará para o ponto: <span className="text-slate-900 font-black uppercase">{restoreTarget.label}</span>
            </p>
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed mb-6">
              ({formatarDataPonto(restoreTarget.createdAt)}) — as configurações e dados locais serão revertidos para essa data.
              Recomenda-se baixar um backup antes. Os dados da nuvem (Firestore) não são alterados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRestoreTarget(null)}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => { const t = restoreTarget; setRestoreTarget(null); handleRestaurarPonto(t); }}
                className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={15} /> Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};