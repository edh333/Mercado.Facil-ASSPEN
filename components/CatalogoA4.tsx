import React from 'react';
import { formatarMoeda } from '../utils';
import { Product } from '../types';

interface CatalogoA4Props {
  products: Product[];
  config: any;
  showUnavailable?: boolean;
}

/**
 * CATÁLOGO A4 PARA OS INTERNOS ESCOLHEREM
 * Impresso pelo admin e entregue na unidade: produtos DISPONÍVEIS com o
 * VALOR DE VENDA de cada um e campo para marcar a quantidade desejada.
 * Preço exibido = preço praticado no dia (promoPrice quando existir).
 */
export const CatalogoA4: React.FC<CatalogoA4Props> = ({ products, config, showUnavailable = false }) => {
  const agora = new Date();
  const dataEmissao = agora.toLocaleDateString('pt-BR');
  const horaEmissao = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Somente o que o interno pode realmente pedir: disponível e com estoque.
  // Se showUnavailable=true, mostra todos (para debug/admin)
  const availableProducts = (products || []).filter(p => {
    if (showUnavailable) return true;
    return p.available !== false && (p.stock ?? 0) > 0;
  });

  const groupedProducts = availableProducts.reduce((acc, product) => {
    const cat = product.category || 'Diversos';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  const categories = Object.keys(groupedProducts).sort((a, b) => a.localeCompare(b));
  const instituicao = String(config?.institutionName || config?.appName || 'Mercado Fácil').toUpperCase();

  return (
    <div className="bg-white p-8 max-w-[210mm] w-full mx-auto text-slate-900 font-sans shadow-xl mb-8 print:shadow-none print:m-0 print:p-6 print:max-w-none print:w-full">
      {/* Cabeçalho institucional */}
      <div className="border-b-[6px] border-slate-900 pb-5 mb-6 flex justify-between items-end gap-6">
        <div className="min-w-0">
          <h1 className="text-[26px] font-black uppercase tracking-tighter leading-none">{instituicao}</h1>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-700 mt-2">
            Lista de Compras &mdash; Produtos Disponíveis e Valores
          </p>
          {(config?.cnpj || config?.contactPhone) && (
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
              {config?.cnpj ? `CNPJ: ${config.cnpj}` : ''}
              {config?.cnpj && config?.contactPhone ? ' · ' : ''}
              {config?.contactPhone ? `Tel: ${config.contactPhone}` : ''}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Emitido em</p>
          <p className="text-sm font-black text-slate-800 leading-none">{dataEmissao}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-1">às {horaEmissao}</p>
        </div>
      </div>

      {/* Instruções para o interno */}
      <div className="bg-slate-100 p-4 rounded-xl mb-7 border-l-8 border-slate-900 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-black text-base flex items-center justify-center shrink-0">?</div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-800">Como fazer seu pedido</p>
          <p className="text-[11px] font-semibold text-slate-600 mt-1 leading-snug">
            Escolha os produtos na lista abaixo e marque a quantidade desejada no quadrado à direita de cada item.
            Os valores estão em reais (R$). Confira seu saldo disponível antes de pedir &mdash; pedidos acima do saldo não são aceitos.
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {categories.map(category => {
          const itens = [...groupedProducts[category]].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
          return (
            <div key={category} className="break-inside-avoid">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-white bg-slate-900 px-4 py-2 rounded-md shadow-md inline-block">
                  {category}
                </h2>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {itens.length} {itens.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-px bg-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {/* Header da tabela */}
                <div className="grid grid-cols-[1fr,110px,80px] bg-slate-50 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-200">
                  <span>Descrição do Produto</span>
                  <span className="text-center">Valor de Venda</span>
                  <span className="text-center">Qtd.</span>
                </div>

                {itens.map(p => {
                  const temPromo = p.promoPrice !== undefined && Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.price);
                  const isUnavailable = p.available === false || (p.stock ?? 0) <= 0;
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr,110px,80px] items-center bg-white px-3 py-2.5 border-b border-slate-100 last:border-0 min-h-[46px] break-inside-avoid">
                      <div className="pr-4 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-black text-[11px] uppercase text-slate-900 leading-tight">{p?.name || 'Produto'}</p>
                        {isUnavailable && !showUnavailable && (
                          <span className="bg-red-100 text-red-700 text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Indisponível</span>
                        )}
                      </div>
                          {temPromo && (
                            <span className="bg-emerald-100 text-emerald-700 text-[7px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Oferta</span>
                          )}
                        </div>
                        {p?.brand && (
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{p.brand}</p>
                        )}
                      </div>
                      <div className="text-center tnum">
                        <p className={`font-black text-xs ${temPromo ? 'text-emerald-600' : 'text-slate-900'}`}>
                          R$ {formatarMoeda(temPromo ? Number(p.promoPrice) : Number(p.price))}
                        </p>
                        {temPromo && (
                          <p className="text-[8px] text-slate-400 line-through font-bold">R$ {formatarMoeda(Number(p.price))}</p>
                        )}
                      </div>
                      <div className="border-l border-slate-100 flex justify-center">
                        <div className="w-12 h-8 border-2 border-slate-300 rounded-md bg-slate-50"></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {categories.length === 0 && (
          <div className="text-center py-24 text-slate-300 font-black uppercase tracking-[0.2em] border-4 border-dashed border-slate-100 rounded-[3rem]">
            Nenhum produto disponível para escolha.
            <p className="text-[10px] font-normal text-slate-400 mt-2">
              Verifique se há produtos com estoque &gt; 0 e &gt; marcados como disponíveis.
            </p>
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="mt-14 pt-5 border-t-2 border-slate-100 flex justify-between items-center px-2 gap-4">
        <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
          © {agora.getFullYear()} {instituicao} · {availableProducts.length} {availableProducts.length === 1 ? 'produto disponível' : 'produtos disponíveis'}
        </span>
        <span className="text-[8px] font-black uppercase text-slate-300 tracking-wider text-right italic">
          Valores válidos somente para {dataEmissao} &mdash; sujeitos a alteração conforme estoque
        </span>
      </div>
    </div>
  );
};

export default CatalogoA4;
