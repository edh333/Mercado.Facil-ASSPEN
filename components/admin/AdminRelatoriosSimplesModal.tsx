import React, { useMemo, useState } from 'react';
import { ModalShell } from '../ui/ModalShell';
import {
  Printer, FileText, ShoppingCart, Wallet, Users, Package, MapPin, TrendingUp,
} from 'lucide-react';
import { Order, Product, User } from '../../types';
import { imprimirRelatorioSimplesA4 } from '../../utils/printUtils';
import {
  ROTULO_PERIODO,
  relatorioCreditos,
  relatorioClientes,
  relatorioPresos,
  relatorioProdutos,
  relatorioVendas,
  relatorioVendasProdutos,
  type PeriodoVendas,
  type RelatorioSimples,
} from './relatoriosSimples';

type ChaveRelatorio = 'vendas' | 'produtosVendidos' | 'produtos' | 'creditos' | 'clientes' | 'presos';

const ABAS: { chave: ChaveRelatorio; rotulo: string; icone: React.ReactNode }[] = [
  { chave: 'vendas', rotulo: 'Vendas', icone: <ShoppingCart size={15} /> },
  { chave: 'produtosVendidos', rotulo: 'Vendas por Produto', icone: <TrendingUp size={15} /> },
  { chave: 'produtos', rotulo: 'Estoque', icone: <Package size={15} /> },
  { chave: 'creditos', rotulo: 'Créditos', icone: <Wallet size={15} /> },
  { chave: 'clientes', rotulo: 'Fiado', icone: <Users size={15} /> },
  { chave: 'presos', rotulo: 'Presos e Saldos', icone: <MapPin size={15} /> },
];

const PERIODOS: PeriodoVendas[] = ['hoje', '7', '30', 'tudo'];

// Título canônico do documento impresso (espelha o rótulo da aba).
const TITULOS: Record<ChaveRelatorio, string> = {
  vendas: 'Relatório de Vendas',
  produtosVendidos: 'Relatório de Vendas por Produto',
  creditos: 'Relatório de Créditos',
  clientes: 'Relatório de Clientes (Fiado)',
  produtos: 'Relatório de Estoque de Produtos',
  presos: 'Relatório de Presos e Saldos',
};

// Abas que respeitam o filtro de período (as demais são fotos do estado atual).
const ABAS_COM_PERIODO: ChaveRelatorio[] = ['vendas', 'produtosVendidos'];

interface AdminRelatoriosSimplesModalProps {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  products: Product[];
  users: User[];
  settings?: any;
}

/**
 * Janela de Relatórios Simples do painel admin: consulta rápida, sem
 * configuração, de vendas, créditos, clientes (fiado), produtos e saldos por
 * interno. Acessível a qualquer admin/operador que chegue à tela inicial.
 * Cada aba tem tabela + cartões de totais e imprime em A4 com um clique.
 */
export const AdminRelatoriosSimplesModal: React.FC<AdminRelatoriosSimplesModalProps> = ({
  open,
  onClose,
  orders,
  products,
  users,
  settings,
}) => {
  const [aba, setAba] = useState<ChaveRelatorio>('vendas');
  const [periodo, setPeriodo] = useState<PeriodoVendas>('hoje');

  const relatorio: RelatorioSimples = useMemo(() => {
    switch (aba) {
      case 'creditos':
        return relatorioCreditos(users);
      case 'clientes':
        return relatorioClientes(users);
      case 'produtos':
        return relatorioProdutos(products);
      case 'presos':
        return relatorioPresos(users);
      case 'produtosVendidos':
        return relatorioVendasProdutos(orders, periodo);
      default:
        return relatorioVendas(orders, periodo);
    }
  }, [aba, periodo, orders, products, users]);

  const mostraPeriodo = ABAS_COM_PERIODO.includes(aba);

  const subtitulo = mostraPeriodo
    ? `${ROTULO_PERIODO[periodo]} • emitido em ${new Date().toLocaleDateString('pt-BR')}`
    : `Emitido em ${new Date().toLocaleDateString('pt-BR')}`;

  const handleImprimir = () => {
    imprimirRelatorioSimplesA4(
      {
        titulo: TITULOS[aba],
        subtitulo,
        colunas: relatorio.colunas,
        linhas: relatorio.linhas,
        resumo: relatorio.resumo,
        rodape: relatorio.rodape,
      },
      settings
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Relatórios Simples"
      subtitle="Consulta rápida e impressão para qualquer administrador"
      icon={<FileText size={18} />}
      size="xl"
      actions={
        <button
          onClick={handleImprimir}
          title="Imprimir relatório em A4"
          aria-label="Imprimir relatório"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand hover:bg-brand-dark text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
        >
          <Printer size={15} /> Imprimir
        </button>
      }
      bodyClassName="p-4 sm:p-6"
    >
      {/* Abas dos relatórios */}
      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Tipos de relatório">
        {ABAS.map((a) => {
          const ativo = a.chave === aba;
          return (
            <button
              key={a.chave}
              role="tab"
              aria-selected={ativo}
              onClick={() => setAba(a.chave)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 cursor-pointer border ${
                ativo
                  ? 'bg-[var(--text-main)] text-[var(--bg-card)] border-transparent shadow-sm'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)] hover:border-[var(--text-main)]'
              }`}
            >
              {a.icone} {a.rotulo}
            </button>
          );
        })}
      </div>

      {/* Período (Vendas e Vendas por Produto) */}
      {mostraPeriodo && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Período:</span>
          {PERIODOS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              aria-pressed={periodo === p}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 cursor-pointer border ${
                periodo === p
                  ? 'bg-brand text-white border-transparent shadow-sm'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-color)] hover:text-[var(--text-main)]'
              }`}
            >
              {ROTULO_PERIODO[p]}
            </button>
          ))}
        </div>
      )}

      {/* Cartões de resumo */}
      {relatorio.resumo.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {relatorio.resumo.map((r, i) => (
            <div key={`${r.rotulo}-${i}`} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-4 shadow-sm">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{r.rotulo}</p>
              <p className="text-lg font-black text-[var(--text-main)] tracking-tight">{r.valor}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabela simples */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[var(--bg-muted)]">
                {relatorio.colunas.map((c, i) => (
                  <th
                    key={`${c.rotulo}-${i}`}
                    style={{ textAlign: c.align || 'left' }}
                    className="px-3 py-3 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest whitespace-nowrap border-b border-[var(--border-color)]"
                  >
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relatorio.linhas.length === 0 ? (
                <tr>
                  <td colSpan={relatorio.colunas.length} className="px-4 py-12 text-center text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wide">
                    {relatorio.vazio}
                  </td>
                </tr>
              ) : (
                relatorio.linhas.map((linha, ri) => (
                  <tr key={ri} className="hover:bg-[var(--bg-muted)] transition-colors">
                    {linha.map((cel, ci) => (
                      <td
                        key={ci}
                        style={{ textAlign: relatorio.colunas[ci]?.align || 'left' }}
                        className={`px-3 py-2.5 text-xs text-[var(--text-main)] border-b border-[var(--border-color)] ${
                          ci === 0 ? 'font-bold' : ''
                        }`}
                      >
                        {cel}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {relatorio.rodape && (
        <p className="mt-3 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide">{relatorio.rodape}</p>
      )}
    </ModalShell>
  );
};
