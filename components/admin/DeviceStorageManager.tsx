import React, { useCallback, useEffect, useState } from 'react';
import { Database, HardDrive, RefreshCw, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';
import {
  formatarBytes,
  limparCachesLegados,
  limparTodosDadosLocais,
  medirArmazenamento,
  MetricaArmazenamento,
  ResultadoLimpeza,
} from '../../utils/deviceStorage';

export const DeviceStorageManager: React.FC = () => {
  const [metrica, setMetrica] = React.useState<MetricaArmazenamento | null>(null);
  const [medindo, setMedindo] = React.useState(false);
  const [limpandoCache, setLimpandoCache] = useState(false);
  const [confirmTotal, setConfirmTotal] = useState(false);
  const [limpezaTotal, setLimpezaTotal] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const medir = useCallback(async () => {
    setMedindo(true);
    try {
      setMetrica(await medirArmazenamento());
    } finally {
      setMedindo(false);
    }
  }, []);

  useEffect(() => {
    medir();
  }, [medir]);

  const handleLimparCache = async () => {
    if (limpandoCache) return;
    setLimpandoCache(true);
    setFeedback(null);
    try {
      const r = await limparCachesLegados();
      setFeedback('Caches antigos removidos (' + (r.cachesRemovidos.length || 'nenhum') + '). Reaberto limpo na proxima atualizacao.');
      await medir();
    } catch (e: any) {
      setFeedback('Falha na limpeza: ' + (e?.message || 'verifique o navegador.'));
    } finally {
      setLimpandoCache(false);
    }
  };

  const handleLimparTotal = async () => {
    if (limpezaTotal) return;
    setLimpezaTotal(true);
    try {
      const r: ResultadoLimpeza = await limparTodosDadosLocais();
      console.info('[DeviceStorageManager] limpeza total:', r);
      if (r.reiniciar) window.location.reload();
    } catch (e: any) {
      setFeedback('Falha ao limpar tudo: ' + (e?.message || 'tente novamente.'));
      setLimpezaTotal(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
            <HardDrive size={18} />
          </div>
          <div className="min-w-0">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">
              Armazenamento deste dispositivo
            </h4>
            <p className="text-[10px] font-bold text-[var(--text-muted)] mt-0.5">
              Cache, sessao, carrinho e arquivos temporarios gravados neste aparelho (navegador / PWA).
            </p>
          </div>
        </div>
        <button
          onClick={medir}
          disabled={medindo}
          className="shrink-0 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] text-[10px] font-black uppercase tracking-wider flex items-center gap-2 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50"
        >
          {medindo ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Medir
        </button>
      </div>

      {metrica && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-5">
          {[
            { rotulo: 'Uso total', valor: metrica.usadoBytes !== null ? formatarBytes(metrica.usadoBytes) : '--', extra: metrica.percentual !== null ? metrica.percentual + '%' : '--' },
            { rotulo: 'Chaves locais', valor: String(metrica.keysLocalStorage), extra: formatarBytes(metrica.bytesLocalStorage) },
            { rotulo: 'Caches (SW)', valor: String(metrica.cachesArmazenados), extra: 'versao atual: v17' },
            { rotulo: 'Service workers', valor: String(metrica.swRegistrados), extra: 'registrados' },
            { rotulo: 'Bancos IndexedDB', valor: String(metrica.bancosIdb.length), extra: metrica.bancosIdb.length > 0 ? metrica.bancosIdb.slice(0, 2).join(', ') : 'nenhum' },
            { rotulo: 'Comprovantes pendentes', valor: String(metrica.uploadsPendentes), extra: 'aguardando envio' },
          ].map((s) => (
            <div key={s.rotulo} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] px-3.5 py-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)]">{s.rotulo}</p>
              <p className="text-sm font-black text-[var(--text-main)] mt-1 tnum">{s.valor}</p>
              <p className="text-[8px] font-bold text-[var(--text-muted)] mt-0.5 truncate">{s.extra}</p>
            </div>
          ))}
        </div>
      )}

      {metrica?.usadoBytes !== null && metrica?.cotaBytes ? (
        <div className="mb-5">
          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
            <span>Espaco ocupado do navegador</span>
            <span>{formatarBytes(metrica.usadoBytes)} de {formatarBytes(metrica.cotaBytes)}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--border-color)] overflow-hidden">
            <div
              className={'h-full rounded-full transition-all ' + ((metrica.percentual || 0) > 90 ? 'bg-red-500' : (metrica.percentual || 0) > 70 ? 'bg-amber-500' : 'bg-emerald-500')}
              style={{ width: Math.max(2, Math.min(100, metrica.percentual || 0)) + '%' }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleLimparCache}
          disabled={limpandoCache}
          className="flex-1 px-4 py-3.5 rounded-2xl border-2 border-slate-200 bg-white text-slate-700 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-slate-50 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {limpandoCache ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Limpar caches antigos (leve)
        </button>
        <button
          onClick={() => setConfirmTotal(true)}
          className="flex-1 px-4 py-3.5 rounded-2xl border-2 border-red-200 bg-red-50 text-red-600 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-red-100 transition-all active:scale-[0.98]"
        >
          <Trash2 size={15} />
          Limpar TODOS os dados deste aparelho
        </button>
      </div>

      <p className="mt-3 text-[9px] font-bold text-[var(--text-muted)] leading-relaxed">
        <AlertTriangle size={11} className="inline -mt-0.5 mr-1 text-amber-500" />
        "Limpar caches" remove apenas versoes antigas do app (seguro e rapido). "Limpar TODOS" apaga sessao, carrinho,
        comprovantes pendentes e forca novo login — use so em troca de operador ou erro persistente.
      </p>

      {feedback && (
        <p className={'mt-3 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 ' + (feedback.indexOf('Falha') === 0 ? 'text-red-500' : 'text-emerald-600')}>
          <CheckCircle2 size={13} className={(feedback.indexOf('Falha') === 0 ? 'text-red-500' : 'text-emerald-500')} />
          {feedback}
        </p>
      )}

      <ConfirmacaoDestrutiva
        isOpen={confirmTotal}
        titulo="Limpar TODOS os dados locais"
        descricao="Serão apagados deste aparelho: sessão (você será desconectado), carrinho, preferências, caches, comprovantes pendentes e bancos locais. Nenhum dado do servidor é afetado — produtos, vendas, depósitos e usuários ficam intactos no sistema central. O aplicativo será recarregado para reentrar."
        palavraChave="LIMPAR TUDO"
        processando={limpezaTotal}
        onConfirm={handleLimparTotal}
        onClose={() => { if (!limpezaTotal) setConfirmTotal(false); }}
      />
    </section>
  );
};

export default DeviceStorageManager;