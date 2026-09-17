import { describe, it, expect } from 'vitest';
import {
  computeMaintenanceAlerts,
  computeChecklist,
  contagemPendencias,
  diasDesde,
  LIMIARES,
  CHECKLIST_PADRAO,
  alertasParaBanner,
} from '../utils/maintenanceAlerts';

const FIXO = new Date('2026-09-10T12:00:00Z');

describe('diasDesde', () => {
  it('retorna null para ausente ou invalido', () => {
    expect(diasDesde(null, FIXO)).toBe(null);
    expect(diasDesde(undefined, FIXO)).toBe(null);
    expect(diasDesde('', FIXO)).toBe(null);
    expect(diasDesde('data-invalida', FIXO)).toBe(null);
  });

  it('conta dias inteiros transcorridos', () => {
    expect(diasDesde('2026-09-10T10:00:00Z', FIXO)).toBe(0);
    expect(diasDesde('2026-09-09T12:00:00Z', FIXO)).toBe(1);
    expect(diasDesde('2026-09-03T12:00:00Z', FIXO)).toBe(7);
  });

  it('nao retorna negativo para datas futuras', () => {
    expect(diasDesde('2026-09-11T12:00:00Z', FIXO)).toBe(0);
  });
});

describe('computeMaintenanceAlerts — backup', () => {
  const base = {
    cotaCritica: false,
    monitoramentoAtivo: true,
    esgotados: 0,
    estoqueBaixo: 0,
    pedidosPendentes: 0,
    depositosPendentes: 0,
    usuariosPendentes: 0,
    now: FIXO,
  };

  it('critical quando nunca houve backup', () => {
    const alerts = computeMaintenanceAlerts({ ...base, maintenance: null });
    const b = alerts.find((a) => a.id === 'backup-nunca');
    expect(b?.nivel).toBe('critical');
    expect(b?.alvo).toBe('backup');
  });

  it('critical quando o ultimo backup falhou', () => {
    const alerts = computeMaintenanceAlerts({
      ...base,
      maintenance: { lastBackup: '2026-09-09T03:15:00Z', lastBackupStatus: 'erro', lastBackupFile: 'backups/x.json' },
    });
    expect(alerts.find((a) => a.id === 'backup-erro')?.nivel).toBe('critical');
  });

  it('critical quando o backup tem 7 dias ou mais', () => {
    const alerts = computeMaintenanceAlerts({ ...base, maintenance: { lastBackup: '2026-09-03T03:15:00Z' } });
    expect(alerts.find((a) => a.id === 'backup-vencido')?.nivel).toBe('critical');
  });

  it('warning quando o backup tem entre 2 e 6 dias', () => {
    const alerts = computeMaintenanceAlerts({ ...base, maintenance: { lastBackup: '2026-09-08T03:15:00Z' } });
    const b = alerts.find((a) => a.id === 'backup-atencao');
    expect(b?.nivel).toBe('warning');
    expect(b?.titulo).toContain('2 dias');
  });

  it('silencioso quando o backup e de ontem', () => {
    const alerts = computeMaintenanceAlerts({ ...base, maintenance: { lastBackup: '2026-09-09T03:15:00Z' } });
    expect(alerts.some((a) => a.id.startsWith('backup'))).toBe(false);
  });

  it('respeita os limiares exportados (aviso/critico)', () => {
    const dataAviso = new Date(FIXO);
    dataAviso.setDate(dataAviso.getDate() - LIMIARES.backupAlertaDias);
    const dataCritico = new Date(FIXO);
    dataCritico.setDate(dataCritico.getDate() - LIMIARES.backupCriticoDias);
    const comAviso = computeMaintenanceAlerts({ ...base, maintenance: { lastBackup: dataAviso.toISOString() } });
    expect(comAviso.some((a) => a.id === 'backup-atencao')).toBe(true);
    const comCritico = computeMaintenanceAlerts({ ...base, maintenance: { lastBackup: dataCritico.toISOString() } });
    expect(comCritico.some((a) => a.id === 'backup-vencido')).toBe(true);
  });
});

