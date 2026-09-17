// Logica pura do "Centro de Manutencao" (painel administrativo).
// Sem dependencias de UI/Firebase — 100% testavel em vitest.
// ATENCAO: sem template literals (backticks) por seguranca de encoding.

export type SeveridadeAlerta = 'critical' | 'warning' | 'info';

export interface AlertaManutencao {
  id: string;
  nivel: SeveridadeAlerta;
  titulo: string;
  mensagem: string;
  /** alvo de navegacao/acao: 'backup' | 'cota' | 'estoque' | 'pedidos' | 'depositos' | 'usuarios' | 'settings' */
  alvo: string;
}

/** Formato do documento settings/maintenance gravado pelas Cloud Functions. */
export interface DocManutencao {
  lastBackup?: string | null;
  lastBackupStatus?: string;
  lastBackupFile?: string;
  lastBackupDocs?: number;
  lastBackupBytes?: number;
  lastRestore?: string | null;
  lastFirebaseAlert?: {
    tipo?: string;
    severidade?: string;
    titulo?: string;
    criadoEm?: string;
  } | null;
}

export interface PropsComputeAlerts {
  maintenance?: DocManutencao | null;
  cotaCritica: boolean;
  monitoramentoAtivo: boolean;
  esgotados: number;
  estoqueBaixo: number;
  pedidosPendentes: number;
  depositosPendentes: number;
  usuariosPendentes: number;
  now?: Date;
}

export interface Limiares {
  backupAlertaDias: number;
  backupCriticoDias: number;
}

export const LIMIARES: Limiares = {
  backupAlertaDias: 2,
  backupCriticoDias: 7,
};

/** Dias inteiros desde um instante ISO (0 = hoje, 1 = ontem...). null se invalido. */
export function diasDesde(iso: string | null | undefined, agora: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diff = agora.getTime() - t;
  if (diff < 0) return 0;
  return Math.floor(diff / 86400000);
}

export function pluralDias(n: number): string {
  return n === 1 ? '1 dia' : n + ' dias';
}

/** Ordena: criticos primeiro, depois avisos, por fim informativos. */
export function ordenarAlertas(alerts: AlertaManutencao[]): AlertaManutencao[] {
  const peso: Record<SeveridadeAlerta, number> = { critical: 0, warning: 1, info: 2 };
  return [...alerts].sort((a, b) => peso[a.nivel] - peso[b.nivel]);
}

/**
 * Alertas que JUSTIFICAM a faixa (banner) no topo do painel. Regra:
 * só o que exige ação URGENTE e não é rotina operacional — críticos
 * (backup ausente/falho, cota atingida) e avisos de INFRAESTRUTURA
 * (backup atrasado/cota/firebase). Rotina (estoque, pedidos, depósitos,
 * usuários, checklist) permanece apenas no Centro de Manutenção, sem
 * "gritar" no banner diário.
 */
const ALVOS_INFRA = new Set(['backup', 'cota']);
export function alertasParaBanner(alerts: AlertaManutencao[]): AlertaManutencao[] {
  return alerts.filter((a) => a.nivel === 'critical' || (a.nivel === 'warning' && ALVOS_INFRA.has(a.alvo)));
}

/**
 * Sinais automaticos de manutencao. Regras:
 * - Backup: inexistente → critico; falhou → critico; >= 7 dias → critico; >= 2 dias → aviso.
 * - Cota do Firebase atingida → critico.
 * - Monitoramento (Sentry) desligado → informativo.
 * - Itens esgotados → aviso; apenas baixo estoque → informativo.
 * - Pedidos/depositos pendentes → aviso.
 * - Usuarios por aprovar → informativo.
 * - Alerta severo recente do Firebase → aviso.
 */
