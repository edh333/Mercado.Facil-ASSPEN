import React from 'react';
import {
  Package, Search, Grid, List, Plus, Upload, Trash2, Edit, ImageIcon, Printer, AlertTriangle, Check, RefreshCw, Download, Package as PackageIcon, Globe, Store, ShoppingCart
} from 'lucide-react';
import { formatarMoeda, normalizeName } from '../../utils';
import { toDate } from '../../utils/dateUtils';
import { Product, Supplier } from '../../types';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';

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
  previewXmlImport?: (file: File) => Promise<{ name: string; cost: number; qty: number; ean: string; brand: string }[]>;
  showStockEditModal: Product | null;
  setShowStockEditModal: (val: Product | null) => void;
}

export const AdminProductsTab: React.FC<AdminProductsTabProps> = ({
  products, suppliers, searchTerm, setSearchTerm, viewMode, setViewMode,
  setShowProductModal, setEditingProduct, deleteProduct,
  xmlFile, setXmlFile, handleImportXML, margin, setMargin, onPrintCatalog, mergeDuplicateProducts, sanitizeCatalog, handleResetStock, loadMoreProducts, productsLimit, previewXmlImport,
  showStockEditModal, setShowStockEditModal
}) => {
  const [categoryFilter, setCategoryFilter] = React.useState('ALL');
  const [supplierFilter, setSupplierFilter] = React.useState('ALL');
  const [channelFilter, setChannelFilter] = React.useState<'ALL' | 'both' | 'user' | 'admin'>('ALL');
  const [confirmarEstoque, setConfirmarEstoque] = React.useState(false);
  const [xmlPreview, setXmlPreview] = React.useState<{ name: string; cost: number; qty: number; ean: string; brand: string }[]>([]);
  const [xmlPreviewLoading, setXmlPreviewLoading] = React.useState(false);
  const [produtoParaExcluir, setProdutoParaExcluir] = React.useState<Product | null>(null);
  const [confirmarSanitizar, setConfirmarSanitizar] = React.useState(false);
  const [mesclando, setMesclando] = React.useState(false);
  const [modoListaSimples, setModoListaSimples] = React.useState(false);

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

  // Flag de duplicidade da prévia: mesmo critério da importação (EAN normalizado
  // ou nome canônico). Mostra se o item entra como NOVO ou ATUALIZA um produto.
  const ehExistente = React.useCallback((it: { name: string; ean?: string }) => {
    const ean = String(it.ean || '').replace(/^0+/, '').trim();
    if (ean) {
      const hit = (products || []).find(p => String(p.ean || p.barcode || '').replace(/^0+/, '').trim() === ean);
      if (hit) return hit;
    }
    const nomeKey = normalizeName(it.name);
    return (products || []).find(p => normalizeName(p.name || '') === nomeKey) || null;
  }, [products]);

  const resumoPreview = React.useMemo(() => {
    const existentes = xmlPreview.filter(i => ehExistente(i)).length;
    return { existentes, novos: xmlPreview.length - existentes, truncado: xmlPreview.length > 100 };
  }, [xmlPreview, ehExistente]);

  const categories = React.useMemo(() => {
    const cats = new Set((products || []).map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  const stats = React.useMemo(() => {
    const prods = products || [];
    return {
      total: prods.length,
      available: prods.filter(p => p.available !== false).length,
      stockOut: prods.filter(p => (p.stock ?? 0) <= 0).length,
      lowStock: prods.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5).length,
      channelUser: prods.filter(p => p.salesChannel === 'user').length,
      channelAdmin: prods.filter(p => p.salesChannel === 'admin').length,
      channelBoth: prods.filter(p => !p.salesChannel || p.salesChannel === 'both').length
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
      const matchChannel = channelFilter === 'ALL' || p.salesChannel === channelFilter || (!p.salesChannel && channelFilter === 'both');
      return matchSearch && matchCategory && matchSupplier && matchChannel;
    }).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  }, [products, searchTerm, categoryFilter, supplierFilter, channelFilter]);

  const printProductList = () => {
    const items = (products || [])
      .filter(p => p.available !== false)
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''));
    if (items.length === 0) return;
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = formatarMoeda;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const grouped = items.reduce((acc, p) => {
      const cat = p.category || 'Diversos';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {} as Record<string, typeof items>);
    const cats = Object.keys(grouped).sort();
    const rows = cats.map(cat => {
      const prods = grouped[cat].map(p => {
        const promo = Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.price);
        const precoFinal = promo ? Number(p.promoPrice) : Number(p.price);
        return `<tr><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-transform:uppercase;">${esc(p.name)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;">${esc(p.category || '')}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${(p.stock ?? 0)}</td><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:700;color:${promo ? '#059669' : '#0f172a'};">R$ ${fmt(precoFinal)}</td></tr>`;
      }).join('');
      return `<tr><td colspan="4" style="padding:10px 10px 4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;background:#f8fafc;border-bottom:2px solid #0f172a;">${esc(cat)} (${grouped[cat].length})</td></tr>${prods}`;
    }).join('');
    const totalValor = items.reduce((s, p) => {
      const promo = Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.price);
      return s + (promo ? Number(p.promoPrice) : Number(p.price)) * (p.stock ?? 0);
    }, 0);
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Lista de Produtos</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; color:#0f172a; padding:32px; background:#fff; }
    .cabecalho { border-bottom:3px solid #059669; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-end; }
    .cabecalho h1 { font-size:20px; text-transform:uppercase; letter-spacing:1px; color:#059669; }
    .cabecalho p { font-size:12px; color:#64748b; margin-top:4px; }
    .meta { text-align:right; font-size:11px; color:#64748b; }
    .cards { display:flex; gap:12px; margin-bottom:22px; }
    .card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
    .card .titulo { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; }
    .card .valor { font-size:18px; font-weight:800; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    thead th { background:#0f172a; color:#fff; padding:10px; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; }
    .assinatura { margin-top:48px; display:flex; justify-content:space-between; }
    .assinatura div { width:40%; border-top:1px solid #64748b; padding-top:8px; font-size:10px; text-transform:uppercase; text-align:center; color:#475569; }
    .rodape { margin-top:22px; text-align:center; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
    @media print { @page { size: A4; margin: 15mm 12mm; } body { padding:16px; } }
</style>
</head>
<body>
    <div class="cabecalho">
        <div>
            <h1>Lista de Produtos</h1>
            <p>Mercado Fácil — Gestão Penitenciária de Alta Performance</p>
        </div>
        <div class="meta">
            <p>Emitido em: <b>${hoje}</b></p>
            <p>${items.length} produtos · ${cats.length} grupos</p>
        </div>
    </div>
    <div class="cards">
        <div class="card"><p class="titulo">Produtos</p><p class="valor">${items.length}</p></div>
        <div class="card"><p class="titulo">Valor Total em Estoque (Venda)</p><p class="valor" style="color:#059669">R$ ${fmt(totalValor)}</p></div>
    </div>
    <table>
        <thead><tr><th>Produto</th><th>Grupo</th><th style="text-align:center;">Estoque</th><th style="text-align:right;">Preço Final</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="assinatura">
        <div>Emitido por: Administração</div>
        <div>Assinatura / Carimbo</div>
    </div>
    <p class="rodape">Documento gerado pelo sistema Mercado Fácil — lista de preços</p>
</body>
</html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const agrupadosSimples = React.useMemo(() => {
    const map: Record<string, Product[]> = {};
    (filteredProducts || []).forEach(p => {
      const cat = p.category || 'Diversos';
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    });
    return map;
  }, [filteredProducts]);

  const precoEfetivo = (p: Product) => {
    const promo = Number((p as any).promoPrice);
    return Number.isFinite(promo) && promo > 0 && promo < Number(p.price) ? promo : Number(p.price || 0);
  };

  const printSimpleList = () => {
    const items = (filteredProducts || []).filter(p => p.available !== false);
    if (items.length === 0) return;
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmt = formatarMoeda;
    const hoje = new Date().toLocaleDateString('pt-BR');
    const grouped: Record<string, Product[]> = {};
    items.forEach(p => {
      const cat = p.category || 'Diversos';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });
    const cats = Object.keys(grouped).sort();
    const totalValor = items.reduce((s, p) => s + precoEfetivo(p), 0);
    const rows = cats.map(cat => {
      const prods = grouped[cat].map(p => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-transform:uppercase;">${esc(p.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-size:12px;font-weight:700;">R$ ${fmt(precoEfetivo(p))}</td></tr>`).join('');
      return `<tr><td colspan="2" style="padding:8px 8px 4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#64748b;background:#f8fafc;border-bottom:1px solid #0f172a;">${esc(cat)} (${grouped[cat].length})</td></tr>${prods}`;
    }).join('');
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Lista Simplificada de Produtos</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif; color:#0f172a; padding:32px; background:#fff; }
    .cabecalho { border-bottom:3px solid #059669; padding-bottom:14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-end; }
    .cabecalho h1 { font-size:18px; text-transform:uppercase; letter-spacing:1px; color:#059669; }
    .cabecalho p { font-size:11px; color:#64748b; margin-top:3px; }
    .meta { text-align:right; font-size:11px; color:#64748b; }
    table { width:100%; border-collapse:collapse; }
    th { background:#0f172a; color:#fff; padding:8px; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; }
    th.pl { text-align:right; }
    .rodape { margin-top:18px; text-align:center; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
    @media print { @page { size: A4; margin: 14mm 12mm; } body { padding:14px; } }
</style>
</head>
<body>
    <div class="cabecalho">
        <div>
            <h1>Lista Simplificada de Produtos</h1>
            <p>Mercado Fácil — nomes e valores</p>
        </div>
        <div class="meta">
            <p>Emitido em: <b>${hoje}</b></p>
            <p>${items.length} produtos · Valor total R$ ${fmt(totalValor)}</p>
        </div>
    </div>
    <table>
        <thead><tr><th>Produto</th><th class="pl">Preço</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <p class="rodape">Documento gerado pelo sistema Mercado Fácil — lista de preços</p>
</body>
</html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  };

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
          <div className="bg-[var(--bg-card)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-blue-500">
              <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1 flex items-center gap-2"><Store size={14}/> Só Usuário</p>
              <p className="text-2xl font-black text-blue-600 tracking-tighter">{stats.channelUser}</p>
          </div>
          <div className="bg-[var(--bg-card)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-purple-500">
              <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1 flex items-center gap-2"><ShoppingCart size={14}/> Só PDV Admin</p>
              <p className="text-2xl font-black text-purple-600 tracking-tighter">{stats.channelAdmin}</p>
          </div>
          <div className="bg-[var(--bg-card)] p-5 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-amber-500">
              <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1 flex items-center gap-2">
                <AlertTriangle size={14}/> Estoque Baixo
              </p>
              <p className="text-2xl font-black text-amber-700 tracking-tighter">{stats.lowStock}</p>
              <p className="text-[10px] font-black text-slate-800 mt-1 uppercase">Produtos precisam reposição</p>
          </div>
      </div>
      {/* Canal de Vendas - 2ª linha */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[var(--bg-card)] p-4 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-emerald-500">
          <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1 flex items-center gap-2"><Globe size={14}/> Ambos (Usuário + PDV)</p>
          <p className="text-2xl font-black text-emerald-600 tracking-tighter">{stats.channelBoth}</p>
        </div>
        <div className="bg-[var(--bg-card)] p-4 rounded-[2rem] border border-[var(--border-color)] shadow-sm border-l-4 border-l-red-500">
          <p className="text-[10px] font-black uppercase text-slate-700 tracking-widest mb-1 flex items-center gap-2">Esgotados</p>
          <p className="text-2xl font-black text-red-600 tracking-tighter">{stats.stockOut}</p>
        </div>
      </div>

      {/* Main Header & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-[var(--text-main)] flex items-center gap-2 tracking-tight">
            <Package size={24} className="text-emerald-500"/> Catálogo de Produtos
          </h2>
          <div className="hidden sm:flex bg-[var(--bg-main)] rounded-xl p-1 border border-[var(--border-color)]">
            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' && !modoListaSimples ? 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}><Grid size={18}/></button>
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' && !modoListaSimples ? 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}><List size={18}/></button>
            <button
              onClick={() => setModoListaSimples(s => !s)}
              title="Lista simplificada (nomes e valores)"
              className={`p-2 px-3 rounded-lg transition-all flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${modoListaSimples ? 'bg-emerald-500 text-white shadow-sm' : 'text-[var(--text-muted)] hover:bg-[var(--bg-main)]'}`}
            >
              <Printer size={14}/> Lista
            </button>
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

          {/* Canal de Vendas Filter */}
          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value as 'ALL' | 'both' | 'user' | 'admin')}
            className="px-4 py-2.5 rounded-xl border-2 border-[var(--border-color)] font-black text-[10px] uppercase tracking-widest bg-[var(--bg-card)] text-[var(--text-main)] font-semibold focus:border-emerald-500 outline-none"
          >
            <option value="ALL">Todos Canais</option>
            <option value="both">Ambos (Usuário + PDV)</option>
            <option value="user">Só Usuário</option>
            <option value="admin">Só PDV Admin</option>
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
<button onClick={handleImportXML} disabled={!xmlFile || xmlPreviewLoading} className={`w-full md:w-auto px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-2 ${(!xmlFile || xmlPreviewLoading) ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:opacity-90 active:scale-95'}`}>
                   {xmlPreviewLoading ? <RefreshCw size={18} className="animate-spin"/> : <Check size={18}/>} {xmlPreviewLoading ? 'Lendo Nota...' : 'Processar NFe'}
               </button>
               {margin.trim() !== '' && margemPct !== parseFloat(margin) && (
                 <p className="mt-2 text-[10px] font-black uppercase tracking-wider text-amber-600">
                   Margem inválida — será usada 30% na importação.
                 </p>
               )}
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
                        <th className="py-2 pr-2 text-center">Situação</th>
                        <th className="py-2 pr-2 text-right">Qtd</th>
                        <th className="py-2 pr-2 text-right">Custo Un.</th>
                        <th className="py-2 text-right text-emerald-600">Venda (+{margemPct}%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {xmlPreview.slice(0, 100).map((it, i) => {
const existente = ehExistente(it);
                        return (
                        <tr key={i} className="border-b border-[var(--border-color)]/50 last:border-0">
                          <td className="py-1.5 pr-2 font-bold text-[var(--text-main)] truncate max-w-[220px]">{it.name}</td>
                          <td className="py-1.5 pr-2 text-center">
                            <span className={`inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${existente ? 'bg-amber-500/10 text-amber-700 border border-amber-500/30' : 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30'}`}>
                              {existente ? 'Atualiza' : 'Novo'}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-right font-bold text-slate-500">{it.qty}</td>
                          <td className="py-1.5 pr-2 text-right font-black text-[var(--text-main)]">{formatarMoeda(it.cost)}</td>
                          <td className="py-1.5 text-right font-black text-emerald-600">{formatarMoeda(precoComMargem(it.cost))}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {resumoPreview.truncado && (
                  <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Exibindo os 100 primeiros de {xmlPreview.length} itens — a importação processa a nota inteira.
                  </p>
                )}
              </div>
            )}
            <button onClick={() => setConfirmarSanitizar(true)} className="mt-3 w-full md:w-auto px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500 hover:text-white flex items-center justify-center gap-2">
                <AlertTriangle size={14}/> Sanitizar Preços Corrompidos
            </button>
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-4 grid grid-cols-3 gap-3">
              <button onClick={onPrintCatalog} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 hover:shadow-xl transition-all active:scale-95 group">
                  <div className="p-3 bg-[var(--bg-main)] rounded-2xl text-[var(--text-muted)] group-hover:text-emerald-500 transition-colors"><Printer size={20}/></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">Imprimir</span>
              </button>
              <button onClick={printProductList} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 hover:shadow-xl transition-all active:scale-95 group">
                  <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors"><Download size={20}/></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">Lista PDF</span>
              </button>
              <button onClick={async () => { if (mesclando) return; setMesclando(true); try { await mergeDuplicateProducts(); } finally { setMesclando(false); } }} disabled={mesclando} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-[2.5rem] flex flex-col items-center justify-center gap-3 hover:shadow-xl transition-all active:scale-95 group disabled:opacity-50">
                  <div className="p-3 bg-[var(--bg-main)] rounded-2xl text-[var(--text-muted)] group-hover:text-emerald-500 transition-colors">{mesclando ? <RefreshCw size={20} className="animate-spin"/> : <RefreshCw size={20}/>}</div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">{mesclando ? 'Mesclando...' : 'Mesclar'}</span>
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

      <ConfirmacaoDestrutiva
        isOpen={confirmarSanitizar}
        titulo="Sanitizar Preços Corrompidos"
        descricao="Zera preço/custo de TODOS os produtos com valor absurdo (>R$ 100 mil) para que voltem à loja com valor manual. Use após uma NFe corrompida gerar preços gigantescos."
        palavraChave="SANITIZAR"
        onConfirm={() => { setConfirmarSanitizar(false); void sanitizeCatalog(); }}
        onClose={() => setConfirmarSanitizar(false)}
      />

      <ConfirmacaoDestrutiva
        isOpen={!!produtoParaExcluir}
        titulo="Excluir Produto"
        descricao={produtoParaExcluir ? `${produtoParaExcluir.name?.toUpperCase() || 'Este produto'} será ARQUIVADO (removido do catálogo ativo). O histórico de vendas é preservado.` : ''}
        palavraChave="EXCLUIR"
        onConfirm={() => { if (produtoParaExcluir) deleteProduct(produtoParaExcluir.id); setProdutoParaExcluir(null); }}
        onClose={() => setProdutoParaExcluir(null)}
      />

      {/* View: Lista Simples / Grid / List */}
      {modoListaSimples ? (
        <div className="bg-[var(--bg-card)] rounded-[2.5rem] border border-[var(--border-color)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between gap-3 border-b border-[var(--border-color)]">
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-main)]">
              Lista Simplificada — {filteredProducts.length} itens
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={printSimpleList}
                className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all active:scale-95 flex items-center gap-1.5"
              >
                <Printer size={14}/> Imprimir
              </button>
            </div>
          </div>
          {filteredProducts.length === 0 ? (
            <div className="py-20 text-center opacity-70">
              <Package size={64} className="mx-auto mb-4"/>
              <p className="font-black uppercase tracking-[0.3em]">Nenhum produto em catálogo</p>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
              {Object.keys(agrupadosSimples).sort().map(cat => (
                <div key={cat}>
                  <p className="px-6 py-2.5 bg-[var(--bg-main)] border-b border-[var(--border-color)] text-[10px] font-black uppercase tracking-widest text-emerald-700 flex items-center justify-between">
                    <span>{cat} <span className="text-slate-400">({agrupadosSimples[cat].length})</span></span>
                  </p>
                  {agrupadosSimples[cat].map(p => {
                    const preco = precoEfetivo(p);
                    return (
                      <div key={p.id} className="px-6 py-3 flex items-center justify-between gap-3 border-b border-[var(--border-color)] last:border-0 hover:bg-[var(--bg-main)] transition-colors">
                        <p className={`text-sm font-black uppercase tracking-tight truncate ${p.available === false ? 'line-through opacity-40' : 'text-[var(--text-main)]'}`}>{p.name || 'Produto'}</p>
                        <p className="text-sm font-black text-[var(--text-main)] tracking-tighter shrink-0">
                          <span className="text-[10px] opacity-70 mr-0.5">R$</span>
                          {preco > 0 ? formatarMoeda(preco) : '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <div className="px-6 py-3 border-t border-[var(--border-color)] flex items-center justify-between gap-3 bg-[var(--bg-main)]">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Exibindo itens do filtro ativo
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Valor total calculado pela soma dos preços
            </p>
          </div>
        </div>
      ) : (
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
                      <button onClick={() => { setEditingProduct(product); setShowProductModal(true); }} aria-label="Editar produto" className="p-3 bg-[var(--bg-main)] text-[var(--text-muted)] hover:text-emerald-500 rounded-2xl border border-[var(--border-color)] shadow-sm active:scale-95 transition-all"><Edit size={18}/></button>
                      <button onClick={() => { setShowStockEditModal(product); }} aria-label="Editar estoque" className="p-3 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-2xl border border-blue-200 shadow-sm active:scale-95 transition-all"><PackageIcon size={18}/></button>
                      <button onClick={() => setProdutoParaExcluir(product)} aria-label="Excluir produto" className="p-3 bg-red-500/5 text-red-500 hover:bg-red-600 hover:text-white rounded-2xl border border-red-500/20 shadow-sm active:scale-95 transition-all"><Trash2 size={18}/></button>
                    </div>
                </div>
             </div>
          </div>
        ))}
      </div>
      )}

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
