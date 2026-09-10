import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import { SENTRY_ATIVO } from '../../utils/sentry';
import {
  CHECKLIST_PADRAO,
  computeChecklist,
  computeMaintenanceAlerts,
  contagemPendencias,
  AlertaManutencao,
  ChecagemChecklist,
  DocManutencao,
  pluralDias,
} from '../../utils/maintenanceAlerts';
import { Order, Product, User, WalletTransaction } from '../../types';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  CalendarClock,
  Settings2,
} from 'lucide-react';

const fnExecutarBackupAgora = httpsCallable(getFunctions(), 'executarBackupAgora');

const STYLES_NIVEL: Record<string, { chip: string; texto: string; borda: string }> = {
  critical: {
    chip: 'bg-red-500/15 text-red-400 border-red-500/30',
    texto: 'text-red-400',
    borda: 'border-red-500/30',
  },
  warning: {
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    texto: 'text-amber-400',
    borda: 'border-amber-500/30',
  },
  info: {
    chip: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    texto: 'text-sky-400',
    borda: 'border-sky-500/30',
  },
};

interface Props {
  products?: Product[];
  orders?: Order[];
  walletTx?: WalletTransaction[];
  users?: User[];
  cotaCritica?: boolean;
  currentUser?: User | null;
  onNavigate?: (tab: string) => void;
  /** 'banner' = faixa compacta no topo; 'full' = painel completo na aba inicial */
  variant?: 'banner' | 'full';
}

const LABEL_ACAO: Record<string, string> = {
  backup: 'Executar backup agora',
  cota: 'Ver uso no Console',
  estoque: 'Abrir estoque',
  pedidos: 'Abrir pedidos',
  depositos: 'Ver depositos',
  usuarios: 'Aprovar familiares',
  settings: 'Abrir configuracoes',
};