export function computeMaintenanceAlerts(p: PropsComputeAlerts): AlertaManutencao[] {
  const agora = p.now ?? new Date();
  const alerts: AlertaManutencao[] = [];

  const m = p.maintenance;
  const dias = diasDesde(m?.lastBackup, agora);
  const status = String(m?.lastBackupStatus || '');

  if (!m?.lastBackup) {
    alerts.push({
      id: 'backup-nunca',
      nivel: 'critical',
      titulo: 'Nenhum backup registrado',
      mensagem: 'O sistema ainda nao registrou nenhum backup. O diario roda automaticamente as 03:15; se as Cloud Functions nao estiverem no ar, execute um backup manual agora.',
      alvo: 'backup',
    });
  } else if (status && status !== 'ok' && status !== 'success') {
    alerts.push({
      id: 'backup-erro',
      nivel: 'critical',
      titulo: 'Falha no ultimo backup',
      mensagem: 'O ultimo backup (' + String(m.lastBackupFile || '') + ') retornou status "' + status + '". Verifique os logs das Cloud Functions e gere um backup manual.',
      alvo: 'backup',
    });
  } else if (dias !== null && dias >= LIMIARES.backupCriticoDias) {
    alerts.push({
      id: 'backup-vencido',
      nivel: 'critical',
      titulo: 'Backup desatualizado (' + pluralDias(dias) + ')',
      mensagem: 'Ha mais de uma semana o servico diario de backup (03:15) nao confirma uma copia nova. Verifique as Functions e gere uma copia manual imediatamente.',
      alvo: 'backup',
    });
  } else if (dias !== null && dias >= LIMIARES.backupAlertaDias) {
    alerts.push({
      id: 'backup-atencao',
      nivel: 'warning',
      titulo: 'Ultimo backup ha ' + pluralDias(dias),
      mensagem: 'O backup diario nao confirmou uma copia nova recentemente. Confira o servico agendado (Function backupAutomaticoDiario).',
      alvo: 'backup',
    });
  }

  if (p.cotaCritica) {
    alerts.push({
      id: 'cota',
      nivel: 'critical',
      titulo: 'Cota do Firebase atingida',
      mensagem: 'Partes do sistema podem ficar temporariamente indisponiveis ate renovar a meia-noite UTC. Para operacao continua, ative o plano Blaze.',
      alvo: 'cota',
    });
  }

  if (!p.monitoramentoAtivo) {
    alerts.push({
      id: 'monitoramento',
      nivel: 'info',
      titulo: 'Monitoramento de erros desligado',
      mensagem: 'O Sentry esta integrado, mas sem DSN configurado (VITE_SENTRY_DSN no .env). Sem ele, falhas so aparecem quando um usuario reportar. Configure em Configuracoes → Revisao.',
      alvo: 'settings',
    });
  }

  if (p.esgotados > 0) {
    alerts.push({
      id: 'estoque-esgotados',
      nivel: 'warning',
      titulo: p.esgotados + ' produto(s) esgotado(s)',
      mensagem: 'Itens sem estoque nao podem ser vendidos (nem pelo app nem pelo PDV). Planeje a reposicao.',
      alvo: 'estoque',
    });
  } else if (p.estoqueBaixo > 0) {
    alerts.push({
      id: 'estoque-baixo',
      nivel: 'info',
      titulo: p.estoqueBaixo + ' produto(s) com estoque baixo',
      mensagem: 'Itens com 5 unidades ou menos. Programe a reposicao antes de esgotarem.',
      alvo: 'estoque',
    });
  }

  if (p.pedidosPendentes > 0) {
    alerts.push({
      id: 'pedidos',
      nivel: 'warning',
      titulo: p.pedidosPendentes + ' pedido(s) pendente(s) de aprovacao',
      mensagem: 'Pedidos aguardando analise da equipe. Quanto antes forem resolvidos, antes o fluxo se mantem saudavel.',
      alvo: 'pedidos',
    });
  }

  if (p.depositosPendentes > 0) {
    alerts.push({
      id: 'depositos',
      nivel: 'warning',
      titulo: p.depositosPendentes + ' deposito(s) pendente(s) de validacao',
      mensagem: 'Comprovantes de deposito aguardando conferencia para liberar saldo.',
      alvo: 'depositos',
    });
  }

  if (p.usuariosPendentes > 0) {
    alerts.push({
      id: 'usuarios',
      nivel: 'info',
      titulo: p.usuariosPendentes + ' familiar(es) aguardando aprovacao',
      mensagem: 'Novos familiares precisam ser aprovados para acessar o app.',
      alvo: 'usuarios',
    });
  }

  const fb = m?.lastFirebaseAlert;
  if (fb && (fb.severidade === 'ERROR' || fb.severidade === 'CRITICAL' || fb.severidade === 'WARNING')) {
    const quando = fb.criadoEm ? new Date(fb.criadoEm).toLocaleString('pt-BR') : 'momento desconhecido';
    alerts.push({
      id: 'firebase-alert',
      nivel: fb.severidade === 'ERROR' || fb.severidade === 'CRITICAL' ? 'warning' : 'info',
      titulo: fb.titulo || 'Alerta recente do Firebase',
      mensagem: 'Tipo "' + (fb.tipo || 'desconhecido') + '" (' + fb.severidade + ') registrado em ' + quando + '.',
      alvo: 'settings',
    });
  }

  return ordenarAlertas(alerts);
}

