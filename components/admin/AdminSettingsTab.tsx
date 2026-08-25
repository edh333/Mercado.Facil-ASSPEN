import React from 'react';
import {
  Settings, KeyRound, Database, HardDrive, Download, AlertTriangle,
  Trash2, RefreshCw, Smartphone, Palette, Shield, Lock, Save, DollarSign, Check,
  FileText, CreditCard, Building, Info, Printer, Wrench, Truck, ShoppingBag, Search, Loader2, Zap, Users,
  History, RotateCcw, Upload, Archive, Power, CalendarClock, CloudUpload, CloudDownload, FileJson, Receipt, Pencil
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ThemeOption } from '../../types';
import { useMaintenance } from '../../hooks/useMaintenance';
import {
  PontoRestauracao, criarPontoRestauracao, listarPontosRestauracao, restaurarPontoRestauracao,
  excluirPontoRestauracao, baixarPontoRestauracao, baixarBackupLocal, importarPontoRestauracao,
  aplicarChavesLocal, formatarDataPonto
} from '../../utils/backupUtils';
import { isAdminRole } from '../../utils';

const MODULOS_PERMISSAO: { key: string; label: string }[] = [
  { key: 'orders', label: 'Pedidos' },
  { key: 'sales', label: 'Venda Direta (PDV)' },
  { key: 'products', label: 'Produtos' },
  { key: 'cash', label: 'Caixa / Gaveta' },
  { key: 'inmates', label: 'Gestão de Internos' },
  { key: 'users', label: 'Gestão de Familiares' },
  { key: 'finance', label: 'Fluxo de Caixa' },
  { key: 'wallet', label: 'Carteira & Créditos' },
  { key: 'reports', label: 'Relatórios / Dashboards' },
];

