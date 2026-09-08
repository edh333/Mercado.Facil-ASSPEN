import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * CARREGAMENTO SOB DEMANDA do recharts (~395 kB).
 *
 * recharts é usado SOMENTE nos dashboards/BI do admin. Antes era importado
 * de forma estática e entrava no bundle inicial de TODOS os usuários
 * (inclusive familiares que nunca abrem um gráfico). Aqui o módulo só é
 * baixado quando o primeiro componente de gráfico é montado.
 *
 * ISSO NÃO é React.lazy/Suspense (bug React 19.2 #310 não se aplica): é um
 * import() de uma biblioteca comum, disparado por hook. A árvore de render
 * nunca é pausada — o componente mostra um esqueleto até o módulo chegar.
 */
type RechartsModule = typeof import('recharts');

let cache: RechartsModule | null = null;
let pendente: Promise<RechartsModule> | null = null;

export function carregarRecharts(): Promise<RechartsModule> {
  if (cache) return Promise.resolve(cache);
  if (!pendente) {
    pendente = import('recharts')
      .then((m) => { cache = m; return m; })
      .catch((e) => { pendente = null; throw e; });
  }
  return pendente;
}

export function useRecharts(): RechartsModule | null {
  const [mod, setMod] = useState<RechartsModule | null>(cache);
  useEffect(() => {
    let ativo = true;
    if (!cache) {
      carregarRecharts()
        .then((m) => { if (ativo) setMod(m); })
        .catch(() => { if (ativo) setMod(null); });
    }
    return () => { ativo = false; };
  }, []);
  return mod;
}

export const RechartsSkeleton: React.FC<{ minHeight?: number; label?: string }> = ({ minHeight = 288, label = 'Carregando gráfico...' }) => (
  <div style={{ minHeight }} className="flex flex-col items-center justify-center gap-3">
    <Loader2 className="animate-spin text-emerald-500" size={26} />
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
  </div>
);