import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Download, CheckCircle2, AlertTriangle, Loader2, Monitor, Globe, Rocket } from 'lucide-react';
import {
  verificarAtualizacao, abrirPaginaDownload, compararVersoes, InfoAtualizacao, URL_WEB_OFICIAL,
} from '../../utils/appVersion';
import { AppDownloadModal } from '../AppDownloadModal';

// Painel de atualização (Configurações → Atualização).
//
// Mostra a versão REAL instalada (do executável, via IPC) contra a versão
// publicada (manifest público) e oferece o download do instalador. No
// navegador, explica que a página é sempre servida na versão mais recente.
export const AdminUpdatePanel: React.FC = () => {
  const [info, setInfo] = useState<InfoAtualizacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mostrarDownload, setMostrarDownload] = useState(false);

  const verificar = useCallback(async () => {
    setCarregando(true);
    try {
      setInfo(await verificarAtualizacao());
    } catch {
      setInfo(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { verificar(); }, [verificar]);

  const publicada = info?.publicada?.version || '';
  const local = info?.versaoLocal || '';
  const temAtualizacao = !!info?.updateAvailable;
  const emDia = !!local && !!publicada && compararVersoes(local, publicada) >= 0;
  const dataPublicacao = info?.publicada?.releasedAt
    ? new Date(info.publicada.releasedAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
          <Rocket size={20} className="text-indigo-500" /> Atualização do Sistema
        </h3>
        <button
          onClick={verificar}
          disabled={carregando}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Verificar novamente
        </button>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <>
          {/* Versões */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-1">
                {info?.desktop ? <Monitor size={12} /> : <Globe size={12} />}
                {info?.desktop ? 'Versão instalada (desktop)' : 'Versão atual (web)'}
              </p>
              <p className="text-xl font-black text-slate-900">
                {info?.desktop ? (local ? `v${local}` : '—') : 'Sempre atualizada'}
              </p>
              {!info?.desktop && (
                <p className="text-[10px] font-bold text-slate-400 mt-1 leading-relaxed">
                  Você está usando a versão web, servida sempre na versão mais recente.
                </p>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Versão publicada mais recente
              </p>
              <p className="text-xl font-black text-slate-900">{publicada ? `v${publicada}` : '—'}</p>
              {dataPublicacao && (
                <p className="text-[10px] font-bold text-slate-400 mt-1">Publicada em {dataPublicacao}</p>
              )}
            </div>
          </div>

          {/* Status */}
          {temAtualizacao ? (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-amber-800 uppercase tracking-wide">
                  Atualização necessária
                </p>
                <p className="text-[11px] font-bold text-amber-700 leading-relaxed mt-1">
                  Seu aplicativo está na v{local}, mas já existe a v{publicada}. Baixe e instale o
                  novo instalador para receber as últimas correções.
                </p>
              </div>
            </div>
          ) : emDia ? (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
              <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
              <p className="text-xs font-black text-emerald-700 uppercase tracking-wide">
                Você está na versão mais recente
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <AlertTriangle size={20} className="text-slate-400 shrink-0" />
              <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                Não foi possível verificar a versão publicada agora (sem conexão ou manifest
                indisponível). Tente novamente em instantes.
              </p>
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setMostrarDownload(true)}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-500/30 transition-all"
            >
              <Download size={15} /> {temAtualizacao ? 'Baixar atualização' : 'Baixar aplicativo (Desktop)'}
            </button>
            <button
              onClick={() => abrirPaginaDownload(info?.publicada?.webUrl || URL_WEB_OFICIAL)}
              className="inline-flex items-center gap-2 px-4 py-3.5 bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
            >
              <Globe size={15} /> Abrir página de download
            </button>
          </div>
        </>
      )}

      {mostrarDownload && <AppDownloadModal onClose={() => setMostrarDownload(false)} />}
    </div>
  );
};
