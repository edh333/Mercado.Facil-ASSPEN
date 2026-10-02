import React, { useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Trash2, RotateCcw, ChevronDown, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/StoreContext';
import { formatarMoeda } from '../../utils';

// Banner de VENDAS OFFLINE: mostra a fila local de vendas feitas sem
// internet e permite sincronizá-las manualmente (a automática acontece
// quando a conexão volta, com backoff exponencial por venda).
//
// Este banner é TAMBÉM a tela de gestão da fila (achado A4): antes ele
// mandava o operador para "Configurações → Capacidade", uma tela que nunca
// teve gestão de fila — `limparErrosVendaOffline` era código morto. Agora cada
// venda com erro pode ser rearmeada (tentar de novo) ou descartada
// explicitamente, e as vendas 'ajustadas' (preço divergente na sincronização)
// aparecem para conferência — antes somem da interface sem nenhum registro.
export const OfflineSalesBanner: React.FC = () => {
  const {
    vendasOffline,
    vendasOfflinePendentes,
    vendasOfflineComErro,
    vendasOfflineAjustadas,
    sincronizarVendasOffline,
    rearmarVendaOffline,
    descartarVendaOffline,
  } = useApp();
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [expandido, setExpandido] = useState(false);

  if (vendasOfflinePendentes === 0 && vendasOfflineComErro === 0 && vendasOfflineAjustadas === 0) return null;

  const executar = async () => {
    if (sincronizando) return;
    setSincronizando(true);
    setResultado(null);
    try {
      const r = await sincronizarVendasOffline(true);
      if (r.offline) {
        setResultado('Você está offline — a sincronização será automática quando a internet voltar.');
      } else if (r.sincronizadas > 0) {
        setResultado(`${r.sincronizadas} venda(s) sincronizada(s).`);
      } else if (r.comErro > 0) {
        setResultado('Nenhuma venda sincronizada — confira os erros abaixo.');
      } else {
        setResultado('Fila vazia — tudo em dia.');
      }
    } catch (e: any) {
      setResultado(e?.message || 'Falha ao sincronizar.');
    } finally {
      setSincronizando(false);
    }
  };

  const comErro = vendasOffline.filter((v) => v.status === 'error');
  const ajustadas = vendasOffline.filter((v) => v.status === 'ajustada');
  const total = vendasOfflinePendentes + vendasOfflineComErro;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full rounded-2xl border p-4 shadow-lg flex flex-col gap-3 mx-6 mt-4 ${
        vendasOfflineComErro > 0
          ? 'bg-red-950/95 border-red-500/40'
          : 'bg-amber-950/95 border-amber-500/40'
      } backdrop-blur-xl`}
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/15 shrink-0">
          <CloudOff size={20} className="text-amber-400" />
        </div>
        <div className="flex-1">
          <p className={`font-black text-xs uppercase tracking-widest ${vendasOfflineComErro > 0 ? 'text-red-300' : 'text-amber-300'}`}>
            Vendas registradas sem internet: {total}
          </p>
          <p className="text-[10px] font-bold text-amber-200/80 leading-relaxed mt-0.5">
            {vendasOfflinePendentes > 0 && <>Aguardando sincronização: <b>{vendasOfflinePendentes}</b>. </>}
            {vendasOfflineComErro > 0 && <>Com erro (servidor recusou — ex.: saldo insuficiente): <b>{vendasOfflineComErro}</b>. </>}
            {ajustadas.length > 0 && <>Ajustadas pelo servidor (preço mudou): <b>{ajustadas.length}</b>. </>}
            A sincronização acontece automaticamente quando a internet voltar, com novas tentativas espaçadas.
          </p>
        </div>
        <button
          onClick={executar}
          disabled={sincronizando}
          className="shrink-0 px-4 py-2 bg-white text-amber-900 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 hover:bg-amber-50 active:scale-95 transition-all disabled:opacity-50"
        >
          {sincronizando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar agora
        </button>
      </div>

      {(vendasOfflineComErro > 0 || ajustadas.length > 0) && (
        <button
          onClick={() => setExpandido((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-200/90 hover:text-amber-100 transition-colors"
        >
          {expandido ? <ChevronDown size={14} /> : <ChevronDown size={14} className="-rotate-90" />}
          {expandido ? 'Ocultar' : 'Gerenciar'} fila ({comErro.length + ajustadas.length})
        </button>
      )}

      <AnimatePresence>
        {expandido && (comErro.length > 0 || ajustadas.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1"
          >
            {comErro.map((v) => (
              <div key={v.id} className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
                <AlertTriangle size={14} className="text-red-300 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-red-100">
                    {formatarMoeda(Number(v.total || 0))} · {v.items?.length || 0} item(ns) · {v.paymentMethod}
                  </p>
                  <p className="text-[10px] font-bold text-red-200/90 leading-relaxed break-words">
                    {v.error || 'Erro desconhecido.'}
                  </p>
                  <p className="text-[9px] font-bold text-red-300/60 mt-0.5">
                    {v.tryCount || 0} tentativa(s) · {new Date(v.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => rearmarVendaOffline(v.id)}
                    title="Tentar sincronizar novamente"
                    className="px-2 py-1.5 bg-white/10 hover:bg-white/20 text-red-100 rounded-lg font-black text-[9px] uppercase tracking-wider flex items-center gap-1"
                  >
                    <RotateCcw size={11} /> Reenviar
                  </button>
                  <button
                    onClick={() => descartarVendaOffline(v.id)}
                    title="Descartar venda irrecuperável (não será sincronizada)"
                    className="px-2 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-100 rounded-lg font-black text-[9px] uppercase tracking-wider flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Descartar
                  </button>
                </div>
              </div>
            ))}

            {ajustadas.map((v) => (
              <div key={v.id} className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5">
                <Scale size={14} className="text-amber-300 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-amber-100">
                    {formatarMoeda(Number(v.total || 0))} · {v.items?.length || 0} item(ns)
                  </p>
                  <p className="text-[10px] font-bold text-amber-200/90 leading-relaxed break-words">
                    {v.error || 'Valor ajustado na sincronização.'}
                  </p>
                </div>
                <button
                  onClick={() => descartarVendaOffline(v.id)}
                  title="Já foi contabilizada no servidor — confirmar que o caixa confere"
                  className="px-2 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 rounded-lg font-black text-[9px] uppercase tracking-wider flex items-center gap-1 shrink-0"
                >
                  <Trash2 size={11} /> Ok, conferi
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {resultado && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wider ${resultado.startsWith('Fila') || resultado.startsWith('0') ? 'text-emerald-300' : 'text-amber-300'}`}
          >
            <CheckCircle2 size={14} /> {resultado}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
