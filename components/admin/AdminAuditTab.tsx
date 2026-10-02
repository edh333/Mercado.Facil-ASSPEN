import React from 'react';
import { ShieldCheck, AlertTriangle, Loader2, RefreshCw, ChevronDown, Info, CheckCircle2, Clock } from 'lucide-react';
import { useApp } from '../../context/StoreContext';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Achado {
  regra: string;
  severidade: 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';
  operador?: string;
  alvo?: string;
  quantidade?: number;
  titulo: string;
  detalhe: string;
  evidencia?: any[];
}

interface Auditoria {
  id: string;
  data: string;
  geradoEm?: string;
  ok?: boolean;
  erro?: string;
  resumo?: { CRITICO: number; ALTO: number; MEDIO: number; BAIXO: number; total: number };
  achados?: Achado[];
  volume?: { auditLogs: number; pedidos: number; sessoes: number };
}

const TONS: Record<string, { chip: string; card: string; barra: string; label: string }> = {
  CRITICO: { chip: 'bg-red-500/15 text-red-300 border-red-500/30', card: 'border-red-500/30', barra: 'bg-red-500', label: 'Crítico' },
  ALTO: { chip: 'bg-orange-500/15 text-orange-300 border-orange-500/30', card: 'border-orange-500/25', barra: 'bg-orange-500', label: 'Alto' },
  MEDIO: { chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30', card: 'border-amber-500/20', barra: 'bg-amber-500', label: 'Médio' },
  BAIXO: { chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30', card: 'border-slate-500/20', barra: 'bg-slate-500', label: 'Baixo' },
};

const ROTULOS_REGRA: Record<string, string> = {
  ESTORNO_EM_RAJADA: 'Estornos em rajada',
  VENDA_SEM_SESSAO_CAIXA: 'Venda em dinheiro sem caixa',
  DIVERGENCIA_CAIXA_RECORRENTE: 'Divergência de caixa recorrente',
  DEPOSITO_OSCILANTE: 'Depósito aprovado e recusado',
  VENDA_ABAIXO_DO_CUSTO: 'Venda abaixo do custo',
  CREDITO_MANUAL_ELEVADO: 'Crédito manual elevado',
};

const hhmm = (iso: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

const CartaoAchado: React.FC<{ achado: Achado }> = ({ achado }) => {
  const [aberto, setAberto] = React.useState(false);
  const tom = TONS[achado.severidade] || TONS.BAIXO;
  const temEvidencia = Array.isArray(achado.evidencia) && achado.evidencia.length > 0;

  return (
    <div className={`rounded-2xl border ${tom.card} bg-[var(--bg-card)] overflow-hidden`}>
      <button
        onClick={() => temEvidencia && setAberto(a => !a)}
        className={`w-full text-left p-4 flex items-start gap-3 ${temEvidencia ? 'hover:bg-[var(--bg-main)]/50 cursor-pointer' : 'cursor-default'}`}
      >
        <span className={`w-1 self-stretch rounded-full shrink-0 ${tom.barra}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${tom.chip}`}>{tom.label}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{ROTULOS_REGRA[achado.regra] || achado.regra}</span>
          </div>
          <p className="text-sm font-black text-[var(--text-main)] mt-1.5 leading-snug">{achado.titulo}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{achado.detalhe}</p>
        </div>
        {temEvidencia && (
          <ChevronDown size={16} className={`text-[var(--text-muted)] shrink-0 mt-1 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        )}
      </button>

      {aberto && temEvidencia && (
        <div className="px-4 pb-4 pt-1">
          <div className="rounded-xl border border-[var(--border-color)] overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-[10px]">
              <thead className="bg-[var(--bg-main)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                <tr>
                  {Object.keys(achado.evidencia![0] || {}).map((k) => (
                    <th key={k} className="p-2.5 whitespace-nowrap">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] font-mono">
                {achado.evidencia!.map((linha, i) => (
                  <tr key={i}>
                    {Object.entries(linha).map(([k, v]) => (
                      <td key={k} className="p-2.5 text-[var(--text-main)] whitespace-nowrap">
                        {k === 'quando' ? hhmm(String(v)) : String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminAuditTab: React.FC = () => {
  const { currentUser } = useApp();
  const [auditorias, setAuditorias] = React.useState<Auditoria[] | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState('');
  const [selecionada, setSelecionada] = React.useState<string>('');

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const fn = httpsCallable(getFunctions(), 'listarAuditorias');
      const res: any = await fn({ limite: 30 });
      const lista: Auditoria[] = (res.data && res.data.auditorias) || [];
      setAuditorias(lista);
      setSelecionada(prev => (prev && lista.some(a => a.id === prev) ? prev : (lista[0]?.id || '')));
    } catch (e: any) {
      setErro(String(e?.message || 'Não foi possível carregar as auditorias.').replace(/^\(.*?\)\s*/, ''));
      setAuditorias([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => { carregar(); }, [carregar, currentUser?.id]);

  const atual = (auditorias || []).find(a => a.id === selecionada) || null;
  const r = atual?.resumo;
  const criticos = r?.CRITICO || 0;
  const total = r?.total || 0;

  return (
    <div className="animate-slideUp space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2 tracking-tight">
            <ShieldCheck size={24} className="text-emerald-500"/> Auditoria de Anomalias
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1.5 max-w-2xl leading-relaxed">
            Roda todo dia às 5h e revisa o comportamento agregado das últimas 24h: estornos em rajada,
            dinheiro físico sem sessão de caixa, fechamentos que somem dinheiro, depósitos que
            oscilam, venda no prejuízo e crédito manual alto. <strong>Não bloqueia nada</strong> — só
            aponta o que fugiu do padrão.
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={carregando}
          className="shrink-0 px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-[var(--text-main)] text-[10px] font-black uppercase tracking-widest hover:bg-[var(--bg-main)] transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>

      {erro && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-red-400">Não foi possível carregar</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">{erro}</p>
          </div>
        </div>
      )}

      {carregando && !auditorias && (
        <div className="flex items-center justify-center gap-3 py-24 text-[var(--text-muted)] text-xs font-black uppercase tracking-widest">
          <Loader2 size={18} className="animate-spin" /> Carregando auditorias…
        </div>
      )}

      {!carregando && auditorias && auditorias.length === 0 && !erro && (
        <div className="bg-[var(--bg-card)] rounded-3xl border border-[var(--border-color)] p-20 text-center">
          <Clock size={40} className="mx-auto mb-4 text-[var(--text-muted)] opacity-40" />
          <p className="text-sm font-black uppercase tracking-widest text-[var(--text-main)]">Nenhuma auditoria registrada ainda</p>
          <p className="text-xs text-[var(--text-muted)] mt-2 max-w-md mx-auto leading-relaxed">
            A rotina roda uma vez por dia, às 5h (horário de São Paulo). O primeiro relatório aparece
            na manhã seguinte ao deploy.
          </p>
        </div>
      )}

      {auditorias && auditorias.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {auditorias.map(a => {
              const crit = a.resumo?.CRITICO || 0;
              const ativo = a.id === selecionada;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelecionada(a.id)}
                  className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${
                    ativo
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-main)] hover:bg-[var(--bg-main)]'
                  }`}
                >
                  {a.data}
                  {!a.ok && <AlertTriangle size={11} />}
                  {a.ok && crit > 0 && (
                    <span className={`px-1.5 rounded ${ativo ? 'bg-white/25' : 'bg-red-500/20 text-red-400'}`}>{crit}</span>
                  )}
                  {a.ok && crit === 0 && (a.resumo?.total || 0) === 0 && <CheckCircle2 size={11} />}
                </button>
              );
            })}
          </div>

          {atual && atual.ok === false && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-400">A auditoria de {atual.data} NÃO rodou</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Erro: {atual.erro || 'desconhecido'}. Sem o relatório, <strong>ausência de alertas não significa que está tudo bem</strong>.
                </p>
              </div>
            </div>
          )}

          {atual && atual.ok !== false && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'] as const).map(sev => {
                  const tom = TONS[sev];
                  const n = r?.[sev] || 0;
                  return (
                    <div key={sev} className={`rounded-3xl border p-5 ${tom.card} bg-[var(--bg-card)]`}>
                      <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${n > 0 ? tom.chip.split(' ')[1] : 'text-[var(--text-muted)]'}`}>{tom.label}</p>
                      <p className="text-3xl font-black text-[var(--text-main)] mt-2 tracking-tighter">{n}</p>
                    </div>
                  );
                })}
              </div>

              {atual.volume && (
                <div className="flex items-start gap-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4">
                  <Info size={15} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    Analisados <strong>{atual.volume.auditLogs}</strong> ações de auditoria,{' '}
                    <strong>{atual.volume.pedidos}</strong> pedidos e <strong>{atual.volume.sessoes}</strong>{' '}
                    sessões de caixa · gerado em {hhmm(atual.geradoEm || '')}
                  </p>
                </div>
              )}

              {total === 0 ? (
                <div className="bg-[var(--bg-card)] rounded-3xl border border-emerald-500/30 p-16 text-center">
                  <CheckCircle2 size={44} className="mx-auto mb-4 text-emerald-500" />
                  <p className="text-sm font-black uppercase tracking-widest text-[var(--text-main)]">Dia sem anomalias</p>
                  <p className="text-xs text-[var(--text-muted)] mt-2 max-w-md mx-auto leading-relaxed">
                    Nenhum padrão fora do normal nas últimas 24h.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(atual.achados || []).map((a, i) => <CartaoAchado key={`${a.regra}-${i}`} achado={a} />)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
