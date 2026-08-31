import React, { useState, useMemo, useCallback } from 'react';
import { Product } from '../../types';
import { Package, AlertTriangle, Search, ArrowUpDown, Printer } from 'lucide-react';
import { gerarListaReposicao, imprimirCupom } from '../../utils/printUtils';
import { estoqueCritico } from './adminUtils';

interface AdminStockAlertsTabProps {
  products: Product[];
  onEditProduct: (product: Product) => void;
}

export function AdminStockAlertsTab({ products, onEditProduct }: AdminStockAlertsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'minStock'>('stock');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const lowStockProducts = useMemo(() => {
    return (products || []).filter(p => estoqueCritico(p.stock, p.minStock));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    let list = lowStockProducts;
    if (term) {
      list = list.filter(p =>
        p.name?.toLowerCase().includes(term) ||
        p.brand?.toLowerCase().includes(term) ||
        p.barcode?.toLowerCase().includes(term) ||
        p.ean?.toLowerCase().includes(term)
      );
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '');
      else if (sortBy === 'stock') cmp = (a.stock ?? 0) - (b.stock ?? 0);
      else cmp = (a.minStock || 5) - (b.minStock || 5);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [lowStockProducts, searchTerm, sortBy, sortDir]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const outOfStock = filteredProducts.filter(p => (p.stock ?? 0) <= 0);
  const critical = filteredProducts.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= (p.minStock || 5));

  const handlePrintStockAlerts = () => {
    const itens = filteredProducts.map(p => {
      const min = p.minStock || 5;
      return {
        nome: p.name || 'Produto',
        estoque: p.stock ?? 0,
        minimo: min,
        qtdComprar: min - (p.stock ?? 0) + 1,
      };
    });
    const content = gerarListaReposicao(itens);
    imprimirCupom(content);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-black text-xl text-slate-900 tracking-tight flex items-center gap-3">
            <AlertTriangle size={24} className="text-amber-500" />
            Alertas de Reposição
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            {lowStockProducts.length} produto{lowStockProducts.length !== 1 && 's'} com estoque crítico
            {lowStockProducts.length > 0 && ` (${outOfStock.length} esgotado${outOfStock.length !== 1 && 's'}, ${critical.length} abaixo do mínimo)`}
          </p>
        </div>
        <button
          onClick={handlePrintStockAlerts}
          disabled={filteredProducts.length === 0}
          className="px-5 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 disabled:opacity-30"
        >
          <Printer size={16} /> Imprimir Lista de Reposição
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-2xl p-6 border border-red-200 shadow-sm">
          <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">Esgotados</p>
          <p className="text-3xl font-black text-red-700">{outOfStock.length}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-2xl p-6 border border-amber-200 shadow-sm">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Estoque Crítico</p>
          <p className="text-3xl font-black text-amber-700">{critical.length}</p>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl p-6 border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Total em Alerta</p>
          <p className="text-3xl font-black text-slate-700">{lowStockProducts.length}</p>
        </div>
      </div>

      {/* Search & Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-sm placeholder:text-slate-400 outline-none focus:border-emerald-500 transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => toggleSort('stock')} className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${sortBy === 'stock' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            <ArrowUpDown size={14} /> Estoque
          </button>
          <button onClick={() => toggleSort('name')} className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${sortBy === 'name' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            <ArrowUpDown size={14} /> Nome
          </button>
        </div>
      </div>

      {/* Product List */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-16 text-center">
          <Package size={48} className="mx-auto mb-4 text-emerald-400" />
          <p className="font-black text-slate-900 text-lg uppercase tracking-tight mb-1">Nenhum alerta!</p>
          <p className="text-slate-500 text-sm">Todos os produtos estão com estoque adequado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filteredProducts.map(p => {
              const isOut = (p.stock ?? 0) <= 0;
              const minStock = p.minStock || 5;
              return (
                <div key={p.id} className={`flex items-center gap-4 p-5 hover:bg-slate-50 transition-all ${isOut ? 'bg-red-50/50' : 'bg-amber-50/30'}`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isOut ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    <Package size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">{p.name || 'Produto'}</p>
                    {p.brand && <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">{p.brand}</p>}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className={`text-xs font-black ${isOut ? 'text-red-600' : 'text-amber-600'}`}>
                        Estoque: {p.stock ?? 0} UN
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Mínimo: {minStock} UN
                      </span>
                      {p.barcode && <span className="text-[10px] text-slate-400 font-mono">EAN: {p.barcode}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onEditProduct(p)}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl transition-all active:scale-95 shadow-sm uppercase tracking-wider shrink-0"
                  >
                    Repor
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
