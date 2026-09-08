import React, { useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/StoreContext';

// Banner de VENDAS OFFLINE: mostra a fila local de vendas feitas sem
// internet e permite sincronizá-las manualmente (a automática acontece
// quando a conexão volta). Vendas com erro de servidor (ex.: saldo
// insuficiente validado na sincronização) ficam destacadas para conferência.
export const OfflineSalesBanner: React.FC = () => {
  const { vendasOfflinePendentes, vendasOfflineComErro, sincronizarVendasOffline } = useApp();
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  if (vendasOfflinePendentes === 0 && vendasOfflineComErro === 0) return null;

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
        setResultado('Nenhuma venda sincronizada — verifique os erros abaixo.');
      } else {
        setResultado('Fila vazia — tudo em dia.');
      }
    } catch (e: any) {
      setResultado(e?.message || 'Falha ao sincronizar.');
    } finally {
      setSincronizando(false);
    }
  };

  const total = vendasOfflinePendentes + vendasOfflineComErro;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full rounded-2xl border p-4 shadow-lg flex flex-col gap-3 ${
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
            A sincronização acontece automaticamente quando a internet voltar; o servidor valida estoque, saldo e preço — vendas recusadas exigem conferência manual.
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

      {vendasOfflineComErro > 0 && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} className="text-red-300 shrink-0 mt-0.5" />
          <p className="text-[10px] font-bold text-red-200 leading-relaxed">
            {vendasOfflineComErro} venda(s) foi/foram recusada(s) na sincronização (saldo, estoque ou preço não validados no momento offline). Confira a fila em Configurações → Capacidade para resolver (estornar, ajustar saldo e tentar novamente).
          </p>
        </div>
      )}

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