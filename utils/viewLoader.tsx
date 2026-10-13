import React, { useEffect, useState } from 'react';

/**
 * CARREGAMENTO SOB DEMANDA das TELAS pesadas (painel Admin / painel Usuário).
 *
 * NÃO é React.lazy e NÃO usa Suspense — é o MESMO padrão do
 * `utils/rechartsLoader` (import() dinâmico disparado por hook). O App.tsx
 * proíbe lazy/Suspense por causa do bug React 19.2 #310 ("Rendered more hooks
 * than during the previous render") que dispara em produção; aqui a árvore de
 * render NUNCA é suspensa: enquanto o chunk não chega o chamador renderiza um
 * loader, e o componente entra como um simples setState.
 *
 * Motivação: o bundle inicial de TODOS os acessos carregava o painel admin
 * inteiro (40+ componentes) E o painel do usuário, mesmo para quem nunca abre
 * aquele lado. Com o split, um familiar nunca baixa o admin, e um operador
 * nunca baixa o painel do usuário.
 */
export type AlvoView = {
  /** Chave de cache (estável por tela). */
  chave: string;
  /** Nome do export nomeado no módulo (ex.: 'AdminDashboard'). */
  exportName: string;
  /** import() dinâmico do módulo. */
  loader: () => Promise<any>;
} | null;

const cache = new Map<string, React.ComponentType<any>>();
const pendentes = new Map<string, Promise<React.ComponentType<any>>>();

function carregar(alvo: NonNullable<AlvoView>): Promise<React.ComponentType<any>> {
  const cacheado = cache.get(alvo.chave);
  if (cacheado) return Promise.resolve(cacheado);
  let p = pendentes.get(alvo.chave);
  if (!p) {
    p = alvo
      .loader()
      .then((m) => {
        const Comp = (m as any)?.[alvo.exportName] ?? (m as any)?.default;
        if (typeof Comp !== 'function') {
          throw new Error(`viewLoader: export "${alvo.exportName}" não encontrado em "${alvo.chave}".`);
        }
        cache.set(alvo.chave, Comp);
        return Comp;
      })
      .catch((e) => {
        pendentes.delete(alvo.chave);
        throw e;
      });
    pendentes.set(alvo.chave, p);
  }
  return p;
}

/**
 * Retorna o componente da tela alvo (já cacheado) ou `null` enquanto o chunk
 * não chegou. Rode SEMPRE no topo do componente (regra dos hooks).
 */
export function useView(alvo: AlvoView): React.ComponentType<any> | null {
  const [estado, setEstado] = useState<{ chave: string | null; Comp: React.ComponentType<any> | null }>(
    () => (alvo && cache.has(alvo.chave) ? { chave: alvo.chave, Comp: cache.get(alvo.chave)! } : { chave: null, Comp: null })
  );

  const chave = alvo?.chave ?? null;

  useEffect(() => {
    if (!alvo) return;
    const cacheado = cache.get(alvo.chave);
    if (cacheado) {
      setEstado((s) => (s.chave === alvo.chave ? s : { chave: alvo.chave, Comp: cacheado }));
      return;
    }
    let ativo = true;
    carregar(alvo)
      .then((Comp) => { if (ativo) setEstado({ chave: alvo.chave, Comp }); })
      .catch(() => { if (ativo) setEstado({ chave: alvo.chave, Comp: null }); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return alvo && estado.chave === alvo.chave ? estado.Comp : null;
}
