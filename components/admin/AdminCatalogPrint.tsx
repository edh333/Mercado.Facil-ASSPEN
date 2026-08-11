import React from 'react';
import { formatarMoeda } from '../../utils';
import { Product, AppConfig } from '../../types';
import { Shield } from 'lucide-react';

interface AdminCatalogPrintProps {
  products: Product[];
  config: AppConfig;
}

export const AdminCatalogPrint: React.FC<AdminCatalogPrintProps> = ({ products, config }) => {
  const categories = Array.from(new Set((products || []).map(p => p.category || 'GERAL'))).sort();

  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="bg-white text-black p-12 w-[210mm] min-h-[297mm] mx-auto relative font-sans leading-relaxed box-border">

      {/* Moldura */}
      <div className="border-[6px] border-black h-full p-8 flex flex-col relative z-10">

        {/* Cabeçalho */}
        <div className="border-b-[6px] border-black pb-6 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Shield size={64} className="text-black" />
                <div>
                    <h1 className="text-2xl font-black uppercase leading-tight text-black">{config.institutionName}</h1>
                    <p className="text-sm font-bold text-black uppercase tracking-widest">{config.systemName}</p>
                </div>
            </div>
            <div className="text-right">
                <h2 className="text-3xl font-black uppercase text-black">CATÁLOGO OFICIAL</h2>
                <p className="text-sm font-bold text-black mt-1 uppercase tracking-tighter">TABELA DE PREÇOS • {today}</p>
            </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-black text-white p-4 rounded-lg mb-8 text-[12px] uppercase font-black leading-snug text-center">
            ATENÇÃO: OS PREÇOS E A DISPONIBILIDADE DOS PRODUTOS ESTÃO SUJEITOS A ALTERAÇÕES SEM AVISO PRÉVIO.
        </div>

        {/* Lista de Produtos por Categoria */}
        <div className="flex-1 space-y-10">
            {categories.map(cat => {
                const catProducts = (products || []).filter(p => (String(p.category || 'GERAL')).toUpperCase() === String(cat).toUpperCase() && p.available !== false);
                if (catProducts.length === 0) return null;

                return (
                    <div key={cat} className="break-inside-avoid">
                        <h3 className="bg-black text-white px-5 py-3 font-black text-sm uppercase tracking-[0.3em] mb-5 flex justify-between items-center rounded">
                            <span>{cat}</span>
                            <span className="text-[10px] opacity-80">{catProducts.length} ITENS</span>
                        </h3>
                        <div className="grid grid-cols-2 gap-x-12 gap-y-4">
                             {catProducts.map(p => (
                                <div key={p.id} className="flex justify-between items-center border-b-[3px] border-black pb-2">
                                    <div className="flex-1 pr-4">
                                        <p className="font-black text-[13px] uppercase text-black leading-tight">{p?.name || 'Produto'}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0 flex items-center gap-6">
                                        <p className="text-[10px] font-black bg-black text-white px-2 py-0.5 rounded uppercase">Estoque: {p?.stock || 0}</p>
                                        <p className="font-black text-lg text-black">R$ {formatarMoeda(p.price).replace('.', ',')}</p>
                                    </div>
                                </div>
                             ))}
                        </div>
                    </div>
                );
            })}
        </div>

        {/* Rodapé */}
        <div className="mt-16 pt-8 border-t-4 border-black flex justify-between items-end">
            <div className="text-[10px] font-black uppercase text-black tracking-widest">
                Gerado em {new Date().toLocaleString()} • {config.appName}
            </div>
            <div className="text-center px-12 border-t-2 border-black pt-2 min-w-[250px]">
                <p className="text-sm font-black uppercase text-black">Diretoria Administrativa</p>
                <p className="text-[10px] font-bold text-black uppercase tracking-widest">ASSPEN / MT</p>
            </div>
        </div>

        {/* Marca d'água */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] z-0">
            <Shield size={600} className="text-black" />
        </div>
      </div>
    </div>
  );
};
