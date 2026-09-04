import React from 'react';
import { createPortal } from 'react-dom';
import {
  X, Check, Upload, ImageIcon, Barcode,
  MinusCircle, RefreshCw, Loader2, Lock, Package, Key, PlusCircle, Printer, KeyRound, ShieldCheck
} from 'lucide-react';
import { Product, Expense, Order } from '../../types';
import { compressImageFile, fileToBase64, normalizeName } from '../../utils';
import { ModalShell } from '../ui/ModalShell';
import { CupomEntrega } from '../CupomEntrega';
import { ReciboA4 } from '../ReciboA4';
import { gerarCupomEntregaRaw, baixarCupomTxt, abrirJanelaImpressao, imprimirComPrioridadeFiscal, imprimirHtmlSilencioso } from '../../utils/printUtils';

interface AdminModalsProps {
  showProductModal: boolean;
  setShowProductModal: (val: boolean) => void;
  editingProduct: Product | null;
  setEditingProduct: (val: Product | null) => void;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  products: Product[];

  showWithdrawalModal: any;
  setShowWithdrawalModal: (val: any) => void;
  withdrawalAmount: string;
  setWithdrawalAmount: (val: string) => void;
  withdrawalReason: string;
  setWithdrawalReason: (val: string) => void;
  withdrawalPassword: string;
  setWithdrawalPassword: (val: string) => void;
  handleWithdrawal: () => void;

  showRefundModal: Order | null;
  setShowRefundModal: (order: Order | null) => void;
  refundReason: string;
  setRefundReason: (val: string) => void;
  isProcessingRefund: boolean;
  handleRefundOrder: () => void;

  showAuthModal: boolean;
  setShowAuthModal: (val: boolean) => void;
  authPass: string;
  setAuthPass: (val: string) => void;
  handleAuthConfirm: () => void;

  viewingReceipt: any;
  setViewingReceipt: (val: any) => void;
  printOrder: Order | null;
  setPrintOrder: (val: Order | null) => void;
  settings: any;
}

