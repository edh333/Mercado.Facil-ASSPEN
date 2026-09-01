import React, { useState } from 'react';
import { Activity, ShieldCheck, ShieldAlert, HardDrive, Wifi, RefreshCw } from 'lucide-react';
import {
  executarManutencao,
  lerUltimoRelatorio,
  RelatorioManutencao,
} from '../../utils/maintenanceService';

/**
 * Cartão "Saúde do Sistema" (Configurações): mostra o resultado da
 * AUTO-MANUTENÇÃO que roda sozinha e permite executar sob demanda.
 */
export const SystemHealthCard: React.FC = () => {
  const [relatorio, setRelatorio] = useState<RelatorioManutencao | null>(() => lerUltimoRelatorio());
  const [rodando, setRodando] = useState(false);

  const rodarAgora = () => {
    setRodando(true);
    try {
      const r = executarManutencao(localStorage, true);
      setRelatorio(r);
    } finally {
      setRodando(false);
    }
  };

  const semAvisos = !relatorio || relatorio.avisos.length === 0;
  const dataFmt = relatorio
    ? new Date(relatorio.executadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={`relative overflow-hidden rounded-lg border p-5 md:p-6 shadow-sm transition-colors ${
      semAvisos ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/60'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`w-12 h-12 shrink-0 rounded-lg flex items-center justify-center text-white shadow-sm ${
            semAvisos ? 'bg-[#0f172a]' : 'bg-gradient-to-br from-amber-500 to-orange-500'
          }`}>
            {semAvisos ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
              Saúde do Sistema
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest ${
                semAvisos ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {semAvisos ? 'TUDO OK' : `${relatorio?.avisos.length} AVISO(S)`}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Auto-manutenção {dataFmt ? `executada em ${dataFmt}` : 'ainda não executada nesta instalação'} · repete sozinha 1x/dia + verificação a cada 6h
            </p>
          </div>
        </div>
        <button
          onClick={rodarAgora}
          disabled={rodando}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-60 shadow-md"
        >
          <RefreshCw size={14} className={rodando ? 'animate-spin' : ''} />
          Executar agora
        </button>
      </div>

      {relatorio && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {relatorio.saude.map((c) => (
            <div key={c.item} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-white/80 border border-slate-200/70">
              {c.item === 'Conectividade'
                ? <Wifi size={15} className={`mt-0.5 shrink-0 ${c.ok ? 'text-emerald-500' : 'text-slate-400'}`} />
                : c.item === 'Armazenamento local'
                  ? <HardDrive size={15} className={`mt-0.5 shrink-0 ${c.ok ? 'text-emerald-500' : 'text-red-500'}`} />
                  : <Activity size={15} className={`mt-0.5 shrink-0 ${c.ok ? 'text-emerald-500' : 'text-amber-500'}`} />}
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-800 leading-tight">{c.item}</p>
                <p className="text-[10px] font-semibold text-slate-500 leading-snug">{c.detalhe}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {relatorio && relatorio.avisos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {relatorio.avisos.map((a, i) => (
            <li key={i} className="text-[11px] font-bold text-amber-800 bg-amber-100/70 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
              {a}
            </li>
          ))}
        </ul>
      )}

      {relatorio && relatorio.limpezas.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer select-none text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors">
            Últimas ações automáticas ({relatorio.limpezas.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {relatorio.limpezas.map((l, i) => (
              <li key={i} className="text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-1.5">{l}</li>
            ))}
          </ul>
        </details>
      )}

      {relatorio && relatorio.usoArmazenamentoPct !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
            <span>Armazenamento local</span>
            <span>{relatorio.usoArmazenamentoPct}% de ~5 MB</span>
          </div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${relatorio.usoArmazenamentoPct > 80 ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.max(2, relatorio.usoArmazenamentoPct)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
