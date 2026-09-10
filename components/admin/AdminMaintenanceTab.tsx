import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Wrench, Loader2, Trash2, DatabaseBackup, Sparkles, AlertTriangle } from 'lucide-react';
import { MaintenanceCenter } from './MaintenanceCenter';
import { DeviceStorageManager } from './DeviceStorageManager';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';
import { Order, Product, User, WalletTransaction } from '../../types';
import { useApp } from '../../context/StoreContext';

const fnExecutarBackupAgora = httpsCallable(getFunctions(), 'executarBackupAgora');

interface Props {
  products?: Product[];
  orders?: Order[];
  walletTx?: WalletTransaction[];
  users?: User[];
  cotaCritica?: boolean;
  currentUser?: User | null;
  onNavigate?: (tab: string) => void;
}

export const AdminMaintenanceTab: React.FC<Props> = ({
  products,
  orders,
  walletTx,
  users,
  cotaCritica,
  currentUser,
  onNavigate,
}) => {
  const { resetCredits, clearOldData } = useApp();
  const [backupando, setBackupando] = useState(false);
  const [limpandoAntigos, setLimpandoAntigos] = useState(false);
  const [zerando, setZerando] = useState(false);
  const [confirmZerar, setConfirmZerar] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);

  const gerarBackup = async () => {
    if (backupando) return;
    setBackupando(true);
    setFeedback(null);
    try {
      await fnExecutarBackupAgora({});
      setFeedback({ msg: 'Backup manual gerado no servidor com sucesso.', ok: true });
    } catch (e: any) {
      setFeedback({ msg: 'Falha ao gerar backup: ' + (e?.message || 'funcoes fora do ar?'), ok: false });
    } finally {
      setBackupando(false);
    }
  };

  const limparAntigos = async () => {
    if (limpandoAntigos) return;
    setLimpandoAntigos(true);
    setFeedback(null);
    try {
      await clearOldData();
      setFeedback({ msg: 'Remocao de dados antigos concluida. Pode levar alguns minutos para refletir nos contadores.', ok: true });
    } catch (e: any) {
      setFeedback({ msg: 'Falha ao limpar dados antigos: ' + (e?.message || 'tente novamente.'), ok: false });
    } finally {
      setLimpandoAntigos(false);
    }
  };

  const zerarCredito = async () => {
    if (zerando) return;
    setZerando(true);
    setFeedback(null);
    try {
      await resetCredits();
      setFeedback({ msg: 'Carteiras de todos os usuarios zeradas (salvo e registrado em auditoria).', ok: true });
      setConfirmZerar(false);
    } catch (e: any) {
      setFeedback({ msg: 'Falha ao zerar creditos: ' + (e?.message || 'tente novamente.'), ok: false });
    } finally {
      setZerando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-500 shrink-0">
          <Wrench size={20} />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-main)]">Centro de Manutenção</h2>
          <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">
            O que precisa de atenção, o checklist de rotina e as ações de manutenção — tudo em um só lugar.
          </p>
        </div>
      </div>

      {feedback && (
        <div className={'rounded-2xl border px-4 py-3 flex items-center gap-3 text-[11px] font-black uppercase tracking-wider ' + (feedback.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-red-500/30 bg-red-500/10 text-red-500')}>
          {feedback.ok ? <Sparkles size={14} /> : <AlertTriangle size={14} />}
          {feedback.msg}
        </div>
      )}

      <MaintenanceCenter
        variant="full"
        products={products}
        orders={orders}
        walletTx={walletTx}
        users={users}
        cotaCritica={cotaCritica}
        currentUser={currentUser}
        onNavigate={onNavigate}
      />

      <section className="rounded-[2rem] border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 shrink-0">
            <Trash2 size={18} />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">Ações rápidas de manutenção</h4>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">
              Botões distintos para cada operação. Ações destrutivas pedem confirmação explícita.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            onClick={gerarBackup}
            disabled={backupando}
            className="flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-emerald-500/25 hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {backupando ? <Loader2 size={16} className="animate-spin" /> : <DatabaseBackup size={16} />}
            Gerar backup agora
          </button>

          <button
            onClick={limparAntigos}
            disabled={limpandoAntigos}
            className="flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-sky-500 text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-sky-500/25 hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {limpandoAntigos ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Limpar dados antigos
          </button>

          <button
            onClick={() => setConfirmZerar(true)}
            disabled={zerando}
            className="flex items-center justify-center gap-2.5 px-4 py-4 rounded-2xl bg-amber-500 text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-amber-500/25 hover:brightness-110 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {zerando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Zerar créditos de todos
          </button>
        </div>

        <p className="mt-3 text-[9px] font-bold text-[var(--text-muted)] leading-relaxed">
          "Zerar créditos" aplica a regra do sistema (padrão de créditos no início do mês) em TODAS as carteiras de uma vez,
          com registro de auditoria no servidor. A limpeza de dados antigos remove itens, pedidos e movimentações vencidas
          conforme os limites configurados.
        </p>
      </section>

      <DeviceStorageManager />

      <ConfirmacaoDestrutiva
        isOpen={confirmZerar}
        titulo="Zerar créditos de todos"
        descricao="TODAS as carteiras (incluindo a sua) voltam a zero de uma vez. O procedimento é executado no servidor, com registro de auditoria. Esteja certo de que é a regra que deseja aplicar agora — não há como desfazer em massa."
        palavraChave="ZERAR CRÉDITOS"
        processando={zerando}
        onConfirm={zerarCredito}
        onClose={() => { if (!zerando) setConfirmZerar(false); }}
      />
    </div>
  );
};

export default AdminMaintenanceTab;