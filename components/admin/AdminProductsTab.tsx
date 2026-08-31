import React from 'react';
import {
  Package, Search, Grid, List, Plus, Upload, Trash2, Edit, ImageIcon, Printer, AlertTriangle, Check, RefreshCw
} from 'lucide-react';
import { formatarMoeda } from '../../utils';
import { toDate } from '../../utils/dateUtils';
import { Product, Supplier } from '../../types';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';
import { estoqueCritico } from './adminUtils';

interface AdminProductsTabProps {
  products: Product[];
  suppliers: Supplier[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  setShowProductModal: (show: boolean) => void;
  setEditingProduct: (product: Product | null) => void;
  deleteProduct: (id: string) => void;
  xmlFile: File | null;
  setXmlFile: (file: File | null) => void;
  handleImportXML: () => void;
  margin: string;
  setMargin: (m: string) => void;
  onPrintCatalog: () => void;
  mergeDuplicateProducts: () => Promise<void>;
  sanitizeCatalog: () => Promise<number>;
  handleResetStock: () => void;
  loadMoreProducts?: () => void;
  productsLimit?: number;
  previewXmlImport?: (file: File) => Promise<{ name: string; cost: number; qty: number }[]>;
}

export const AdminProductsTab: React.FC<AdminProductsTabProps> = ({
  products, suppliers, searchTerm, setSearchTerm, viewMode, setViewMode,
  setShowProductModal, setEditingProduct, deleteProduct,
  xmlFile, setXmlFile, handleImportXML, margin, setMargin, onPrintCatalog, mergeDuplicateProducts, sanitizeCatalog, handleResetStock, loadMoreProducts, productsLimit, previewXmlImport
}) => {
  const [categoryFilter, setCategoryFilter] = React.useState('ALL');
  const [supplierFilter, setSupplierFilter] = React.useState('ALL');
  const [confirmarEstoque, setConfirmarEstoque] = React.useState(false);
  const [xmlPreview, setXmlPreview] = React.useState<{ name: string; cost: number; qty: number }[]>([]);
  const [xmlPreviewLoading, setXmlPreviewLoading] = React.useState(false);

  // Ao selecionar um XML, lê a NFe e mostra o CUSTO de cada item.
  // O preço de venda é calculado AO VIVO com a margem digitada:
  // custo R$ 10 + margem 50% → venda R$ 15,00.
  React.useEffect(() => {
    if (!xmlFile || !previewXmlImport) { setXmlPreview([]); return; }
    let ativo = true;
    setXmlPreviewLoading(true);
    previewXmlImport(xmlFile)
      .then(items => { if (ativo) setXmlPreview(items || []); })
      .catch(() => { if (ativo) setXmlPreview([]); })
      .finally(() => { if (ativo) setXmlPreviewLoading(false); });
    return () => { ativo = false; };
  }, [xmlFile]);

  // MESMA normalização da gravação (StoreContext): inválida/negativa = 30%.
  // Antes o preview mostrava 0% e a importação gravava 30% — admin via um preço e o sistema lançava outro.
  const margemNum = parseFloat(margin);
  const margemPct = Number.isFinite(margemNum) && margemNum >= 0 ? margemNum : 30;
  const precoComMargem = (custo: number) => custo * (1 + margemPct / 100);

  const categories = React.useMemo(() => {
    const cats = new Set((products || []).map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  const stats = React.useMemo(() => {
    const all = products || [];
    return {
      total: all.length,
      available: all.filter(p => p.available !== false).length,
      stockOut: all.filter(p => (p.stock ?? 0) <= 0).length,
      lowStock: all.filter(p => estoqueCritico(p.stock, p.minStock) && (p.stock ?? 0) > 0).length
    };
  }, [products]);

  const filteredProducts = React.useMemo(() => {
    const termo = (searchTerm || '').toLowerCase();
    return (products || []).filter(p => {
      const matchSearch = (p.name || '').toLowerCase().includes(termo) ||
        (p.brand || '').toLowerCase().includes(termo) ||
        (p.category || '').toLowerCase().includes(termo) ||
        (p.barcode || '').toLowerCase().includes(termo) ||
        (p.ean || '').toLowerCase().includes(termo);
      const matchCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
      const matchSupplier = supplierFilter === 'ALL' || (p.supplierId || p.supplier) === supplierFilter;
      return matchSearch && matchCategory && matchSupplier;
    }).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [products, searchTerm, categoryFilter, supplierFilter]);

return (
    <div className="space-y-6 animate-slideUp pb-20">
      {/* Stats Board */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--bg-card)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-sm">
              <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1">Total de Itens</p>
              <p className="text-2xl font-black text-[var(--text-main)] tracking-tighter">{stats.total}</p>
          </div>
          <div className="bg-[var(--bg-card)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-emerald-500">
              <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1">Disponíveis</p>
              <p className="text-2xl font-black text-emerald-600 tracking-tighter">{stats.available}</p>
          </div>
          <div className="bg-[var(--bg-card)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-red-500">
              <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1">Esgotados</p>
              <p className="text-2xl font-black text-red-600 tracking-tighter">{stats.stockOut}</p>
          </div>
          <div className="bg-[var(--bg-card)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-amber-500">
              <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1 flex items-center gap-2">
                <AlertTriangle size={14}/> Estoque Baixo
              </p>
              <p className="text-2xl font-black text-amber-700 tracking-tighter">{stats.lowStock}</p>
              <p className="text-[10px] font-black text-slate-800 mt-1 uppercase">Produtos precisam reposição</p>
          </div>
      </div>

      {/* Main Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2 tracking-tight">
            <Package size={24} className="text-emerald-500"/> Catálogo de Produtos
          </h2>
          <div className="hidden sm:flex bg-[var(--bg-main)] rounded-xl p-1 border border-[var(--border-color)]">
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}><Grid size={18}/></button>
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}><List size={18}/></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <div className="flex items-center flex-1 md:min-w-[400px] bg-[var(--bg-card)] pl-4 pr-0 py-0 border-2 border-[var(--border-color)] focus-within:border-emerald-500 rounded-[2.5rem] transition-all shadow-inner">
            <div className="bg-[var(--bg-card)] p-2.5 rounded-xl border border-[var(--border-color)]">
              <Search size={18} className="text-[var(--text-muted)]" />
            </div>
            <input
              className="flex-1 py-4.5 pr-6 bg-transparent border-none outline-none font-black text-xs text-[var(--text-main)] placeholder:text-[var(--text-muted)] uppercase tracking-widest"
              placeholder="PESQUISAR NO CATÁLOGO..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border-2 border-[var(--border-color)] font-black text-[10px] uppercase tracking-widest bg-[var(--bg-card)] text-[var(--text-main)] font-semibold focus:border-emerald-500 outline-none"
          >
            <option value="ALL">Todas Categorias</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Supplier Filter */}
          <select
            value={supplierFilter}
            onChange={e => setSupplierFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border-2 border-[var(--border-color)] font-black text-[10px] uppercase tracking-widest bg-[var(--bg-card)] text-[var(--text-main)] font-semibold focus:border-emerald-500 outline-none"
          >
            <option value="ALL">Todos Fornecedores</option>
            {(suppliers || []).map(s => (
              <option key={s.id} value={s.id || s.name}>{s.name}</option>
            ))}
          </select>

          <button onClick={() => { setEditingProduct(null); setShowProductModal(true); }} className="bg-emerald-500 text-white px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95"><Plus size={18}/> Novo Produto</button>
        </div>
      </div>

      {/* Admin Utilities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* XML Import */}
          <div className="lg:col-span-8 bg-[var(--bg-card)] p-6 rounded-[2.5rem] border-2 border-dashed border-[var(--border-color)] shadow-sm">
            <h3 className="text-[10px] font-black uppercase text-[var(--text-main)] tracking-widest mb-4 flex items-center gap-2 opacity-60"><Upload size={16}/> Importação via XML (NFe)</h3>
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <label className="flex-1 w-full bg-[var(--bg-main)] border-2 border-dashed border-[var(--border-color)] p-4 rounded-2xl flex items-center justify-center gap-3 cursor-pointer hover:bg-[var(--bg-main)] transition-all group">
                <Upload className="text-[var(--text-muted)] group-hover:text-emerald-500" size={24}/>
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">{xmlFile ? xmlFile.name : 'Selecionar Arquivo .XML'}</span>
                <input type="file" className="hidden" accept=".xml" onChange={e => setXmlFile(e.target.files?.[0] || null)} />
              </label>
              <div className="w-full md:w-28 shrink-0">
                <span className="text-[10px] uppercase font-black block mb-1 text-[var(--text-main)] text-center">Margem (%)</span>
                <input
                  type="number"
                  min="0"
                  className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-2xl text-sm font-bold text-[var(--text-main)] text-center outline-none transition-all"
                  value={margin}
                  onChange={e => setMargin(e.target.value)}
                  placeholder="0"
                />
              </div>
<button onClick={handleImportXML} disabled={!xmlFile} className={`w-full md:w-auto px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2 ${!xmlFile ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:opacity-90'}`}>
                   <Check size={18}/> Processar NFe
               </button>
            </div>

            {/* PRÉVIA: custo detectado no XML → preço de venda com a margem digitada */}
            {xmlPreviewLoading && (
              <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Lendo NFe e conferindo preços...</p>
            )}
            {!xmlPreviewLoading && xmlPreview.length > 0 && (
              <div className="mt-4 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)] flex items-center gap-1.5">
                    <Check size={13} className="text-emerald-500"/> Prévia da Nota — {xmlPreview.length} itens detectados
                  </p>
                  <p className="text-[10px] font-bold text-slate-500">
                    Custo médio: <span className="font-black text-slate-700">{formatarMoeda(xmlPreview.reduce((s, i) => s + i.cost, 0) / xmlPreview.length)}</span>
                    {' · '}Margem {margemPct}% → <span className="font-black text-emerald-600">preço de venda abaixo</span>
                  </p>
                </div>
                <div className="overflow-x-auto max-h-56 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[var(--bg-main)]">
                      <tr className="text-left text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-[var(--border-color)]">
                        <th className="py-2 pr-2">Produto</th>
                        <th className="py-2 pr-2 text-right">Qtd</th>
                        <th className="py-2 pr-2 text-right">Custo Un.</th>
                        <th className="py-2 text-right text-emerald-600">Venda (+{margemPct}%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {xmlPreview.slice(0, 100).map((it, i) => (
                        <tr key={i} className="border-b border-[var(--border-color)]/50 last:border-0">
                          <td className="py-1.5 pr-2 font-bold text-[var(--text-main)] truncate max-w-[220px]">{it.name}</td>
                          <td className="py-1.5 pr-2 text-right font-bold text-slate-500">{it.qty}</td>
                          <td className="py-1.5 pr-2 text-right font-black text-[var(--text-main)]">{formatarMoeda(it.cost)}</td>
                          <td className="py-1.5 text-right font-black text-emerald-600">{formatarMoeda(precoComMargem(it.cost))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <button onClick={() => { if(confirm('Zerar preço/custo de TODOS os produtos com valor absurdo (>R$ 100 mil)? Use após NFe corrompida dar preços gigantescos.')) void sanitizeCatalog(); }} className="mt-3 w-full md:w-auto px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500 hover:text-white flex items-center justify-center gap-2">
                <AlertTriangle size={14}/> Sanitizar Preços Corrompidos
            </button>
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
              <button onClick={onPrintCatalog} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 hover:shadow-xl transition-all active:scale-95 group">
                  <div className="p-3 bg-[var(--bg-main)] rounded-2xl text-[var(--text-muted)] group-hover:text-emerald-500 transition-colors"><Printer size={20}/></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">Imprimir</span>
              </button>
              <button onClick={mergeDuplicateProducts} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 hover:shadow-xl transition-all active:scale-95 group">
                  <div className="p-3 bg-[var(--bg-main)] rounded-2xl text-[var(--text-muted)] group-hover:text-emerald-500 transition-colors"><RefreshCw size={20}/></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">Mesclar</span>
              </button>
              <button onClick={() => setConfirmarEstoque(true)} className="col-span-2 bg-red-500/5 border border-red-500/20 p-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-red-500 text-red-600 hover:text-white transition-all active:scale-95 group">
                  <AlertTriangle size={18}/>
                  <span className="text-[10px] font-black uppercase tracking-widest">Zerar Estoque Geral</span>
              </button>
          </div>
      </div>

      <ConfirmacaoDestrutiva
        isOpen={confirmarEstoque}
        titulo="Zerar Estoque de Todos os Produtos"
        descricao="Todos os produtos ficarão com estoque ZERO e desaparecerão da loja dos familiares até serem repostos. Esta ação NÃO pode ser desfeita."
        onConfirm={() => { setConfirmarEstoque(false); handleResetStock(); }}
        onClose={() => setConfirmarEstoque(false)}
      />

      {/* Grid / List of Products */}
      <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-sm overflow-hidden'}>
        {filteredProducts.length === 0 ? (
          <div className="col-span-full py-20 text-center opacity-70">
            <Package size={64} className="mx-auto mb-4"/>
            <p className="font-black uppercase tracking-[0.3em]">Nenhum produto em catálogo</p>
          </div>
        ) : filteredProducts.map(product => (
          <div key={product.id} className={`transition-all overflow-hidden ${viewMode === 'grid' ? 'bg-[var(--bg-card)] rounded-[2.5rem] shadow-sm border border-[var(--border-color)] hover:shadow-2xl hover:-translate-y-2 group flex flex-col relative' : 'flex flex-col sm:flex-row sm:items-center p-6 gap-6 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-main)]'}`}>
{/* Estoque Crítico - Borda de alerta */}
              {product?.stock > 0 && product?.stock <= (product.minStock || 5) && (
                <div className="absolute inset-0 rounded-[2.5rem] border-2 border-amber-400 pointer-events-none z-11 opacity-50"></div>
              )}
              {(product?.stock || 0) <= 0 && (
                <div className="absolute inset-0 rounded-[2.5rem] border-2 border-red-500 pointer-events-none z-11 opacity-50"></div>
              )}
              {(product?.stock || 0) <= 0 && (
                <div className="absolute inset-0 rounded-[2.5rem] border-2 border-red-500 pointer-events-none z-10 opacity-50"></div>
              )}

             {/* Thumbnail */}
             <div className={`${viewMode === 'grid' ? 'aspect-square relative overflow-hidden' : 'w-20 h-20 rounded-2xl flex-shrink-0 relative overflow-hidden bg-[var(--bg-main)]'}`}>
                <img src={product?.imageUrl || ''} className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${product?.available === false ? 'grayscale opacity-40' : ''}`} alt={product?.name || 'Produto'} onError={(e) => { const t = e.target as HTMLImageElement; t.onerror = null; t.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z%22/%3E%3Cline x1=%224%22 y1=%2222%22 x2=%2220%22 y2=%222%22/%3E%3C/svg%3E'; t.classList.add('opacity-40'); }} />
                {product.available === false && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] -rotate-12 border-2 border-white/30 px-3 py-1 rounded-xl shadow-2xl">Pausado</span>
                    </div>
                )}
                {(product?.stock || 0) <= 0 && product?.available !== false && (
                    <div className="absolute top-4 right-4 bg-red-600 text-white text-[10px] font-black px-3 py-1.5 rounded-xl shadow-lg uppercase tracking-widest animate-pulse">Esgotado</div>
                )}
             </div>

             {/* Details */}
             <div className={`flex-1 min-w-0 ${viewMode === 'grid' ? 'p-8 pt-6' : 'flex flex-col sm:flex-row sm:items-center gap-6'}`}>
<div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {!product.barcode && !product.ean ? (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20 flex items-center gap-1">
                        <AlertTriangle size={10}/> SEM CÓDIGO
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-[var(--bg-main)] text-[var(--text-muted)] border border-[var(--border-color)]">EAN: {product.barcode || product.ean || '—'}</span>
                    )}
                    {product.category && <span className="text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-tighter bg-emerald-500/10 text-emerald-700">{product.category}</span>}
                  </div>
                  {product.brand ? (
                    <div>
                      <p className={`font-black uppercase tracking-tight text-emerald-700 ${viewMode === 'grid' ? 'text-[11px] mb-0.5' : 'text-[10px] mb-0.5'}`}>{product.brand}</p>
                      <h4 className={`font-semibold text-[var(--text-muted)] tracking-tight truncate ${viewMode === 'grid' ? 'text-sm' : 'text-xs'}`}>{product?.name || 'Produto'}</h4>
                    </div>
                  ) : (
                    <h4 className={`font-black uppercase tracking-tight truncate text-[var(--text-main)] ${viewMode === 'grid' ? 'text-lg mb-1' : 'text-sm'}`}>{product?.name || 'Produto'}</h4>
                  )}
               </div>

                <div className={`flex items-center justify-between gap-6 ${viewMode === 'grid' ? 'mt-6 pt-6 border-t border-[var(--border-color)]' : 'w-full sm:w-auto sm:min-w-[300px]'}`}>
                    <div className="text-left">
                        <p className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Preço PDV</p>
                        <p className="font-black text-xl text-[var(--text-main)] tracking-tighter">
                            <span className="text-xs opacity-70 mr-0.5">R$</span>
                            {(() => {
                                // Mesma regra do servidor: promoPrice ativo é o preço praticado.
                                const efetivo = Number((product as any).promoPrice) > 0 ? Number((product as any).promoPrice) : Number(product.price || 0);
                                return efetivo > 0 ? formatarMoeda(efetivo) : '—';
                            })()}
                        </p>
                    </div>
                    <div className="text-center">
                        <p className="text-[10px] font-black uppercase text-[var(--text-muted)] mb-1">Estoque</p>
                        <div className="flex flex-col items-center">
                          <p className={`font-black text-lg ${(product.stock ?? 0) <= 0 ? 'text-red-600' : (product.stock ?? 0) <= (product.minStock || 5) ? 'text-amber-600' : 'text-[var(--text-main)]'}`}>
                              {product.stock ?? 0} <span className="text-[10px] font-bold text-[var(--text-muted)]">UN</span>
                          </p>
                          {(product.stock ?? 0) > 0 && (product.stock ?? 0) <= (product.minStock || 5) && (
                            <span className="text-[10px] font-black text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded mt-1 uppercase tracking-wider">Crítico</span>
                          )}
                          {(product.stock ?? 0) <= 0 && (
                            <span className="text-[10px] font-black text-white bg-red-600 px-2 py-0.5 rounded mt-1 uppercase tracking-wider">Esgotado</span>
                          )}
                        </div>
                        {product.lastSoldAt && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-1">Últ. venda: {product.lastSoldAt ? toDate(product.lastSoldAt)?.toLocaleDateString('pt-BR') || '—' : '—'}</p>
                        )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingProduct(product); setShowProductModal(true); }} className="p-3 bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-emerald-500 rounded-2xl border border-[var(--border-color)] shadow-sm active:scale-95 transition-all"><Edit size={18}/></button>
                      <button onClick={() => { if(confirm(`DESATIVAR ${product?.name || 'este produto'}? Ele deixará de aparecer nas vendas e no catálogo.`)) deleteProduct(product?.id); }} className="p-3 bg-red-500/5 text-red-500 hover:bg-red-600 hover:text-white rounded-2xl border border-red-500/20 shadow-sm active:scale-95 transition-all"><Trash2 size={18}/></button>
                    </div>
                </div>
             </div>
          </div>
        ))}
      </div>

      {loadMoreProducts && productsLimit && filteredProducts.length >= productsLimit && (
        <div className="flex justify-center mt-12 pb-10">
          <button
            onClick={loadMoreProducts}
            className="px-10 py-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] text-[var(--text-main)] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all shadow-sm active:scale-95 flex items-center gap-3"
          >
            <RefreshCw size={18} className="animate-spin-slow"/> Carregar Mais Produtos
          </button>
        </div>
      )}
    </div>
  );
};