export const MaintenanceCenter: React.FC<Props> = ({
  products,
  orders,
  walletTx,
  users,
  cotaCritica = false,
  currentUser,
  onNavigate,
  variant = 'full',
}) => {
  const [maintenance, setMaintenance] = useState<DocManutencao | null>(null);
  const [estadoChecklist, setEstadoChecklist] = useState<Record<string, any> | undefined>(undefined);
  const [backupando, setBackupando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'maintenance'),
      (snap) => setMaintenance((snap.exists() ? snap.data() : null) as DocManutencao | null),
      (err) => console.error('[MaintenanceCenter] erro ao ler settings/maintenance:', err),
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'checklist'),
      (snap) => setEstadoChecklist(snap.exists() ? (snap.data() as Record<string, any>) : undefined),
      (err) => console.error('[MaintenanceCenter] erro ao ler settings/checklist:', err),
    );
    return unsub;
  }, []);

  const alerts = useMemo<AlertaManutencao[]>(() => {
    const esgotados = (products || []).filter((p) => (p as any).deleted !== true && (p.stock ?? 0) <= 0 && p.available !== false).length;
    const estoqueBaixo = (products || []).filter((p) => (p as any).deleted !== true && (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5).length;
    const pending = ['pending', 'pendente'];
    const pedidosPendentes = (orders || []).filter((o) => pending.includes(String(o.status || '').toLowerCase())).length;
    const depositosPendentes = (walletTx || []).filter((tx) => tx.status === 'pending').length;
    const usuariosPendentes = (users || []).filter((u) => u.role === 'FAMILY' && !u.approved).length;
    return computeMaintenanceAlerts({
      maintenance,
      cotaCritica,
      monitoramentoAtivo: SENTRY_ATIVO,
      esgotados,
      estoqueBaixo,
      pedidosPendentes,
      depositosPendentes,
      usuariosPendentes,
    });
  }, [maintenance, cotaCritica, products, orders, walletTx, users]);

  const checagens = useMemo<ChecagemChecklist[]>(() => {
    return computeChecklist(CHECKLIST_PADRAO, estadoChecklist?.realizacoes, new Date());
  }, [estadoChecklist]);

  const criticos = alerts.filter((a) => a.nivel === 'critical').length;
  const avisos = alerts.filter((a) => a.nivel === 'warning').length;
  const pendenciasChecklist = useMemo(() => contagemPendencias(checagens), [checagens]);

  const executarBackup = async () => {
    if (backupando) return;
    setBackupando(true);
    setFeedback(null);
    try {
      await fnExecutarBackupAgora({});
      setFeedback('Backup manual gerado com sucesso no servidor!');
    } catch (e: any) {
      setFeedback('Falha ao gerar backup: ' + (e?.message || 'verifique se as Cloud Functions estao no ar.'));
    } finally {
      setBackupando(false);
    }
  };

  const marcarFeito = async (id: string) => {
    const por = currentUser?.name || currentUser?.email || 'admin';
    try {
      await setDoc(
        doc(db, 'settings', 'checklist'),
        { ['realizacoes.' + id]: { realizadaEm: new Date().toISOString(), por } },
        { merge: true },
      );
    } catch (e: any) {
      console.error('[MaintenanceCenter] falha ao marcar item do checklist:', e);
    }
  };

  const acaoAlerta = (a: AlertaManutencao) => {
    if (a.alvo === 'backup') {
      executarBackup();
      return;
    }
    if (a.alvo === 'cota') {
      window.open('https://console.firebase.google.com/u/0/project/_/usage/billing', '_blank');
      return;
    }
    if (onNavigate) {
      const destino =
        a.alvo === 'estoque' ? 'stock_alerts'
        : a.alvo === 'usuarios' ? 'users'
        : a.alvo === 'pedidos' ? 'orders'
        : a.alvo === 'depositos' ? 'wallet'
        : 'settings';
      onNavigate(destino);
    }
  };

  // ---- BANNER compacto (topo do painel, visivel enquanto houver aviso) ----
  if (variant === 'banner') {
    const ativos = alerts.filter((a) => a.nivel === 'critical' || a.nivel === 'warning');
    if (ativos.length === 0 && pendenciasChecklist === 0) return null;
    const temCritico = criticos > 0;
    return (
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className={
          'w-full rounded-2xl border p-3.5 shadow-lg flex flex-col gap-2.5 backdrop-blur-xl ' +
          (temCritico ? 'bg-red-950/95 border-red-500/40' : 'bg-amber-950/95 border-amber-500/40')
        }
      >
        <div className="flex items-center gap-3">
          <div className={'p-2.5 rounded-xl shrink-0 ' + (temCritico ? 'bg-red-500/15' : 'bg-amber-500/15')}>
            <AlertTriangle size={20} className={temCritico ? 'text-red-400' : 'text-amber-400'} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={'font-black text-xs uppercase tracking-widest ' + (temCritico ? 'text-red-300' : 'text-amber-300')}>
              Manutencao necessaria
            </p>
            <p className="text-[10px] font-bold text-amber-200/80 leading-relaxed mt-0.5">
              {criticos > 0 && <span><strong>{criticos} critico(s). </strong></span>}
              {avisos > 0 && <span><strong>{avisos} aviso(s). </strong></span>}
              {pendenciasChecklist > 0 && <span>Checklist com <strong>{pendenciasChecklist} pendencia(s)</strong>. </span>}
              Abra o centro de manutencao para resolver.
            </p>
          </div>
          <button
            onClick={() => onNavigate?.('home')}
            className="shrink-0 px-4 py-2 bg-white text-red-900 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 hover:bg-red-50 active:scale-95 transition-all"
          >
            <ShieldCheck size={14} /> Ver centro
          </button>
        </div>
      </motion.div>
    );
  }

  // ---- PAINEL completo (aba inicial) ----
  const categorias: Array<ChecagemChecklist['item']['categoria']> = ['Diaria', 'Semanal', 'Mensal', 'Trimestral', 'Semestral'];
  const totalAtencao = criticos + avisos + pendenciasChecklist;

  return (
    <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-sm overflow-hidden mb-6">
      <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[var(--border-color)]">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" /> Centro de Manutencao
          </h3>
          <p className="text-[10px] font-bold text-[var(--text-muted)] mt-1">
            Sinais automaticos do sistema + rotina de checagem. Visivel somente para administradores.
          </p>
        </div>
        <div className={'px-3.5 py-2 rounded-2xl font-black text-[10px] uppercase tracking-wider border ' + (totalAtencao === 0 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30')}>
          {totalAtencao === 0 ? 'Tudo em dia' : totalAtencao + ' atende(m) atencao'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
        {/* Sinais automaticos */}
        <section>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] mb-3 flex items-center gap-2 opacity-70">
            <RefreshCw size={14} /> Sinalizadores automaticos {alerts.length > 0 ? '(' + alerts.length + ')' : ''}
          </h4>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3.5">
              <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 leading-relaxed">
                Nenhum sinal automatico de manutencao. Backup, cota, estoque e pendencias dentro do esperado.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {alerts.map((a) => {
                const s = STYLES_NIVEL[a.nivel];
                return (
                  <div key={a.id} className={'rounded-2xl border ' + s.borda + ' bg-[var(--bg-main)] p-3.5'}>
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className={'px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider shrink-0 ' + s.chip}>
                        {a.nivel === 'critical' ? 'Critico' : a.nivel === 'warning' ? 'Aviso' : 'Info'}
                      </span>
                      <div className="min-w-0">
                        <p className={'text-[11px] font-black uppercase tracking-wider ' + s.texto + ' leading-snug'}>{a.titulo}</p>
                        <p className="text-[10px] font-bold text-[var(--text-muted)] leading-relaxed mt-1">{a.mensagem}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => acaoAlerta(a)}
                      className={'mt-3 w-full sm:w-auto px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 ' + s.chip}
                    >
                      {a.alvo === 'backup' && backupando ? <Loader2 size={13} className="animate-spin" /> : <Settings2 size={13} />}
                      {a.alvo === 'backup' && backupando ? 'Gerando...' : LABEL_ACAO[a.alvo] || 'Resolver'}
                    </button>
                  </div>
                );
              })}
              {feedback && (
                <p className={'text-[10px] font-black uppercase tracking-wider ' + (feedback.indexOf('Falha') === 0 ? 'text-red-500' : 'text-emerald-600')}>
                  {feedback}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Checklist de rotina */}
        <section>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] mb-3 flex items-center gap-2 opacity-70">
            <CalendarClock size={14} /> Checklist de rotina
          </h4>
          <div className="space-y-3">
            {categorias.map((cat) => {
              const itens = checagens.filter((c) => c.item.categoria === cat);
              if (itens.length === 0) return null;
              const emDiaCount = itens.filter((c) => c.emDia).length;
              return (
                <div key={cat} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] overflow-hidden">
                  <p className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-color)] flex items-center justify-between">
                    <span>{cat}</span>
                    <span>{emDiaCount}/{itens.length} em dia</span>
                  </p>
                  <div className="divide-y divide-[var(--border-color)]">
                    {itens.map((c) => (
                      <div key={c.item.id} className="px-4 py-3 flex items-start gap-3">
                        <button
                          onClick={() => marcarFeito(c.item.id)}
                          title={c.emDia ? 'Marcar novamente (renova o prazo)' : 'Marcar como realizado'}
                          className={'mt-0.5 w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ' + (c.emDia ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-[var(--border-color)] text-transparent hover:border-emerald-500')}
                        >
                          <CheckCircle2 size={13} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={'text-[11px] font-black uppercase tracking-wider leading-snug ' + (c.emDia ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-main)]')}>
                            {c.item.titulo}
                          </p>
                          <p className="text-[10px] font-bold text-[var(--text-muted)] leading-relaxed mt-0.5">{c.item.descricao}</p>
                          <p className={'text-[9px] font-black uppercase tracking-wider mt-1 ' + (c.emDia ? 'text-emerald-500' : 'text-amber-500')}>
                            {c.emDia
                              ? c.diasAtraso !== null && c.diasAtraso <= c.item.intervaloDias
                                ? c.diasAtraso === 0 ? 'OK — feito hoje' + (c.por ? ' (' + c.por + ')' : '') : 'OK — feito ha ' + pluralDias(c.diasAtraso) + (c.por ? ' (' + c.por + ')' : '')
                                : 'Nunca realizado'
                              : c.diasAtraso === null
                                ? 'Nunca realizado'
                                : 'Pendente ha ' + pluralDias(c.diasAtraso) + ' (limite ' + pluralDias(c.item.intervaloDias) + ')'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};