// ---------------------------------------------------------
// Checklist de rotina (cadencias fixas de manutencao)
// ---------------------------------------------------------

export interface ItemChecklist {
  id: string;
  titulo: string;
  descricao: string;
  intervaloDias: number;
  categoria: 'Diaria' | 'Semanal' | 'Mensal' | 'Trimestral' | 'Semestral';
}

export const CHECKLIST_PADRAO: ItemChecklist[] = [
  {
    id: 'backup-diario',
    titulo: 'Conferir o backup diario',
    descricao: 'Verificar que o backup automatico (03:15) esta com status "ok" neste painel.',
    intervaloDias: 1,
    categoria: 'Diaria',
  },
  {
    id: 'monitorar-erros',
    titulo: 'Revisar erros do sistema',
    descricao: 'Conferir e-mail do Sentry (se ativo) e alertas registrados do Firebase.',
    intervaloDias: 1,
    categoria: 'Diaria',
  },
  {
    id: 'estoque-semana',
    titulo: 'Repor estoque',
    descricao: 'Repor itens em falta ou com estoque baixo (aba Alertas de Reposicao).',
    intervaloDias: 7,
    categoria: 'Semanal',
  },
  {
    id: 'pendentes-semana',
    titulo: 'Resolver pendencias',
    descricao: 'Aprovar/reprovar pedidos, depositos e novos familiares.',
    intervaloDias: 7,
    categoria: 'Semanal',
  },
  {
    id: 'chaves-credenciais',
    titulo: 'Revisar chaves e credenciais',
    descricao: 'Conferir .env (ex.: GEMINI_API_KEY), rotacionar se necessario e revisar restricao de referenciador no API Key (Google Cloud).',
    intervaloDias: 30,
    categoria: 'Mensal',
  },
  {
    id: 'backup-restauracao',
    titulo: 'Teste de restauracao',
    descricao: 'Restaurar o backup mais recente em um projeto de teste e conferir saldos/vendas (≈10 min). E o unico caminho para provar que o backup funciona.',
    intervaloDias: 30,
    categoria: 'Mensal',
  },
  {
    id: 'cota-plano',
    titulo: 'Revisar cota e plano do Firebase',
    descricao: 'Conferir uso em Firebase Console → Usage; relembrar o orcamento do plano Blaze (functions agendadas exigem Blaze).',
    intervaloDias: 30,
    categoria: 'Mensal',
  },
  {
    id: 'versao-app',
    titulo: 'Confirmar versao do app',
    descricao: 'Verificar se ha versao nova do PWA/Electron publicada para distribuir.',
    intervaloDias: 30,
    categoria: 'Mensal',
  },
  {
    id: 'limpeza-dados',
    titulo: 'Limpeza de dados antigos',
    descricao: 'Quando o armazenamento chegar a ~70% da cota, rodar a limpeza com backup (Configuracoes → Capacidade) e conferir o backup gerado.',
    intervaloDias: 90,
    categoria: 'Trimestral',
  },
  {
    id: 'auditoria-seguranca',
    titulo: 'Auditar regras e permissoes',
    descricao: 'Revisar Firestore rules e permissoes dos administradores apos mudancas de pessoal.',
    intervaloDias: 180,
    categoria: 'Semestral',
  },
];

export interface RealizacaoChecklist {
  realizadaEm?: string;
  por?: string;
}

export type EstadoChecklist = Record<string, RealizacaoChecklist>;

export interface ChecagemChecklist {
  item: ItemChecklist;
  realizadaEm: string | null;
  por: string | null;
  /** dias desde a ultima realizacao (null = nunca realizada) */
  diasAtraso: number | null;
  emDia: boolean;
}

export function computeChecklist(
  itens: ItemChecklist[],
  estado: EstadoChecklist | undefined,
  agora: Date = new Date(),
): ChecagemChecklist[] {
  return itens.map((item) => {
    const r = estado?.[item.id];
    const realizadaEm = r?.realizadaEm || null;
    if (!realizadaEm) {
      return { item, realizadaEm: null, por: r?.por || null, diasAtraso: null, emDia: false };
    }
    const dias = diasDesde(realizadaEm, agora);
    return {
      item,
      realizadaEm,
      por: r?.por || null,
      diasAtraso: dias,
      emDia: dias !== null && dias <= item.intervaloDias,
    };
  });
}

/** N de checagens pendentes (nunca feitas ou fora do prazo). */
export function contagemPendencias(checagens: ChecagemChecklist[]): number {
  return checagens.filter((c) => !c.emDia).length;
}