describe('computeMaintenanceAlerts — demais sinais', () => {
  const base = {
    cotaCritica: false,
    monitoramentoAtivo: true,
    esgotados: 0,
    estoqueBaixo: 0,
    pedidosPendentes: 0,
    depositosPendentes: 0,
    usuariosPendentes: 0,
  };

  it('critical na cota atingida', () => {
    const alerts = computeMaintenanceAlerts({ ...base, cotaCritica: true, maintenance: {} });
    expect(alerts.find((a) => a.id === 'cota')?.nivel).toBe('critical');
  });

  it('info quando monitoramento desligado', () => {
    const alerts = computeMaintenanceAlerts({ ...base, monitoramentoAtivo: false, maintenance: {} });
    expect(alerts.find((a) => a.id === 'monitoramento')?.nivel).toBe('info');
  });

  it('warning para esgotados e pendentes; info para usuarios; baixo estoque suprimido quando ha esgotados', () => {
    const alerts = computeMaintenanceAlerts({
      ...base,
      maintenance: {},
      esgotados: 3,
      estoqueBaixo: 2,
      pedidosPendentes: 5,
      depositosPendentes: 1,
      usuariosPendentes: 4,
    });
    expect(alerts.find((a) => a.id === 'estoque-esgotados')?.nivel).toBe('warning');
    expect(alerts.find((a) => a.id === 'pedidos')?.nivel).toBe('warning');
    expect(alerts.find((a) => a.id === 'depositos')?.nivel).toBe('warning');
    expect(alerts.find((a) => a.id === 'usuarios')?.nivel).toBe('info');
    expect(alerts.find((a) => a.id === 'estoque-baixo')).toBeUndefined();
  });

  it('prioriza esgotados sobre baixo estoque', () => {
    const alerts = computeMaintenanceAlerts({ ...base, maintenance: {}, esgotados: 1, estoqueBaixo: 9 });
    expect(alerts.some((a) => a.id === 'estoque-esgotados')).toBe(true);
    expect(alerts.some((a) => a.id === 'estoque-baixo')).toBe(false);
  });

  it('ordena criticos antes de avisos, antes de info', () => {
    const alerts = computeMaintenanceAlerts({ ...base, maintenance: null, monitoramentoAtivo: false, esgotados: 1 });
    const niveis = alerts.map((a) => a.nivel);
    const idx = (n: 'critical' | 'warning' | 'info') => niveis.lastIndexOf(n);
    expect(idx('critical')).toBeLessThan(idx('warning'));
    expect(idx('warning')).toBeLessThan(idx('info'));
  });

  it('gera aviso com alerta severo recente do Firebase', () => {
    const alerts = computeMaintenanceAlerts({
      ...base,
      maintenance: {
        lastFirebaseAlert: { tipo: 'performance', severidade: 'ERROR', titulo: 'Sessao lentissima', criadoEm: '2026-09-09T12:00:00Z' },
      },
    });
    const a = alerts.find((x) => x.id === 'firebase-alert');
    expect(a?.nivel).toBe('warning');
    expect(a?.titulo).toContain('Sessao lentissima');
  });
});