export const AdminModals: React.FC<AdminModalsProps> = ({
  showProductModal, setShowProductModal, editingProduct, setEditingProduct,
  addProduct, updateProduct, products,
  showWithdrawalModal, setShowWithdrawalModal, withdrawalAmount, setWithdrawalAmount, withdrawalReason, setWithdrawalReason, withdrawalPassword, setWithdrawalPassword, handleWithdrawal,
  showRefundModal, setShowRefundModal, refundReason, setRefundReason, isProcessingRefund, handleRefundOrder,
  showAuthModal, setShowAuthModal, authPass, setAuthPass, handleAuthConfirm,
  viewingReceipt, setViewingReceipt, printOrder, setPrintOrder, settings
}) => {
  const [isProductLoading, setIsProductLoading] = React.useState(false);
  const [isAuthLoading, setIsAuthLoading] = React.useState(false);

  const handleRawPrint = () => {
    if (!printOrder) return;
    imprimirComPrioridadeFiscal({ type: 'CUPOM', data: printOrder }, settings).catch(console.error);
  };

  const handleBaixarTxt = () => {
    if (!printOrder) return;
    baixarCupomTxt(gerarCupomEntregaRaw(printOrder, settings), 'cupom-pdv');
  };

  const [productForm, setProductForm] = React.useState({
    name: '',
    brand: '',
    barcode: '',
    cost: '',
    margin: '30',
    stock: '0',
    minStock: '0',
    price: '',
    available: true,
    dynamicPrice: false,
    imageUrl: '',
    category: 'Geral'
  });

  React.useEffect(() => {
    if (showProductModal && editingProduct) {
      priceTouchedRef.current = false;
      const priceVal = editingProduct.price || 0;
      const costVal = editingProduct.costPrice || 0;
      const marginVal = editingProduct.margin || 30;
      setProductForm({
        name: editingProduct.name || '',
        brand: editingProduct.brand || '',
        barcode: editingProduct.barcode || editingProduct.ean || '',
        cost: costVal > 0 ? costVal.toString() : '',
        margin: marginVal.toString(),
        stock: (editingProduct.stock ?? 0).toString(),
        minStock: (editingProduct.minStock ?? 0).toString(),
        price: priceVal > 0 ? priceVal.toString() : '',
        available: editingProduct.available !== false,
        dynamicPrice: !!editingProduct.dynamicPrice,
        imageUrl: editingProduct.imageUrl || '',
        category: editingProduct.category || 'Geral'
      });
    } else if (showProductModal && !editingProduct) {
      priceTouchedRef.current = false;
      setProductForm({
        name: '',
        brand: '',
        barcode: '',
        cost: '',
        margin: '30',
        stock: '0',
        minStock: '0',
        price: '',
        available: true,
        dynamicPrice: false,
        imageUrl: '',
        category: 'Geral'
      });
    }
  }, [showProductModal, editingProduct]);

  // MARGEM MANDA NO PREÇO: mudar custo ou margem recalcula o preço de venda
  // NA HORA. Digitar o preço manualmente trava o valor (o admin decide).
  const priceTouchedRef = React.useRef(false);
  const recalcAutoPrice = (costStr: string, marginStr: string): string => {
    const c = parseFloat(String(costStr).replace(',', '.')) || 0;
    const m = parseFloat(String(marginStr).replace(',', '.'));
    if (!(c > 0) || !Number.isFinite(m) || m < 0) return '';
    return (c * (1 + m / 100)).toFixed(2);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name.trim()) return;
    const costNum = parseFloat(String(productForm.cost).replace(',', '.')) || 0;
    const marginNum = parseFloat(String(productForm.margin).replace(',', '.')) || 30;
    const stockNum = Math.round(parseFloat(String(productForm.stock).replace(',', '.'))) || 0;
    const priceNum = productForm.price
      ? parseFloat(String(productForm.price).replace(',', '.'))
      : costNum + (costNum * marginNum / 100);

    // Validação positiva: preço/custo não podem ser negativos (nem NaN/Infinity).
    const valoresValidos = [costNum, marginNum, stockNum, priceNum].every(v => Number.isFinite(v) && v >= 0);
    if (!valoresValidos || priceNum <= 0) {
      alert('Valores inválidos: o preço deve ser maior que zero e nenhum valor pode ser negativo.');
      return;
    }
    setIsProductLoading(true);
    try {

      const productData: Product = {
        id: editingProduct?.id || crypto.randomUUID(),
        name: (productForm.name || '').toUpperCase().trim(),
        brand: (productForm.brand || '').toUpperCase().trim(),
        ean: productForm.barcode || '',
        barcode: productForm.barcode || '',
        category: productForm.category || 'Geral',
        costPrice: costNum,
        price: parseFloat(priceNum.toFixed(2)),
        margin: marginNum,
        stock: stockNum,
        minStock: parseInt(productForm.minStock) || 0,
        imageUrl: productForm.imageUrl,
        available: productForm.available,
        dynamicPrice: productForm.dynamicPrice,
        supplierId: editingProduct?.supplierId || '',
        description: editingProduct?.description || '',
        weight: editingProduct?.weight || 'UN',
        restricted: editingProduct?.restricted || false
      };

      if (!editingProduct) {
        const barcode = (productForm.barcode || '').replace(/^0+/, '').trim();
        const nameNorm = normalizeName(productData.name);
        const duplicate = products.find(p => {
          if (p.id === productData.id) return false;
          const pBarcode = String(p.ean || p.barcode || '').replace(/^0+/, '').trim();
          if (barcode && pBarcode && barcode === pBarcode) return true;
          if (normalizeName(p.name || '') === nameNorm) return true;
          return false;
        });
        if (duplicate) {
          const reason = barcode ? `código de barras ${productForm.barcode}` : `nome "${productData.name}"`;
          if (!window.confirm(`Já existe um produto com ${reason}:\n\n${duplicate.name} (R$ ${duplicate.price?.toFixed(2)} | Estoque: ${duplicate.stock || 0})\n\nDeseja criar mesmo assim?`)) {
            setIsProductLoading(false);
            return;
          }
        }
      }

      if (editingProduct) {
        await updateProduct(productData);
      } else {
        await addProduct(productData);
      }
      setShowProductModal(false);
      setEditingProduct(null);
    } catch (error: any) {
      console.error('Erro ao salvar produto:', error);
    } finally {
      setIsProductLoading(false);
    }
  };

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        if (file.type.startsWith('image/')) {
          const compressed = await compressImageFile(file, 0.3, 600);
          const compressedFile = new File([compressed], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' });
          const base64 = await fileToBase64(compressedFile);
          setProductForm(prev => ({ ...prev, imageUrl: base64 }));
        } else {
          const base64 = await fileToBase64(file);
          setProductForm(prev => ({ ...prev, imageUrl: base64 }));
        }
      } catch (err) {
        console.error('Erro ao carregar imagem:', err);
      }
    }
  };

  const barcodeInputRef = React.useRef<HTMLInputElement>(null);
  const [scanAviso, setScanAviso] = React.useState<{ texto: string; tipo: 'azul' | 'amarelo' | 'verde' } | null>(null);

  // Busca um produto por código de barras (mesma regra do PDV: exato + sem zeros à esquerda)
  const buscarPorCodigo = React.useCallback((cod: string) => {
    const codLimpo = String(cod || '').trim();
    if (!codLimpo) return null;
    const normCod = (c: string) => String(c || '').replace(/^0+/, '').trim();
    const norm = normCod(codLimpo);
    return products.find(p =>
      String(p.barcode || '').trim() === codLimpo ||
      String(p.ean || '').trim() === codLimpo ||
      String(p.id) === codLimpo ||
      (norm && (normCod(p.barcode) === norm || normCod(p.ean) === norm))
    ) || null;
  }, [products]);

  // Processa um código escaneado OU digitado + Enter no campo:
  //  - Se o produto já existe, abre a EDIÇÃO dele (dados carregados automaticamente),
  //    evitando duplicidade no cadastro.
  //  - Se é um código novo, apenas preenche o campo para preencher os dados.
  const processarBarcode = React.useCallback((cod: string) => {
    const codLimpo = String(cod || '').trim();
    if (!codLimpo) return;
    const existente = buscarPorCodigo(codLimpo);
    if (existente) {
      if (!editingProduct) {
        setEditingProduct(existente);
        setScanAviso({ texto: `Produto já cadastrado — editando: ${existente.name}. Salve para atualizar.`, tipo: 'verde' });
      } else if (editingProduct.id === existente.id) {
        setScanAviso({ texto: 'Código já cadastrado neste produto — tudo pronto.', tipo: 'verde' });
      } else {
        setScanAviso({ texto: `Código pertence a outro produto: ${existente.name}. Abra a edição dele para alterar.`, tipo: 'amarelo' });
      }
    } else {
      setProductForm(prev => ({ ...prev, barcode: codLimpo }));
      setScanAviso({ texto: 'Código novo — preencha os dados e salve.', tipo: 'azul' });
    }
  }, [buscarPorCodigo, editingProduct, setEditingProduct]);

  React.useEffect(() => {
    if (!showProductModal) return;
    setScanAviso(null);
    let buffer = '';
    let lastKeyTime = Date.now();
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Se o foco está num campo de formulário, o campo processa (leitura manual);
      // o leitor de código de barras atua quando o foco está fora dos campos.
      const ehCampo = target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;
      if (ehCampo) return;
      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) buffer = '';
      lastKeyTime = currentTime;
      if (e.key === 'Enter') {
        if (buffer.length > 3) {
          processarBarcode(buffer);
          buffer = '';
          setTimeout(() => barcodeInputRef.current?.focus(), 50);
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showProductModal, processarBarcode]);

  return (
    <>
      {/* MODAL: PRODUTO PREMIUM */}
      {showProductModal && (
        <ModalShell
          open
          onClose={() => { setShowProductModal(false); setEditingProduct(null); }}
          title={editingProduct ? 'Editar Produto' : 'Novo Produto'}
          subtitle={editingProduct ? 'Atualize as informações do produto' : 'Cadastre um novo item no catálogo'}
          icon={<Package size={22} />}
          size="lg"
          footer={
            <>
              <button type="button" onClick={() => { setShowProductModal(false); setEditingProduct(null); }} className="flex-1 py-4 bg-white text-slate-700 font-bold rounded-xl hover:bg-slate-50 uppercase text-[11px] tracking-widest transition-all border border-slate-300 shadow-sm hover:shadow-md active:scale-[0.98]">Cancelar</button>
              <button type="submit" form="product-form" disabled={isProductLoading || !productForm.name.trim()} className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-3 uppercase text-[11px] tracking-widest transition-all px-6 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                {isProductLoading ? <Loader2 size={18} className="animate-spin"/> : <Check size={18} />}
                {editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto'}
              </button>
            </>
          }
        >
          <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 p-3 flex items-center justify-center gap-3 border-b border-emerald-500/20">
            <div className="relative flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Leitor de Código Ativo • Escaneie para Adicionar</span>
            </div>
          </div>

            <form onSubmit={handleProductSubmit} id="product-form" className="p-6 space-y-5">
               {/* TOP ROW: Image + Nome/Marca */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                   {/* IMAGE MANAGEMENT */}
                   <div className="md:col-span-1">
                       <div className="bg-white rounded-xl border-2 border-slate-200 p-4 space-y-3">
                           <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest block">Foto do Produto</label>
                           <div className="w-full aspect-square rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center relative group">
                               {productForm.imageUrl ? (
                                   <>
                                       <img src={productForm.imageUrl} className="w-full h-full object-contain p-2" alt="Preview" onError={(e) => { (e.target as HTMLImageElement).onerror = null; (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z%22/%3E%3Cline x1=%224%22 y1=%2222%22 x2=%2220%22 y2=%222%22/%3E%3C/svg%3E'; (e.target as HTMLImageElement).classList.add('opacity-30'); }} />
                                       <button
                                           type="button"
                                           onClick={() => setProductForm({...productForm, imageUrl: ''})}
                                           className="absolute top-1 right-1 bg-white/90 hover:bg-red-500 hover:text-white rounded-lg p-1.5 shadow-sm border border-slate-200 transition-all opacity-0 group-hover:opacity-100"
                                           title="Remover imagem"
                                       >
                                           <X size={14} />
                                       </button>
                                   </>
                               ) : (
                                   <ImageIcon size={36} className="text-slate-300" />
                               )}
                           </div>
                           {/* URL INPUT */}
                           <div>
                               <label className="text-slate-400 font-bold text-[9px] uppercase tracking-widest block mb-1">Link da Imagem (URL)</label>
                               <input
                                   type="text"
                                   className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-400 transition-all"
                                   placeholder="https://..."
                                   value={productForm.imageUrl || ''}
                                   onChange={e => setProductForm({...productForm, imageUrl: e.target.value})}
                               />
                           </div>
                           {/* UPLOAD BUTTON */}
                           <label className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 cursor-pointer transition-all text-[10px] font-bold uppercase tracking-widest">
                               <Upload size={14} />
                               Upload Arquivo
                               <input type="file" className="hidden" accept="image/*" onChange={handleProductImageUpload} />
                           </label>
                       </div>
                   </div>

                   {/* NOME + MARCA / CATEGORIA */}
                   <div className="md:col-span-2 space-y-4">
                       <PremiumInput
                           label="Nome do Produto"
                           value={productForm.name}
                           onChange={e => setProductForm({...productForm, name: e.target.value.toUpperCase()})}
                           placeholder="EX: SABONETE DOVE 90G"
                           required
                       />
                       <div className="grid grid-cols-2 gap-4">
                           <PremiumInput
                               label="Marca / Fabricante"
                               value={productForm.brand}
                               onChange={e => setProductForm({...productForm, brand: e.target.value.toUpperCase()})}
                               placeholder="EX: NESTLÉ, COCA-COLA..."
                           />
                           <div className="bg-white p-4 rounded-xl border-2 border-slate-200 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                               <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest block mb-2">Categoria</label>
                               <select
                                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 outline-none appearance-none cursor-pointer"
                                   value={productForm.category}
                                   onChange={e => setProductForm({...productForm, category: e.target.value})}
                               >
                                   <option value="Geral">Geral</option>
                                   <option value="Alimentos">Alimentos</option>
                                   <option value="Bebidas">Bebidas</option>
                                   <option value="Higiene">Higiene</option>
                                   <option value="Limpeza">Limpeza</option>
                                   <option value="Vestuário">Vestuário</option>
                                   <option value="Eletrônicos">Eletrônicos</option>
                                   <option value="Outros">Outros</option>
                               </select>
                           </div>
                       </div>
                   </div>
               </div>

               {/* MIDDLE ROW: Código EAN + Custo + Margem */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div className="space-y-1">
                       <div className="bg-white p-4 rounded-xl border-2 border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
                           <div className="flex justify-between items-center mb-2">
                               <label className="text-slate-700 font-black text-[10px] uppercase tracking-widest">Código de Barras (EAN)</label>
                               <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-wider">Leitor Ativo</span>
                           </div>
                           <input
                               ref={barcodeInputRef}
                               value={productForm.barcode}
                               onChange={e => { setProductForm({ ...productForm, barcode: e.target.value }); setScanAviso(null); }}
                               onKeyDown={e => {
                                   if (e.key === 'Enter') {
                                       e.preventDefault();
                                       processarBarcode(e.currentTarget.value);
                                   }
                               }}
                               placeholder="Escaneie ou digite o código"
                               className="w-full bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-sm outline-none px-4 py-2.5 placeholder:text-slate-400 transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                           />
                       </div>
                       <p className={`text-[9px] font-bold uppercase tracking-wider px-1 flex items-center gap-1 ${scanAviso?.tipo === 'verde' ? 'text-emerald-600' : scanAviso?.tipo === 'amarelo' ? 'text-amber-600' : 'text-blue-600'}`}>
                           <Barcode size={11}/> {scanAviso?.texto || 'Leitor ativo — aponte o leitor e escaneie (Enter)'}
                       </p>
                   </div>
                    <PremiumInput
                        label="Custo (R$)"
                        value={productForm.cost}
                        onChange={e => setProductForm(f => ({
                            ...f,
                            cost: e.target.value,
                            price: priceTouchedRef.current ? f.price : recalcAutoPrice(e.target.value, f.margin)
                        }))}
                        type="number"
                    />
                    <PremiumInput
                        label="Margem (%)"
                        value={productForm.margin}
                        onChange={e => setProductForm(f => ({
                            ...f,
                            margin: e.target.value,
                            price: priceTouchedRef.current ? f.price : recalcAutoPrice(f.cost, e.target.value)
                        }))}
                        type="number"
                    />
               </div>

               {/* BOTTOM ROW: Estoque + Estoque Mínimo + Preço */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <PremiumInput
                       label={editingProduct ? 'Estoque Atual' : 'Estoque Inicial'}
                       value={productForm.stock}
                       onChange={e => setProductForm({...productForm, stock: e.target.value})}
                       type="number"
                   />
                   <PremiumInput
                       label="Estoque Mínimo"
                       value={productForm.minStock}
                       onChange={e => setProductForm({...productForm, minStock: e.target.value})}
                       type="number"
                   />
                    <PremiumInput
                        label="Preço de Venda (R$)"
                        value={productForm.price}
                        onChange={e => { priceTouchedRef.current = true; setProductForm({...productForm, price: e.target.value}); }}
                        type="number"
                        placeholder="Ajusta sozinho pela margem — digite para travar"
                    />
               </div>

               {/* TOGGLES */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <ToggleSwitch
                       label="Produto Ativo"
                       sublabel="Visível para vendas"
                       checked={productForm.available !== false}
                       onChange={e => setProductForm({...productForm, available: e.target.checked})}
                   />
                   <ToggleSwitch
                       label="Preço Dinâmico"
                       sublabel="Definir valor na hora"
                       checked={!!productForm.dynamicPrice}
                       onChange={e => setProductForm({...productForm, dynamicPrice: e.target.checked})}
                   />
               </div>
            </form>
        </ModalShell>
      )}

      {/* MODAL: WALLET ADJUSTMENT PREMIUM */}
      {showWithdrawalModal && (
        <ModalShell
          open
          onClose={() => { setShowWithdrawalModal(null); setWithdrawalPassword(''); }}
          title={showWithdrawalModal.isDeposit ? 'Adicionar Crédito' : showWithdrawalModal.isRefund ? 'Estornar Valor' : 'Retirar Saldo'}
          subtitle={showWithdrawalModal.userName || undefined}
          icon={showWithdrawalModal.isDeposit ? <PlusCircle size={22}/> : showWithdrawalModal.isRefund ? <RefreshCw size={22}/> : <MinusCircle size={22}/>}
          size="sm"
        >
                   <div className="p-8 space-y-6">
                      <div className="bg-slate-100 p-5 rounded-2xl border border-slate-200">
                          <p className="text-[9px] font-black text-slate-400 uppercase mb-1 opacity-60">Beneficiário</p>
                          <p className="font-black text-slate-900 text-base uppercase tracking-tight truncate">{showWithdrawalModal.userName}</p>
                      </div>

<div className="space-y-5">
                            <div>
                                <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest mb-3 block">Valor (R$)</label>
                                <div className="relative group">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-slate-400 text-2xl">R$</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="w-full pl-16 pr-5 py-5 bg-slate-100 border-2 border-slate-200 group-focus-within:border-emerald-500 group-focus-within:ring-4 group-focus-within:ring-emerald-500/20 rounded-2xl font-black text-3xl text-slate-900 outline-none transition-all placeholder:text-slate-400"
                                      placeholder="0,00"
                                      value={withdrawalAmount}
                                      onChange={e => setWithdrawalAmount(e.target.value)}
                                      autoFocus
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest mb-3 block">Motivo / Observação</label>
                                <textarea
                                  className="w-full p-5 bg-slate-100 border-2 border-slate-200 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 rounded-2xl font-black text-slate-900 text-sm outline-none h-28 resize-none placeholder:text-slate-400 uppercase"
                                  placeholder="Descreva o motivo da operação..."
                                  value={withdrawalReason}
                                  onChange={e => setWithdrawalReason(e.target.value)}
                                ></textarea>
                            </div>
                            {(showWithdrawalModal.isDeposit || showWithdrawalModal.isRefund || !showWithdrawalModal.isDeposit && !showWithdrawalModal.isRefund) && (
                            <div>
                                <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest mb-3 block flex items-center gap-1.5">
                                  <Lock size={12}/> Senha Secundária (obrigatória)
                                </label>
                                <div className="relative group">
                                  <KeyRound size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber-500"/>
                                  <input
                                    type="password"
                                    className="w-full px-12 py-5 bg-slate-100 border-2 border-slate-200 group-focus-within:border-amber-500 group-focus-within:ring-4 group-focus-within:ring-amber-500/20 rounded-2xl font-black text-lg text-slate-900 outline-none transition-all placeholder:text-slate-400"
                                    placeholder="••••••••"
                                    value={withdrawalPassword}
                                    onChange={e => setWithdrawalPassword(e.target.value)}
                                    autoComplete="off"
                                  />
                                </div>
                                <p className="mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <ShieldCheck size={12}/> Validada no servidor — exigida por segurança em movimentação de saldo
                                </p>
                            </div>
                            )}
                        </div>

                      <div className="flex flex-col gap-3 pt-2">
                          <button
                            onClick={handleWithdrawal}
                            disabled={!withdrawalAmount || Number(withdrawalAmount) <= 0 || withdrawalPassword.trim().length < 8}
                            className={`w-full py-5 font-black rounded-2xl shadow-lg flex items-center justify-center gap-3 uppercase text-[11px] tracking-widest transition-all active:scale-[0.98] touch-target ${showWithdrawalModal.isDeposit ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110' : showWithdrawalModal.isRefund ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:brightness-110' : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110'} disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            <Check size={20}/> Confirmar Operação
                          </button>
                          <button
                            onClick={() => { setShowWithdrawalModal(null); setWithdrawalPassword(''); }}
                            className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all touch-target active:scale-[0.98]"
                          >
                            Cancelar
                          </button>
                      </div>
                  </div>
        </ModalShell>
      )}

      {/* MODAL: REFUND PREMIUM */}
      {showRefundModal && (
        <ModalShell
          open
          onClose={() => setShowRefundModal(null)}
          title="Estornar Pedido"
          subtitle={showRefundModal?.userName || undefined}
          icon={<RefreshCw size={22}/>}
          size="sm"
        >
                   <div className="p-8 space-y-6">
                       <div className="bg-gradient-to-r from-amber-900/30 to-amber-800/30 p-5 rounded-2xl border border-amber-700 text-center">
                          <div className="w-12 h-12 bg-amber-800/50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-400">
                              <RefreshCw size={24}/>
                          </div>
                          <p className="text-[11px] font-black text-amber-300 uppercase tracking-tighter leading-relaxed">
                              O valor será devolvido ao saldo do familiar e os itens retornarão ao estoque automaticamente.
                          </p>
                      </div>
<div>
                            <label className="text-slate-600 font-black text-[10px] uppercase tracking-widest mb-3 block">Motivo do Estorno</label>
                            <textarea
                                className="w-full p-5 bg-slate-100 border-2 border-slate-200 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 rounded-2xl font-black text-slate-900 text-sm outline-none h-32 resize-none placeholder:text-slate-400 uppercase"
                                placeholder="EX: DESISTÊNCIA DO CLIENTE, ERRO NO PEDIDO..."
                                value={refundReason}
                                onChange={e => setRefundReason(e.target.value.toUpperCase())}
                                autoFocus
                            ></textarea>
                        </div>
                      <div className="flex flex-col gap-3 pt-2">
                          <button
                            onClick={handleRefundOrder}
                            disabled={isProcessingRefund || !refundReason.trim()}
                            className={`w-full py-5 font-black rounded-2xl shadow-lg flex items-center justify-center gap-3 uppercase text-[11px] tracking-widest transition-all active:scale-[0.98] touch-target ${!refundReason.trim() ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110'} disabled:opacity-40`}
                          >
                            {isProcessingRefund ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    PROCESSANDO...
                                </>
                            ) : (
                                <>
                                    <Check size={20}/> Confirmar Estorno
                                </>
                            )}
                          </button>
                          <button
                            onClick={() => setShowRefundModal(null)}
                            className="w-full py-4 bg-slate-100 text-slate-600 font-black rounded-2xl uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all touch-target active:scale-[0.98]"
                          >
                            Cancelar
                          </button>
                      </div>
                  </div>
        </ModalShell>
      )}

      {/* MODAL: MASTER AUTH PREMIUM */}
      {showAuthModal && (
        <div className="modal-container">
            <form onSubmit={async (e) => { e.preventDefault(); setIsAuthLoading(true); try { await handleAuthConfirm(); } finally { setIsAuthLoading(false); } }} className="glass-card w-full max-w-sm rounded-3xl overflow-hidden border border-slate-200 animate-slideUp relative" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)' }}>
                <div className="relative bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-xl m-4 md:m-6">
                    <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center shadow-lg shadow-slate-900/20">
                        <Lock size={24} strokeWidth={2.2} className="text-emerald-400"/>
                    </div>

                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Autorização</h2>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Confirme sua senha para acessar as Configurações</p>

                    <div className="relative mt-6 mb-7 group/input">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 z-20 text-slate-400 transition-colors group-focus-within/input:text-emerald-600 pointer-events-none">
                            <Key size={18}/>
                        </div>
                        <input
                            type="password"
                            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
                            className="w-full pl-11 pr-4 py-3.5 bg-slate-50/70 border border-slate-200 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 rounded-xl font-bold text-lg tracking-[0.35em] text-slate-900 outline-none transition-all placeholder:text-slate-300 relative z-10"
                            placeholder="••••"
                            value={authPass}
                            onChange={e => setAuthPass(e.target.value)}
                            autoFocus
                            required
                            disabled={isAuthLoading}
                        />
                    </div>

                    <div className="flex flex-col gap-3">
                        <button type="submit" disabled={isAuthLoading || !authPass.trim()} className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:brightness-110 text-white font-black rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 uppercase text-[11px] tracking-widest active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all touch-target">
                            {isAuthLoading ? <><Loader2 size={16} className="animate-spin" /> Validando...</> : 'Confirmar Acesso'}
                            {!isAuthLoading && <Check size={16} />}
                        </button>
                        <button type="button" disabled={isAuthLoading} onClick={() => setShowAuthModal(false)} className="w-full py-2.5 text-slate-400 font-bold hover:text-slate-700 uppercase text-[10px] tracking-widest transition-all touch-target">Cancelar</button>
                    </div>
                </div>
            </form>
        </div>
      )}
      {/* MODAL: RECIBO A4 */}
      {viewingReceipt && (
        <ModalShell
          open
          onClose={() => setViewingReceipt(null)}
          title="Visualização de Documento"
          subtitle="Comprovante oficial A4 — autêntico e assinado digitalmente"
          icon={<Printer size={22} className="text-emerald-300" />}
          size="lg"
          actions={
            <>
              {viewingReceipt?.data && (
                <button
                  onClick={() => {
                    abrirJanelaImpressao({ type: 'RECIBO', subType: viewingReceipt.type === 'EXPENSE' ? 'EXPENSE' : 'ORDER', data: viewingReceipt.data }, viewingReceipt.config || settings);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-sm"
                >
                  <Printer size={16}/> Janela de Impressão
                </button>
              )}
              {/* Duplo rAF: garante layout/paint concluído ANTES do snapshot de
                  impressão — 1ª impressão não sai mais em branco. */}
              <button onClick={() => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => window.print(), 150)))} className="bg-slate-700 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-sm">
                <Printer size={16}/> Imprimir
              </button>
            </>
          }
        >
            <div className="p-0 lg:p-4 bg-slate-100/70">
              <div id="print-root-a4">
                <ReciboA4 data={viewingReceipt.data} type={viewingReceipt.type || 'ORDER'} config={viewingReceipt.config || settings || {}} embedded />
              </div>
            </div>
            <style>{`
              @media print {
                @page { size: A4; margin: 10mm; }
                html, body { height: auto !important; max-height: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; width: auto !important; }
                body * { visibility: hidden !important; }
                /* Reset dos ancestrais do modal: container fixo height:100vh +
                   overflow oculto (e modal-content max-height:85vh) RECORTAVAM
                   o recibo na folha A4 — imprimia só a primeira dobra e cortava
                   assinatura/código de controle. Aqui eles fluem soltos. */
                .modal-container, .modal-overlay {
                  position: static !important;
                  height: auto !important;
                  max-height: none !important;
                  overflow: visible !important;
                  width: auto !important;
                  padding: 0 !important;
                  display: block !important;
                  background: transparent !important;
                }
                .modal-content, .modal-shell-fixed {
                  position: static !important;
                  height: auto !important;
                  max-height: none !important;
                  overflow: visible !important;
                  width: auto !important;
                  max-width: none !important;
                  box-shadow: none !important;
                  border-radius: 0 !important;
                  border: none !important;
                  background: #ffffff !important;
                }
                #print-root-a4, #print-root-a4 * { visibility: visible !important; }
                #print-root-a4 {
                  position: static !important;
                  left: auto !important;
                  top: auto !important;
                  width: 210mm !important;
                  max-width: 100% !important;
                  margin: 0 auto !important;
                  box-sizing: border-box !important;
                }
                #print-root-a4 > * { max-width: 100% !important; box-sizing: border-box !important; }
              }
            `}</style>
        </ModalShell>
      )}

      {/* MODAL: CUPOM PDV */}
      {printOrder && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="toolbar-recibo-superior flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-3">
                <Printer size={20} className="text-emerald-600"/>
                <span className="font-black text-sm uppercase tracking-tight text-slate-900">Cupom PDV</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleRawPrint} className="px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-90 bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm">
                  <Printer size={14}/> Imprimir na Fiscal
                </button>
                <button onClick={handleBaixarTxt} className="px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-90 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 shadow-sm" title="Baixar .txt para impressão externa">
                  TXT
                </button>
                <button onClick={async () => {
                    const api = (window as any).electronAPI;
                    if (api?.printHtmlSilent) {
                        const ok = await imprimirHtmlSilencioso(gerarCupomEntregaRaw(printOrder, settings), settings);
                        if (ok) return;
                    }
                    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => window.print(), 150)));
                  }} className="px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-90 bg-slate-900 text-white hover:bg-slate-700 shadow-sm" title="Imprimir nesta janela">
                  <Printer size={14}/> Imprimir
                </button>
                <button onClick={() => setPrintOrder(null)} className="p-2 rounded-lg transition-all active:scale-90 bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-600 border border-slate-200 shadow-sm" title="Fechar">
                  <X size={22}/>
                </button>
              </div>
            </div>
            <div className="w-full mx-auto bg-white flex-1 overflow-y-auto p-4 md:p-6 flex justify-center shadow-inner" style={{ minHeight: '200px' }}>
              <div className="bg-white shadow-xl origin-top" style={{ width: '76mm' }}>
                <CupomEntrega order={printOrder} remainingBalance={printOrder.walletBalanceAfter} config={(settings as any)} />
              </div>
              {printOrder && createPortal(
                <div id="print-root-modal" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                  <CupomEntrega order={printOrder} remainingBalance={printOrder.walletBalanceAfter} config={(settings as any)} />
                </div>,
                document.body
              )}
            </div>
            <style>{`
              @media screen {
                .toolbar-recibo-superior { display: flex !important; }
              }
              @media print {
                .toolbar-recibo-superior { display: none !important; }
                body { background: white !important; }
                body * { visibility: hidden !important; }
                #print-root-modal, #print-root-modal * { visibility: visible !important; }
                #print-root-modal { position: absolute !important; left: 0 !important; top: 0 !important; width: 76mm !important; max-width: 76mm !important; margin: 0 !important; padding: 0 1mm !important; box-sizing: border-box !important; }
                @page { size: 76mm auto; margin: 0 !important; }
              }
            `}</style>
          </div>
        </div>
      )}
    </>
  );
};

const PremiumInput = ({ label, value, onChange, placeholder, type = "text", error, required }: { label: string; value: string; onChange: (e: any) => void; placeholder?: string; type?: string; error?: string; required?: boolean }) => (
    <div className={`bg-white p-4 rounded-xl border-2 transition-all ${error ? 'border-red-500 focus-within:border-red-500 focus-within:ring-4 focus-within:ring-red-500/20' : 'border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20'}`}>
       <div className="flex justify-between items-center mb-2">
         <label className="text-slate-700 font-black text-[10px] uppercase tracking-widest">{label}</label>
         {required && <span className="text-red-400 text-[10px] font-bold">*OBRIGATÓRIO</span>}
       </div>
       <input
          type={type}
          className={`w-full bg-slate-50 border rounded-xl font-bold text-slate-900 text-sm outline-none px-4 py-2.5 placeholder:text-slate-400 transition-all ${error ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
       />
       {error && <p className="text-red-400 text-[9px] font-bold mt-2 uppercase">{error}</p>}
    </div>
);

const ToggleSwitch = ({ label, sublabel, checked, onChange }: any) => (
    <div className="bg-white p-4 rounded-xl flex items-center justify-between border-2 border-slate-200">
        <div>
            <p className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">{label}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{sublabel}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
            <div className="w-12 h-7 bg-slate-600 rounded-full peer peer-checked:bg-emerald-500 transition-all after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-lg peer-checked:after:translate-x-5"></div>
        </label>
    </div>
);
