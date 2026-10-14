import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Rocket } from 'lucide-react';
import { verificarAtualizacao, abrirPaginaDownload, InfoAtualizacao } from '../../utils/appVersion';

// Banner de ATUALIZAÇÃO do app desktop.
//
// Motivo: o executável NÃO se auto-atualiza. Um PC que ficasse numa build antiga
// continuava exibindo comportamento antigo (ex.: nome do familiar em vez do preso
// no PDV) e mais lento, enquanto o navegador — sempre atualizado — funcionava bem.
// O aviso automático do Electron é um diálogo que o operador pode dispensar; este
// banner fica visível DENTRO do app até a atualização ser feita, tornando a
// pendência impossível de ignorar.
//
// Só aparece no desktop (Electron) e somente quando há versão publicada mais nova.
export const UpdateBanner: React.FC = () => {
  const [info, setInfo] = useState<InfoAtualizacao | null>(null);
  const [dispensadoNaSessao, setDispensadoNaSessao] = useState(false);

  useEffect(() => {
    let ativo = true;
    verificarAtualizacao()
      .then((r) => { if (ativo) setInfo(r); })
      .catch(() => { /* sem rede/manifest — silencioso */ });
    return () => { ativo = false; };
  }, []);

  if (!info || !info.desktop || !info.updateAvailable || dispensadoNaSessao) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="w-full rounded-2xl border border-indigo-500/40 bg-indigo-950/95 backdrop-blur-xl p-4 shadow-lg flex items-center gap-3 mx-6 mt-4"
      >
        <div className="p-2.5 rounded-xl bg-indigo-500/15 shrink-0">
          <Rocket size={20} className="text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-xs uppercase tracking-widest text-indigo-200">
            Atualização disponível • v{info.versaoLocal} → v{info.publicada?.version}
          </p>
          <p className="text-[10px] font-bold text-indigo-200/80 leading-relaxed mt-0.5">
            Você está em uma versão antiga do aplicativo. Atualize para receber as últimas
            correções e melhorias de desempenho.
          </p>
        </div>
        <button
          onClick={() => abrirPaginaDownload(info.publicada?.webUrl)}
          className="shrink-0 px-4 py-2 bg-white text-indigo-900 rounded-xl font-black text-[10px] uppercase tracking-wider flex items-center gap-2 hover:bg-indigo-50 active:scale-95 transition-all"
        >
          <Download size={14} /> Atualizar agora
        </button>
        <button
          onClick={() => setDispensadoNaSessao(true)}
          title="Lembrar mais tarde"
          className="shrink-0 p-2 text-indigo-300/70 hover:text-white hover:bg-white/10 rounded-xl transition-all"
        >
          <X size={16} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