describe('checklist', () => {
  const agora = new Date('2026-09-10T12:00:00Z');

  it('item nunca realizado fica pendente', () => {
    const checagens = computeChecklist(CHECKLIST_PADRAO, undefined, agora);
    expect(checagens.length).toBe(CHECKLIST_PADRAO.length);
    expect(checagens.every((c) => !c.emDia && c.diasAtraso === null)).toBe(true);
  });

  it('item realizado dentro do intervalo fica em dia', () => {
    const checagens = computeChecklist(CHECKLIST_PADRAO, {
      'backup-diario': { realizadaEm: '2026-09-10T03:30:00Z', por: 'mestre' },
    }, agora);
    const c = checagens.find((x) => x.item.id === 'backup-diario');
    expect(c?.emDia).toBe(true);
    expect(c?.por).toBe('mestre');
    expect(c?.diasAtraso).toBe(0);
  });

  it('item mensal realizado ha 31 dias fica vencido', () => {
    const checagens = computeChecklist(
      [{ id: 'mensal', titulo: 'T', descricao: 'D', intervaloDias: 30, categoria: 'Mensal' }],
      { mensal: { realizadaEm: '2026-08-09T12:00:00Z', por: 'm' } },
      agora,
    );
    const c = checagens.find((x) => x.item.id === 'mensal');
    expect(c?.emDia).toBe(false);
    expect(c?.diasAtraso).toBe(32);
  });

  it('contagemPendencias conta nao-em-dia', () => {
    const checagens = computeChecklist(CHECKLIST_PADRAO, {
      'backup-diario': { realizadaEm: new Date(agora.getTime() - 86400000).toISOString() },
      'estoque-semana': { realizadaEm: '2026-01-01T12:00:00Z' },
    }, agora);
    expect(contagemPendencias(checagens)).toBe(CHECKLIST_PADRAO.length - 1);
  });

  it('a rotina padrao cobre todas as cadencias criticas', () => {
    const categorias = new Set(CHECKLIST_PADRAO.map((i) => i.categoria));
    expect(categorias.has('Diaria')).toBe(true);
    expect(categorias.has('Semanal')).toBe(true);
    expect(categorias.has('Mensal')).toBe(true);
    expect(categorias.has('Trimestral')).toBe(true);
    const ids = CHECKLIST_PADRAO.map((i) => i.id);
    expect(ids).toContain('backup-restauracao');
    expect(ids).toContain('chaves-credenciais');
    expect(ids).toContain('cota-plano');
    expect(ids).toContain('limpeza-dados');
    expect(ids).toContain('auditoria-seguranca');
  });
});

describe('alertasParaBanner — só mostra quando realmente necessário', () => {
  const base = {
    cotaCritica: false,
    monitoramentoAtivo: true,
    esgotados: 0,
    estoqueBaixo: 0,
    pedidosPendentes: 0,
    depositosPendentes: 0,
    usuariosPendentes: 0,
    now: new Date('2026-09-10T12:00:00Z'),
  };

  it('mantém críticos (ex.: backup nunca feito)', () => {
    const alerts = computeMaintenanceAlerts({ ...base, maintenance: null });
    const b = alertasParaBanner(alerts);
    expect(b.some((a) => a.id === 'backup-nunca')).toBe(true);
    expect(b.every((a) => a.nivel === 'critical')).toBe(true);
  });

  it('mantém aviso de backup atrasado (infraestrutura)', () => {
    const alerts = computeMaintenanceAlerts({
      ...base,
      maintenance: { lastBackup: '2026-09-08T03:15:00Z' },
    });
    const b = alertasParaBanner(alerts);
    expect(b.some((a) => a.id === 'backup-atencao')).toBe(true);
  });

  it('exclui rotina (estoque/pedidos/depósitos/usuários) do banner', () => {
    const alerts = computeMaintenanceAlerts({
      ...base,
      maintenance: { lastBackup: '2026-09-09T03:15:00Z' },
      estoqueBaixo: 3,
      pedidosPendentes: 5,
      depositosPendentes: 1,
      usuariosPendentes: 4,
    });
    expect(alerts.length).toBeGreaterThan(0);
    expect(alertasParaBanner(alerts)).toEqual([]);
  });

  it('mantém cota crítica no banner', () => {
    const alerts = computeMaintenanceAlerts({ ...base, cotaCritica: true, maintenance: {} });
    expect(alertasParaBanner(alerts).some((a) => a.id === 'cota')).toBe(true);
  });
});