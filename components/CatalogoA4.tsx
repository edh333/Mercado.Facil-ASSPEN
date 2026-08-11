import React from 'react';
import { formatarMoeda } from '../utils';
import { Product } from '../types';

interface CatalogoA4Props {
  products: Product[];
  config: any;
}

export const CatalogoA4: React.FC<CatalogoA4Props> = ({ products, config }) => {
  const availableProducts = (products || []).filter(p => p.stock > 0 && p.available !== false);

  const groupedProducts = availableProducts.reduce((acc, product) => {
    const cat = product.category || 'Geral';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  const categories = Object.keys(groupedProducts).sort();

  return (
    <div className="bg-white p-8 max-w-[210mm] w-full mx-auto text-slate-900 font-sans shadow-xl mb-8 print:shadow-none print:m-0 print:p-8 print:max-w-none print:w-full">
      {/* Cabeçalho do Catálogo */}
      <div className="border-b-[6px] border-slate-900 pb-6 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-2">Catálogo de Produtos</h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em]">
            {config?.appName || 'Mercado Fácil'} • {new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Unidade Prisional</p>
          <div className="h-10 w-48 border-2 border-slate-200 rounded-lg flex items-center px-3 italic text-slate-300 text-[10px]">Espaço para carimbo/identificação</div>
        </div>
      </div>

      {/* Regras/Mensagem para Internos */}
      <div className="bg-slate-100 p-4 rounded-2xl mb-8 border-l-8 border-slate-900">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">Instruções para Pedido</p>
        <p className="text-xs font-bold text-slate-600 mt-1 uppercase leading-tight">Marque a quantidade desejada no campo à direita de cada item. Verifique seu saldo antes de solicitar.</p>
      </div>

      <div className="space-y-10">
        {categories.map(category => (
          <div key={category} className="break-inside-avoid">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white bg-slate-900 px-4 py-2 mb-4 rounded-md inline-block shadow-md">{category}</h2>

            <div className="grid grid-cols-1 gap-px bg-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {/* Header da Tabela */}
              <div className="grid grid-cols-[1fr,120px,80px] bg-slate-50 p-3 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
                <span>Descrição do Produto</span>
                <span className="text-center">Preço Unit.</span>
                <span className="text-center">QTD.</span>
              </div>

              {groupedProducts[category]
                .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
                .map(p => (
                <div key={p.id} className="grid grid-cols-[1fr,120px,80px] items-center bg-white p-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 min-h-[50px]">
                  <div className="pr-4">
                    <p className="font-black text-[11px] uppercase text-slate-900 leading-tight">{p?.name || 'Produto'}</p>
                    <div className="flex gap-2 items-center mt-1">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Estoque: {p?.stock || 0}</span>
                      {p?.promoPrice && <span className="bg-emerald-100 text-emerald-700 text-[7px] font-black px-1.5 py-0.5 rounded uppercase">Oferta</span>}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="font-black text-xs text-slate-900">R$ {formatarMoeda(p.price)}</p>
                    {p.promoPrice && <p className="text-[8px] text-slate-400 line-through">R$ {formatarMoeda(p.price)}</p>}
                  </div>
                  <div className="border-l border-slate-100 flex justify-center">
                    <div className="w-12 h-8 border-2 border-slate-300 rounded-md bg-slate-50"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {categories.length === 0 && (
          <div className="text-center py-24 text-slate-300 font-black uppercase tracking-[0.2em] border-4 border-dashed border-slate-100 rounded-[3rem]">
            Nenhum produto disponível para escolha.
          </div>
        )}
      </div>

      <div className="mt-16 pt-8 border-t-2 border-slate-100 text-[9px] font-black uppercase text-slate-400 tracking-widest text-center flex justify-between items-center px-4">
        <span>© {new Date().getFullYear()} Mercado Fácil System</span>
        <span className="bg-slate-50 px-4 py-1 rounded-full border border-slate-200 text-slate-300 italic">Página individual do catálogo prisional</span>
      </div>
    </div>
  );
};