const PermToggles: React.FC<{ perms: string[]; onChange: (p: string[]) => void }> = ({ perms, onChange }) => (
  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-2">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Permissões de acesso</p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(MODULOS_PERMISSAO.map(m => m.key))}
          className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
        >
          Nenhuma
        </button>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      {MODULOS_PERMISSAO.map(mod => {
        const ativo = perms.includes(mod.key);
        return (
          <button
            key={mod.key}
            type="button"
            onClick={() => onChange(ativo ? perms.filter(p => p !== mod.key) : [...perms, mod.key])}
            className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${ativo ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${ativo ? 'bg-white border-white' : 'border-slate-300'}`}>
              {ativo && <Check size={10} className="text-indigo-600" strokeWidth={4} />}
            </span>
            <span className="text-[10px] font-black leading-tight">{mod.label}</span>
          </button>
        );
      })}
    </div>
    {perms.length === 0 && (
      <p className="text-[9px] text-amber-600 font-bold">Sem permissões: o admin verá apenas o Painel Geral.</p>
    )}
  </div>
);

interface AdminSettingsTabProps {
  isMaster: boolean;
  isAuthenticated?: boolean;
  onAuthenticate?: () => void;
  currentUserId?: string;
  currentUserName?: string;
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
  updateAdminPermissions: (userId: string, permissions: string[]) => void;
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
  users, deleteUser, createAdminUser, updateAdminPermissions, handleDownloadSource, handleBuildExe, showNotification,
  isInstallable, installApp, defineMasterPassword, currentUserId, currentUserName
}) => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  const [activeSubTab, setActiveSubTab] = React.useState('general');
  const [newPixKey, setNewPixKey] = React.useState('');
  const [showAddAdmin, setShowAddAdmin] = React.useState(false);
  const [editPermissionsFor, setEditPermissionsFor] = React.useState<string | null>(null);
  const [editPermissions, setEditPermissions] = React.useState<string[]>([]);
  const [adminForm, setAdminForm] = React.useState({
    name: '', email: '', password: '', cpf: '',
    permissions: MODULOS_PERMISSAO.map(m => m.key)
  });

  // ── Controle do Sistema (modo manutenção) ──
  const {
    maintenance: maintenanceState,
    loading: maintenanceLoading,
    inativo,
    desativar: desativarSistema,
    reativar: reativarSistema,
  } = useMaintenance(currentUserId ? { id: currentUserId, name: currentUserName || '' } as any : null);
  const [maintenanceMotivo, setMaintenanceMotivo] = React.useState('');
  const [maintenanceConfirming, setMaintenanceConfirming] = React.useState(false);

  // Local copy for batch-save pattern
  const [localSettings, setLocalSettings] = React.useState<any>(settings || {});
  const [isSaving, setIsSaving] = React.useState(false);
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [secondaryPassword, setSecondaryPassword] = React.useState('');
  const [confirmSecondaryPassword, setConfirmSecondaryPassword] = React.useState('');
  const [isSavingSecondaryPass, setIsSavingSecondaryPass] = React.useState(false);

  // ── Ponto de Restauração ──
        const [pontosRestauracao, setPontosRestauracao] = React.useState<PontoRestauracao[]>([]);
        const [, setTickManutencao] = React.useState(0);

        // ── SAÚDE DA MANUTENÇÃO PREVENTIVA ──
        // Guarda a data da última manutenção localmente e avisa quando passa
        // de 30 dias (rotina recomendada: verificar-saude.bat + limpeza).
        const CHAVE_MANUTENCAO = 'mf-ultima-manutencao';
        const ultimaManutencaoStr = typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE_MANUTENCAO) : null;
        const diasDesdeManutencao = ultimaManutencaoStr ? Math.floor((Date.now() - Number(ultimaManutencaoStr)) / 86400000) : null;
        const manutencaoAtrasada = diasDesdeManutencao === null || (diasDesdeManutencao ?? 0) > 30;
  const [restoreTarget, setRestoreTarget] = React.useState<PontoRestauracao | null>(null);
  const fileInputRestoreRef = React.useRef<HTMLInputElement>(null);

  // ── Backup na Nuvem (Firestore → Storage) ──
  const [backupsNuvem, setBackupsNuvem] = React.useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = React.useState(false);
  const [backupExecutando, setBackupExecutando] = React.useState(false);
  const [restoreNuvemTarget, setRestoreNuvemTarget] = React.useState<any | null>(null);
  const [restoreNuvemPassword, setRestoreNuvemPassword] = React.useState('');
  const [restoreNuvemConfirm, setRestoreNuvemConfirm] = React.useState(false);
  const [restoreNuvemLoading, setRestoreNuvemLoading] = React.useState(false);

  const refreshPontos = () => setPontosRestauracao(listarPontosRestauracao());

  const refreshBackupsNuvem = React.useCallback(async () => {
    setBackupsLoading(true);
    try {
      const fn = httpsCallable(getFunctions(), 'listarBackups');
      const res = await fn();
      setBackupsNuvem((res.data as any)?.backups || []);
    } catch {
      showNotification?.('Erro ao listar backups.', 'error');
    } finally {
      setBackupsLoading(false);
    }
  }, [showNotification]);

  React.useEffect(() => {
    refreshPontos();
    refreshBackupsNuvem();
  }, [refreshBackupsNuvem]);

  const handleBackupAgora = async () => {
    setBackupExecutando(true);
    try {
      const fn = httpsCallable(getFunctions(), 'executarBackupAgora');
      const res = await fn();
      const r = res.data as any;
      showNotification?.(`Backup concluído! ${r.totalDocs || 0} documentos (${((r.bytes || 0) / 1024 / 1024).toFixed(2)} MB).`, 'success');
      refreshBackupsNuvem();
    } catch (e: any) {
      showNotification?.(e?.message || 'Erro ao fazer backup.', 'error');
    } finally {
      setBackupExecutando(false);
    }
  };

  const handleBaixarBackup = async (nome: string) => {
    try {
      const fn = httpsCallable(getFunctions(), 'baixarBackup');
      const res = await fn({ nome });
      const url = (res.data as any)?.url;
      if (url) window.open(url, '_blank');
      else showNotification?.('URL de download não gerada.', 'error');
    } catch (e: any) {
      showNotification?.(e?.message || 'Erro ao baixar backup.', 'error');
    }
  };

  const handleRestaurarBackup = async () => {
    if (!restoreNuvemTarget || !restoreNuvemConfirm) return;
    if (!restoreNuvemPassword) {
      showNotification?.('Informe a senha mestra para restaurar.', 'error');
      return;
    }
    setRestoreNuvemLoading(true);
    try {
      const fn = httpsCallable(getFunctions(), 'restaurarBackup');
      const res = await fn({
        nome: restoreNuvemTarget.nome,
        confirmar: true,
        senhaMestra: restoreNuvemPassword,
      });
      const r = res.data as any;
      showNotification?.(`Backup restaurado! ${r.totalDocs || 0} documentos atualizados.`, 'success');
      setRestoreNuvemTarget(null);
      setRestoreNuvemPassword('');
      setRestoreNuvemConfirm(false);
    } catch (e: any) {
      showNotification?.(e?.message || 'Erro ao restaurar backup.', 'error');
    } finally {
      setRestoreNuvemLoading(false);
    }
  };

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
    if (!pwd || pwd.length < 8) {
      showNotification?.('A senha secundária deve ter pelo menos 8 caracteres.', 'error');
      return;
    }
    if (pwd !== confirm) {
      showNotification?.('As senhas não coincidem.', 'error');
      return;
    }
    setIsSavingSecondaryPass(true);
    try {
      // Sempre via Cloud Function (hash no servidor). NUNCA gravar senha em
      // texto puro no Firestore — as regras de segurança até bloqueiam campos
      // secondaryPassword/adminPassword em settings/general.
      if (!defineMasterPassword) throw new Error('Recurso indisponível (Cloud Function não inicializada)');
      const ok = await defineMasterPassword(pwd);
      if (!ok) throw new Error('Falha ao salvar no servidor');
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

  // ── Rascunho p/ campos de texto/número (Financeiro/Impressão/Entregas) ──
  // Grava no Firestore só ao SAIR do campo (blur/Enter), não a cada tecla.
  // Antes: digitar "350" publicava ao vivo 3 → 35 → 350 (bloqueando compras
  // legítimas durante a digitação) e limpar o campo gravava NaN.
  const [fieldDrafts, setFieldDrafts] = React.useState<Record<string, string>>({});
  const draftValue = (field: string, current: any, fallback: any) =>
    fieldDrafts[field] !== undefined ? fieldDrafts[field] : String(current ?? fallback ?? '');
  const setDraft = (field: string, v: string) => setFieldDrafts(prev => ({ ...prev, [field]: v }));
  const commitDraft = (
    field: string,
    opts: { num?: boolean; int?: boolean; fallback?: number; min?: number; max?: number } = {}
  ) => {
    const raw = fieldDrafts[field];
    if (raw === undefined || !settings) return;
    let value: any = raw;
    if (opts.num || opts.int) {
      value = opts.int ? parseInt(raw, 10) : parseFloat(raw);
      if (isNaN(value)) value = opts.fallback ?? 0;
      if (opts.min !== undefined) value = Math.max(opts.min, value);
      if (opts.max !== undefined) value = Math.min(opts.max, value);
    }
    if ((settings as any)[field] !== value) {
      updateSettings({ ...(settings as any), [field]: value });
    }
    setFieldDrafts(prev => { const next = { ...prev }; delete next[field]; return next; });
  };
  const commitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  };

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
    if (!newPwd || newPwd.length < 6) {
      showNotification?.('A nova senha deve ter pelo menos 6 caracteres.', 'error');
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
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">Acesso Restrito</h3>
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
                <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-3 tracking-tight">
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
          <SubTabButton id="backup" label="Backup" icon={Database} />
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
              {isInstallable && !isStandalone && (
                <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 bg-slate-900 rounded-xl flex items-center justify-center">
                      <Smartphone size={18} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-slate-900 font-black text-[11px] uppercase tracking-wider">Instalar Programa</h4>
                      <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest mt-0.5">Disponível para PC e Celular</p>
                    </div>
                  </div>
                  <button
                    onClick={installApp}
                    className="shrink-0 flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white font-black px-4 py-2.5 rounded-xl text-[10px] uppercase tracking-widest shadow transition-all active:scale-95 cursor-pointer"
                  >
                    <Download size={14} /> Baixar
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
                      <PermToggles perms={adminForm.permissions} onChange={p => setAdminForm({ ...adminForm, permissions: p })} />
                      <button
                        onClick={() => {
                          if (adminForm.name && adminForm.email && adminForm.password) {
                            createAdminUser(adminForm);
                            setShowAddAdmin(false);
                            setAdminForm({ name: '', email: '', password: '', cpf: '', permissions: MODULOS_PERMISSAO.map(m => m.key) });
                          }
                        }}
                        className="w-full bg-slate-900 text-white p-3 rounded-xl text-xs font-black uppercase"
                      >
                        CRIAR
                      </button>
                    </div>
                  )}
                  <div className="space-y-2">
                    {(users || []).filter(u => isAdminRole(u.role) && u.id !== 'master').map(admin => (
                      <React.Fragment key={admin.id}>
                        <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                          <div className="min-w-0">
                            <p className="font-black text-xs">{admin.name}</p>
                            <p className="text-[10px] text-slate-500">{admin.email}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {!admin.permissions || admin.permissions.length === 0 || admin.permissions.includes('all') ? (
                                <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${admin.permissions?.includes('all') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {admin.permissions?.includes('all') ? 'Acesso total' : 'Sem permissões'}
                                </span>
                              ) : (
                                admin.permissions.map(p => {
                                  const mod = MODULOS_PERMISSAO.find(m => m.key === p);
                                  if (!mod) return null;
                                  return (
                                    <span key={p} className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                                      {mod.label}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-none">
                            <button
                              onClick={() => {
                                setEditPermissions(admin.permissions?.includes('all') ? MODULOS_PERMISSAO.map(m => m.key) : (admin.permissions || []));
                                setEditPermissionsFor(admin.id);
                              }}
                              title="Editar permissões"
                              className="text-indigo-500 p-2 rounded-lg hover:bg-indigo-50 transition-all"
                            >
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => { if (confirm('REMOVER?')) deleteUser(admin.id); }} className="text-red-500 p-2">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        {editPermissionsFor === admin.id && (
                          <div className="p-4 bg-white rounded-xl border border-indigo-200 space-y-3">
                            <PermToggles perms={editPermissions} onChange={setEditPermissions} />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  updateAdminPermissions(
                                    admin.id,
                                    editPermissions.length === MODULOS_PERMISSAO.length ? ['all'] : editPermissions
                                  );
                                  setEditPermissionsFor(null);
                                }}
                                className="flex-1 bg-slate-900 text-white p-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-black transition-all"
                              >
                                Salvar permissões
                              </button>
                              <button
                                onClick={() => setEditPermissionsFor(null)}
                                className="px-4 bg-white border border-slate-200 text-slate-600 p-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                    {(users || []).filter(u => isAdminRole(u.role) && u.id !== 'master').length === 0 && (
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
                  disabled={isSavingSecondaryPass || secondaryPassword.trim().length < 8 || secondaryPassword.trim() !== confirmSecondaryPassword.trim()}
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
                    value={draftValue('weeklyWalletLimit', settings?.weeklyWalletLimit, 300)}
                    onChange={e => setDraft('weeklyWalletLimit', e.target.value)}
                    onBlur={() => commitDraft('weeklyWalletLimit', { num: true, fallback: 300, min: 0 })}
                    onKeyDown={commitOnEnter}
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
                    value={draftValue('deliveryDays', settings?.deliveryDays, 3)}
                    onChange={e => setDraft('deliveryDays', e.target.value)}
                    onBlur={() => commitDraft('deliveryDays', { int: true, fallback: 3, min: 0 })}
                    onKeyDown={commitOnEnter}
                  />
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Mensagem Boas-vindas</p>
                  <textarea
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-bold text-sm text-slate-900 h-24"
                    value={draftValue('welcomeMessage', settings?.welcomeMessage, '')}
                    onChange={e => setDraft('welcomeMessage', e.target.value)}
                    onBlur={() => commitDraft('welcomeMessage')}
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
                    value={draftValue('customReceiptDocName', settings?.customReceiptDocName, 'RECIBO')}
                    onChange={e => setDraft('customReceiptDocName', e.target.value)}
                    onBlur={() => commitDraft('customReceiptDocName')}
                    onKeyDown={commitOnEnter}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">Texto de Rodapé do Cupom</label>
                  <textarea
                    className="w-full text-slate-800 bg-white border border-slate-300 px-4 py-3.5 rounded-xl font-medium focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-none transition-all h-24 resize-none"
                    value={draftValue('receiptFooter', settings?.receiptFooter, '')}
                    onChange={e => setDraft('receiptFooter', e.target.value)}
                    onBlur={() => commitDraft('receiptFooter')}
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
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Cópias do Cupom</p>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-black text-sm text-slate-900"
                    value={draftValue('receiptCopies', settings?.receiptCopies, 1)}
                    onChange={e => setDraft('receiptCopies', e.target.value)}
                    onBlur={() => commitDraft('receiptCopies', { int: true, fallback: 1, min: 1, max: 9 })}
                    onKeyDown={commitOnEnter}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">1 = normal · 2+ para via de conferência</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Tamanho da Fonte do Cupom</p>
                  <input
                    type="number"
                    min={8}
                    max={14}
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-black text-sm text-slate-900"
                    value={draftValue('receiptFontSize', settings?.receiptFontSize, 10)}
                    onChange={e => setDraft('receiptFontSize', e.target.value)}
                    onBlur={() => commitDraft('receiptFontSize', { int: true, fallback: 10, min: 8, max: 14 })}
                    onKeyDown={commitOnEnter}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <Printer size={20} className="text-emerald-500" /> Bobina Fiscal (QZ Tray / ESC/POS)
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">Comandos ESC/POS</p>
                    <p className="text-[10px] text-slate-500">Envia binário padrão de impressora térmica</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings?.escposEnabled !== false} onChange={e => updateSettings({ ...settings, escposEnabled: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">Corte automático de papel</p>
                    <p className="text-[10px] text-slate-500">Corta a bobina ao final do cupom</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={settings?.autoCutPaper !== false} onChange={e => updateSettings({ ...settings, autoCutPaper: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Tipo de Corte</p>
                  <select
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-black text-sm text-slate-900"
                    value={settings?.cutMode === 'full' ? 'full' : 'partial'}
                    onChange={e => updateSettings({ ...settings, cutMode: e.target.value })}
                  >
                    <option value="partial">Parcial (padrão — não engole o fim do cupom)</option>
                    <option value="full">Total (corta de ponta a ponta)</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900">Abrir gaveta de dinheiro</p>
                    <p className="text-[10px] text-slate-500">Impulso na gaveta ao imprimir (se houver)</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={!!settings?.drawerKick} onChange={e => updateSettings({ ...settings, drawerKick: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-emerald-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                  </label>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Densidade de Impressão (QZ)</p>
                  <select
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-black text-sm text-slate-900"
                    value={settings?.qzDotDensity || 6}
                    onChange={e => updateSettings({ ...settings, qzDotDensity: parseInt(e.target.value) })}
                  >
                    <option value={4}>4 — Leve</option>
                    <option value={6}>6 — Normal</option>
                    <option value={8}>8 — Escura</option>
                  </select>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-black uppercase text-slate-900 mb-2">Codepage (Acentuação)</p>
                  <select
                    className="w-full p-3 bg-white border-2 border-slate-400 rounded-xl font-black text-sm text-slate-900"
                    value={settings?.codepage || '850'}
                    onChange={e => updateSettings({ ...settings, codepage: e.target.value })}
                  >
                    <option value="850">PC850 — Multilingual (padrão)</option>
                    <option value="860">PC860 — Português</option>
                    <option value="utf8">UTF-8 (impressoras modernas)</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">Evita acentos corrompidos (ï¿½) na bobina</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-900 p-8 rounded-3xl text-white">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <Receipt size={24} className="text-amber-400" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">Emissão Fiscal (NF-e / NFC-e / SAT)</p>
                    <p className="text-[10px] text-white/40 font-bold mt-0.5">Opcional — confirme o modelo com seu contador</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings?.fiscalEmission === true}
                    onChange={e => updateSettings({ ...settings, fiscalEmission: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
                </label>
              </div>
              <div className={`space-y-4 ${settings?.fiscalEmission === true ? '' : 'opacity-40 pointer-events-none'}`}>
                <div>
                  <label className="text-[10px] font-black uppercase text-white/60 mb-1 block">Modelo Fiscal</label>
                  <select
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-xl font-black text-sm text-white"
                    value={settings?.fiscalModel || 'NF-E'}
                    onChange={e => updateSettings({ ...settings, fiscalModel: e.target.value })}
                  >
                    <option value="NF-E">NF-e</option>
                    <option value="NFC-E">NFC-e</option>
                    <option value="SAT">SAT (CF-e)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/60 mb-1 block">Número (sequência)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-xl font-bold text-sm text-white"
                      value={settings?.fiscalNumber || ''}
                      onChange={e => updateSettings({ ...settings, fiscalNumber: e.target.value.replace(/\D/g, '').slice(0, 9) })}
                      placeholder="000001"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-white/60 mb-1 block">Série</label>
                    <input
                      type="text"
                      className="w-full p-3 bg-white/10 border border-white/20 rounded-xl font-bold text-sm text-white uppercase"
                      value={settings?.fiscalSeries || ''}
                      onChange={e => updateSettings({ ...settings, fiscalSeries: e.target.value.toUpperCase().slice(0, 3) })}
                      placeholder="A1"
                    />
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-[10px] font-black uppercase text-white/50 leading-relaxed">
                    Quando ativado, o cupom térmico passa a exibir o cabeçalho fiscal (modelo, número e série).
                    Este sistema não emite documentos fiscais oficiais — o valor fiscal é emitido pela
                    impressora fiscal ou SAT homologado. Mantenha desligado até seu contador confirmar o modelo.
                  </p>
                </div>
              </div>
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
        {activeSubTab === 'backup' && (
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl space-y-6 animate-slideUp">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                <Database size={20} className="text-blue-600" /> Backup na Nuvem
              </h3>
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <CloudUpload size={12} /> Diário automático às 03:15
              </span>
            </div>

            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
              Cópia completa do banco de dados (usuários, pedidos, carteira, estoque, fiado, caixa e auditoria)
              salva no Google Cloud Storage. O sistema faz isso sozinho todos os dias; aqui você pode
              disparar manualmente, baixar e restaurar.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleBackupAgora}
                disabled={backupExecutando}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/30 transition-all"
              >
                {backupExecutando ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
                {backupExecutando ? 'Gerando backup...' : 'Fazer backup agora'}
              </button>
              <button
                onClick={refreshBackupsNuvem}
                disabled={backupsLoading}
                className="inline-flex items-center gap-2 px-4 py-3.5 bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
              >
                <RefreshCw size={14} className={backupsLoading ? 'animate-spin' : ''} /> Atualizar lista
              </button>
            </div>

            {/* Último backup */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Último backup</span>
              {backupsNuvem.length > 0 ? (
                <>
                  <span className="text-xs font-black text-slate-800">{backupsNuvem[0].nome.replace('backups/', '')}</span>
                  <span className="text-xs font-bold text-slate-500">
                    {backupsNuvem[0].atualizadoEm ? new Date(backupsNuvem[0].atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  <span className="text-xs font-bold text-blue-600">{(backupsNuvem[0].tamanho / 1024 / 1024).toFixed(2)} MB</span>
                </>
              ) : (
                <span className="text-xs font-bold text-slate-400">Nenhum backup encontrado ainda (o primeiro diário será gerado às 03:15).</span>
              )}
            </div>

            {/* Lista */}
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-3">
                Backups disponíveis ({backupsNuvem.length})
              </h4>
              {backupsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={22} className="animate-spin text-slate-300" />
                </div>
              ) : backupsNuvem.length === 0 ? (
                <p className="text-xs font-semibold text-slate-400 text-center py-6 bg-slate-50 rounded-2xl">
                  Nenhum backup disponível.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {backupsNuvem.map((b) => (
                    <div key={b.nome} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl p-3.5 hover:border-blue-200 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                          <FileJson size={16} className="text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-black text-slate-800 truncate">{b.nome.replace('backups/', '')}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            {b.atualizadoEm ? new Date(b.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''} • {(b.tamanho / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleBaixarBackup(b.nome)}
                          className="p-2.5 bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 rounded-xl transition-all"
                          title="Baixar backup"
                        >
                          <Download size={14} />
                        </button>
                        {b.nome.includes('diario-') && (
                          <button
                            onClick={() => { setRestoreNuvemTarget(b); setRestoreNuvemPassword(''); setRestoreNuvemConfirm(false); }}
                            className="p-2.5 bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100 rounded-xl transition-all"
                            title="Restaurar este backup"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'maintenance' && (
          <>
          {/* ── CONTROLE DO SISTEMA (modo manutenção) ── */}
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl space-y-6 animate-slideUp">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                <Power size={20} className={inativo ? 'text-red-500' : 'text-emerald-600'} /> Controle do Sistema
              </h3>
              {maintenanceLoading ? (
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg">
                  Verificando...
                </span>
              ) : inativo ? (
                <span className="text-[9px] font-black uppercase tracking-wider text-red-700 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <AlertTriangle size={12} /> SISTEMA DESATIVADO
                </span>
              ) : (
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <Check size={12} /> SISTEMA ATIVO
                </span>
              )}
            </div>

            {inativo && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-2">
                <p className="text-[10px] font-black text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarClock size={13} /> Sistema desativado
                  {maintenanceState?.desativadoEm
                    ? ` em ${new Date(maintenanceState.desativadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </p>
                <p className="text-xs font-bold text-slate-600">
                  Por: {maintenanceState?.desativadoPorNome || 'Administrador'}
                </p>
                {maintenanceState?.motivo && (
                  <p className="text-xs text-slate-500 leading-relaxed bg-white border border-red-100 rounded-xl p-3">
                    <span className="font-black text-red-700 uppercase text-[10px] block mb-1">Motivo</span>
                    {maintenanceState.motivo}
                  </p>
                )}
              </div>
            )}

            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
              Desative o acesso do painel administrativo (ex.: feriado, manutenção).{' '}
              <span className="font-black text-slate-700">
                Somente você (ou o master) continua com acesso e pode reativar.
              </span>{' '}
              Clientes e vendas continuam funcionando normalmente.
            </p>

            {inativo ? (
              <button
                onClick={() => handleProtectedAction(async () => {
                  try {
                    await reativarSistema();
                    showNotification?.('Sistema reativado! Outros administradores já podem acessar.', 'success');
                  } catch {
                    showNotification?.('Erro ao reativar o sistema.', 'error');
                  }
                }, 'maintenance')}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/30 transition-all"
              >
                <Power size={15} /> Reativar sistema
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block">
                    Motivo (opcional)
                  </label>
                  <input
                    className="w-full p-4 bg-slate-50 border-2 border-slate-200 focus:border-red-400 rounded-2xl font-bold text-sm text-slate-900 outline-none transition-all"
                    value={maintenanceMotivo}
                    onChange={e => setMaintenanceMotivo(e.target.value)}
                    placeholder="Ex: Sistema indisponível no feriado"
                    maxLength={200}
                  />
                </div>
                {!maintenanceConfirming ? (
                  <button
                    onClick={() => setMaintenanceConfirming(true)}
                    className="inline-flex items-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-500/30 transition-all"
                  >
                    <Power size={15} /> Desativar sistema
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                    <p className="text-xs font-black text-red-800 flex-1 min-w-[200px]">
                      Confirmar desativação? Outros administradores perderão o acesso imediatamente.
                    </p>
                    <button
                      onClick={() => handleProtectedAction(async () => {
                        try {
                          await desativarSistema(maintenanceMotivo);
                          setMaintenanceMotivo('');
                          setMaintenanceConfirming(false);
                          showNotification?.('Sistema desativado. Somente você e o master têm acesso agora.', 'success');
                        } catch {
                          showNotification?.('Erro ao desativar o sistema.', 'error');
                        }
                      }, 'maintenance')}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase tracking-widest"
                    >
                      Sim, desativar
                    </button>
                    <button
                      onClick={() => setMaintenanceConfirming(false)}
                      className="px-5 py-2.5 bg-white border-2 border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-black text-xs uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-slideUp">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl col-span-1 lg:col-span-2 space-y-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 mb-4">
                <Database size={20} className="text-indigo-600" /> Manutenção do Sistema
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* AVISO DE MANUTENÇÃO PREVENTIVA — verde em dia, âmbar quando passa de 30 dias */}
              <div className={`mb-4 p-4 rounded-2xl border-2 flex flex-wrap items-center justify-between gap-3 ${manutencaoAtrasada ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl text-white ${manutencaoAtrasada ? 'bg-amber-500' : 'bg-emerald-600'}`}>
                    {manutencaoAtrasada ? <AlertTriangle size={20} /> : <Check size={20} />}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-800">
                      {manutencaoAtrasada ? '⚠ Manutenção recomendada' : '✓ Sistema em dia'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500">
                      {diasDesdeManutencao === null
                        ? 'Nenhuma manutenção registrada. Rode "verificar-saude.bat" no computador.'
                        : `Última manutenção há ${diasDesdeManutencao} dia(s). Recomendado a cada 30 dias.`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem(CHAVE_MANUTENCAO, String(Date.now()));
                    setTickManutencao(Date.now());
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                >
                  Registrar manutenção feita
                </button>
              </div>
                <button onClick={backupSystem} className="p-6 border-2 border-indigo-50 bg-indigo-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-indigo-100 transition-all">
                  <div className="bg-indigo-600 text-white p-3 rounded-xl"><HardDrive size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Backup JSON</span>
                </button>
                <button onClick={() => handleProtectedAction(clearOldData)} className="p-6 border-2 border-slate-900 bg-slate-900 text-white rounded-2xl flex flex-col items-center gap-3 hover:bg-black transition-all">
                  <div className="bg-white text-slate-900 p-3 rounded-xl"><Download size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Arquivar e Limpar</span>
                </button>
                <button onClick={async () => {
                  if (!window.confirm('Limpar caches locais e renovar o sistema? Nenhum dado é apagado — vendas, produtos e usuários ficam intactos. O app recarrega em seguida.')) return;
                  try {
                    if ('caches' in window) {
                      const chaves = await caches.keys();
                      await Promise.all(chaves.map(k => caches.delete(k)));
                    }
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      await Promise.all(regs.map(r => r.unregister()));
                    }
                  } catch { /* segue para reload mesmo se cache indisponível */ }
                  window.location.reload();
                }} className="p-6 border-2 border-emerald-50 bg-emerald-50/50 rounded-2xl flex flex-col items-center gap-3 hover:bg-emerald-100 transition-all">
                  <div className="bg-emerald-600 text-white p-3 rounded-xl"><RefreshCw size={24} /></div>
                  <span className="text-[10px] font-black uppercase">Renovar Sistema</span>
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
                <h4 className="text-lg font-bold mb-2">Portabilidade</h4>
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

      {/* CONFIRMAÇÃO DE RESTAURAÇÃO (ponto local) */}
      {restoreTarget && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-fadeIn">
            <div className="w-16 h-16 mx-auto mb-5 bg-amber-100 rounded-2xl flex items-center justify-center">
              <RotateCcw size={28} className="text-amber-600" />
            </div>
            <h3 className="text-lg font-bold tracking-wide text-slate-900 mb-2">Restaurar Sistema?</h3>
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
      {/* CONFIRMAÇÃO DE RESTAURAÇÃO (backup na nuvem) */}
      {restoreNuvemTarget && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-fadeIn">
            <div className="w-16 h-16 mx-auto mb-5 bg-amber-100 rounded-2xl flex items-center justify-center">
              <CloudDownload size={28} className="text-amber-600" />
            </div>
            <h3 className="text-lg font-bold tracking-wide text-slate-900 mb-2">Restaurar Backup?</h3>
            <p className="text-sm font-semibold text-slate-500 leading-relaxed mb-2">
              Todos os dados voltarão para: <span className="text-slate-900 font-black uppercase">{restoreNuvemTarget.nome.replace('backups/', '')}</span>
            </p>
            <p className="text-[11px] font-bold text-slate-400 leading-relaxed mb-5">
              Antes de restaurar, o sistema salva um snapshot de segurança do estado atual.
              Esta ação substitui os dados atuais no banco. Requer senha mestra.
            </p>

            <label className="text-[10px] font-black text-slate-900 uppercase mb-1 block text-left">Senha mestra</label>
            <input
              type="password"
              className="w-full p-4 bg-slate-50 border-2 border-slate-200 focus:border-amber-400 rounded-2xl font-black text-sm text-slate-900 outline-none transition-all mb-4"
              value={restoreNuvemPassword}
              onChange={e => setRestoreNuvemPassword(e.target.value)}
              placeholder="••••••••"
            />

            <label className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 cursor-pointer mb-6">
              <input
                type="checkbox"
                checked={restoreNuvemConfirm}
                onChange={e => setRestoreNuvemConfirm(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              <span className="text-[11px] font-black text-amber-700 uppercase tracking-wide">
                Entendi: os dados atuais serão substituídos
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setRestoreNuvemTarget(null)}
                disabled={restoreNuvemLoading}
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleRestaurarBackup}
                disabled={restoreNuvemLoading || !restoreNuvemConfirm}
                className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {restoreNuvemLoading ? <Loader2 size={15} className="animate-spin" /> : <CloudDownload size={15} />}
                {restoreNuvemLoading ? 'Restaurando...' : 'Restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};