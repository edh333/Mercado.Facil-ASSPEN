import React from 'react';
import { Search, Grid, List, ShoppingBag, Plus, Ban } from 'lucide-react';
import { motion } from 'framer-motion';
import { Product } from '../../types';
import { formatarMoeda } from '../../utils';

interface UserStoreTabProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (val: 'grid' | 'list') => void;
  filteredProducts: Product[];
  addToCart: (pid: string) => void;
  theme: any;
}

export const UserStoreTab: React.FC<UserStoreTabProps> = ({
  searchTerm, setSearchTerm, viewMode, setViewMode, filteredProducts, addToCart, theme
}) => {
  return (
    <div className="animate-fadeIn pb-24">
      {/* Barra de Busca */}
      <div
        className="p-4 md:p-5 sticky top-20 md:top-24 z-20 border-b"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          borderColor: '#1e293b'
        }}
      >
          <div
            className="rounded-2xl p-1 flex items-center shadow-lg border"
            style={{
              backgroundColor: '#0f172a',
              borderColor: '#1e293b'
            }}
          >
              <div className="relative flex-1 group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500">
                    <Search size={18} />
                  </div>
                  <input
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-800 border-2 border-slate-700 rounded-xl outline-none transition-all font-bold text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-900"
                    placeholder="Buscar produtos..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              <div
                className="flex items-center p-1.5 rounded-xl mx-1"
                style={{ backgroundColor: '#1e293b' }}
              >
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'shadow-md' : ''}`}
                    style={{
                      backgroundColor: viewMode === 'grid' ? '#10b981' : 'transparent',
                      color: viewMode === 'grid' ? '#ffffff' : '#64748b'
                    }}
                  >
                    <Grid size={20} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'shadow-md' : ''}`}
                    style={{
                      backgroundColor: viewMode === 'list' ? '#10b981' : 'transparent',
                      color: viewMode === 'list' ? '#ffffff' : '#64748b'
                    }}
                  >
                    <List size={20} />
                  </button>
              </div>
          </div>
      </div>

      {/* Lista de Produtos */}
      <div className="px-4 md:px-5 pt-2">
          {(filteredProducts || []).length === 0 ? (
              <div
                className="text-center py-20 rounded-3xl border-2 border-dashed"
                style={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b'
                }}
              >
                  <ShoppingBag
                    size={56}
                    className="mx-auto mb-3"
                    style={{ color: '#10b981' }}
                  />
                  <p
                    className="font-black uppercase tracking-widest text-sm"
                    style={{ color: '#94a3b8' }}
                  >
                    Nenhum produto encontrado
                  </p>
              </div>
          ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-4">
                  {(filteredProducts || []).map(p => {
                      const isOutOfStock = p.stock <= 0;
                      return (
                          <motion.div
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              key={p.id}
                              className="rounded-[1.5rem] flex flex-col h-full relative group transition-all duration-300"
                              style={{
                                backgroundColor: '#0f172a',
                                boxShadow: '0 4px 20px -4px rgba(0,0,0,0.3)',
                                border: '1px solid #1e293b'
                              }}
                          >
                              <div
                                className="aspect-square rounded-t-[1.5rem] overflow-hidden relative"
                                style={{ backgroundColor: '#1e293b' }}
                              >
                                  <img
                                      src={p.imageUrl || 'https://placehold.co/200x200/064e3b/white?text=PRODUTO'}
                                      onError={(e) => { e.currentTarget.src = 'https://placehold.co/200x200/064e3b/white?text=PRODUTO'; }}
                                      className={`w-full h-full object-cover transition-transform duration-700 ${isOutOfStock ? 'grayscale' : 'group-hover:scale-110'}`}
                                  />
                                  {isOutOfStock && (
                                      <div
                                        className="absolute inset-0 flex items-center justify-center"
                                        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
                                      >
                                          <span
                                            className="text-white text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-wider shadow-lg"
                                            style={{ backgroundColor: '#dc2626' }}
                                          >Esgotado</span>
                                      </div>
                                  )}
                                  {p.promoPrice && !isOutOfStock && (
                                      <div
                                        className="absolute top-3 right-3 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase"
                                        style={{ backgroundColor: '#ea580c' }}
                                      >
                                        OFERTA
                                      </div>
                                  )}
                              </div>
                              <div className="p-4 flex-1 flex flex-col">
                                  <h3
                                    className="font-black text-sm leading-snug mb-2 line-clamp-2"
                                    style={{ color: '#f1f5f9' }}
                                  >
{p?.name || 'Produto'}
                                  </h3>
                                  {p.brand && (
                                    <span
                                      className="text-[9px] font-bold px-2 py-1 rounded uppercase w-fit tracking-wide mb-3 inline-block"
                                      style={{
                                        backgroundColor: '#1e293b',
                                        color: '#ffffff'
                                      }}
                                    >
                                      {p.brand}
                                    </span>
                                  )}
                                  <div className="mt-auto flex justify-between items-center">
                                      <div>
                                          {p.promoPrice ? (
                                              <>
                                                  <span
                                                    className="text-[10px] line-through leading-none"
                                                    style={{ color: '#94a3b8' }}
                                                  >
                                                    R$ {formatarMoeda(p.price)}
                                                  </span>
                                                  <span
                                                    className="font-black text-lg tracking-tight block"
                                                    style={{ color: '#10b981' }}
                                                  >
                                                    R$ {formatarMoeda(p.promoPrice)}
                                                  </span>
                                              </>
                                          ) : (
                                              <span
                                                className="font-black text-lg tracking-tight"
                                                style={{ color: '#10b981' }}
                                              >
                                                R$ {formatarMoeda(p.price)}
                                              </span>
                                          )}
                                      </div>
                                      <button
                                          disabled={isOutOfStock}
                                          onClick={() => addToCart(p.id)}
                                          className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all"
                                          style={{
                                            backgroundColor: isOutOfStock ? '#94a3b8' : '#10b981',
                                            color: '#ffffff'
                                          }}
                                      >
                                          {isOutOfStock ? <Ban size={18} /> : <Plus size={22} />}
                                      </button>
                                  </div>
                              </div>
                          </motion.div>
                      );
                  })}
              </div>
          ) : (
              <div className="space-y-3">
                  {(filteredProducts || []).map(p => {
                      const isOutOfStock = p.stock <= 0;
                      return (
                          <motion.div
                              layout
                              key={p.id}
                              className="rounded-2xl p-4 flex gap-4 transition-all"
                              style={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #1e293b'
                              }}
                          >
                              <div
                                className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0"
                                style={{ backgroundColor: '#1e293b' }}
                              >
                                  <img
                                      src={p.imageUrl || 'https://placehold.co/100'}
                                      onError={(e) => { e.currentTarget.src = 'https://placehold.co/100'; }}
                                      className="w-full h-full object-cover"
                                  />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <h3 className="font-black text-sm truncate" style={{ color: '#f1f5f9' }}>{p?.name || 'Produto'}</h3>
                                  <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>Estoque: {p?.stock || 0} un</p>
                                  <div className="flex justify-between items-center mt-2">
                                      <span className="font-black" style={{ color: '#10b981' }}>R$ {formatarMoeda(p?.price || 0)}</span>
                                      <button
                                          disabled={isOutOfStock}
                                          onClick={() => addToCart(p.id)}
                                          className="p-2.5 rounded-xl"
                                          style={{
                                            backgroundColor: isOutOfStock ? '#94a3b8' : '#10b981',
                                            color: '#ffffff'
                                          }}
                                      >
                                          {isOutOfStock ? <Ban size={18} /> : <Plus size={20} />}
                                      </button>
                                  </div>
                              </div>
                          </motion.div>
                      );
                  })}
              </div>
          )}
      </div>
    </div>
  );
};
