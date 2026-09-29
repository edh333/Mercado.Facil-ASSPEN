import React from 'react';
import { formatarMoeda } from '../utils';
import { toDate } from '../utils/dateUtils';

interface RelatorioA4Props {
    report: any;
    config: any;
}

/**
 * DOCUMENTO A4 PROFISSIONAL — motor único de impressão dos relatórios.
 * Usado pela janela /print (abrirJanelaImpressao with type 'RELATORIO') e
 * garante o MESMO padrão institucional em todos os relatórios: logotipo,
 * CNPJ/telefone da instituição, período, resumo em cards, tabelas por tipo,
 * totais, código de autenticação determinístico, assinaturas e aviso legal.
 * Valores em moeda pt-BR (formatarMoeda) — nunca toFixed cru, que corrompe
 * valores acima de R$ 1.000.
 */
export const RelatorioA4: React.FC<RelatorioA4Props> = ({ report, config }) => {
    if (!report) return null;

    // ── Helpers ─────────────────────────────────────────────────────────
    const fmt = (v: any): string => {
        const n = Number(v) || 0;
        return n < 0 ? `- R$ ${formatarMoeda(Math.abs(n))}` : `R$ ${formatarMoeda(n)}`;
    };
    const fmtData = (d: any): string => (toDate(d)?.toLocaleDateString('pt-BR') || '—');
    const fmtHora = (d: any): string => (toDate(d)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '—');
    const tem = (v: any): boolean => v !== undefined && v !== null && String(v).trim() !== '';

    const instituicao = String(config?.institutionName || config?.appName || 'MERCADO FÁCIL').toUpperCase();
    const cnpj = String(config?.cnpj || '').trim();
    const telefone = String(config?.contactPhone || '').trim();
    const logo = config?.logoUrl;
    const appName = String(config?.appName || 'Mercado Fácil');
    const sistema = String(config?.systemName || 'Sistema de Gestão').toUpperCase();

    const agora = new Date();
    const dataEmissao = agora.toLocaleDateString('pt-BR');
    const horaEmissao = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Código de autenticação DETERMINÍSTICO (mesmo relatório → mesmo código).
    const authSeed = String(report.title || 'RELATORIO') + '|' + String(report.period || '') + '|' + String((report.items && report.items[0]?.id) || (report.items && report.items[0]?.date) || '');
    let authHash = 0;
    for (let i = 0; i < authSeed.length; i++) authHash = (authHash * 31 + authSeed.charCodeAt(i)) >>> 0;
    const codigoAutenticacao = authHash.toString(36).toUpperCase().padStart(9, '0').slice(0, 9);

    // ── Componentes de documento ────────────────────────────────────────
    const Cabecalho = () => (
        <div className="border-b-[6px] border-slate-900 pb-5 mb-6 flex justify-between items-end gap-6 print-avoid-break">
            <div className="flex items-start gap-4 min-w-0">
                {logo && <img src={logo} alt="Logo" className="h-16 w-16 object-contain shrink-0" />}
                <div className="min-w-0">
                    <h1 className="text-[22px] font-black uppercase tracking-tighter leading-none">{instituicao}</h1>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-700 mt-2">{report.title}</p>
                    {(cnpj || telefone) && (
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                            {cnpj ? `CNPJ: ${cnpj}` : ''}
                            {cnpj && telefone ? ' · ' : ''}
                            {telefone ? `Tel: ${telefone}` : ''}
                        </p>
                    )}
                </div>
            </div>
            <div className="text-right shrink-0 print-avoid-break">
                <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Emitido em</p>
                <p className="text-sm font-black text-slate-800 leading-none">{dataEmissao}</p>
                <p className="text-[9px] font-bold text-slate-500 mt-1">às {horaEmissao}</p>
                <p className="text-[9px] font-black text-slate-500 mt-2 uppercase tracking-widest">Período: {report.period}</p>
            </div>
        </div>
    );

    const CardResumo = ({ label, valor, destaque }: { label: string; valor: string; destaque?: 'positivo' | 'negativo' | 'neutro' }) => (
        <div className={`border-2 rounded-xl p-4 ${destaque === 'positivo' ? 'border-emerald-600 bg-emerald-50' : destaque === 'negativo' ? 'border-red-600 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-[8px] font-black uppercase text-slate-500 mb-1 tracking-widest">{label}</p>
            <p className={`text-lg font-black leading-tight ${destaque === 'positivo' ? 'text-emerald-700' : destaque === 'negativo' ? 'text-red-700' : 'text-slate-900'}`}>{valor}</p>
        </div>
    );

    // Tabela genérica: cabeçalhos alinhados, linhas ({cell, align, bold, color}) e rodapé opcional.
    interface Celula { text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; color?: string; sub?: string }
    const Tabela = ({ colunas, linhas, rodape, colunais }: { colunas: string[]; linhas: (string | Celula)[][]; rodape?: (string | Celula)[]; colunais?: ('left' | 'center' | 'right')[] }) => {
        const aligns = colunais || colunas.map(() => 'left' as const);
        const renderCell = (cell: string | Celula, idx: number, isFooter = false) => {
            const texto = typeof cell === 'string' ? cell : cell.text;
            const align = typeof cell === 'string' ? aligns[idx] || 'left' : cell.align || aligns[idx] || 'left';
            const bold = typeof cell === 'string' ? false : cell.bold;
            const color = typeof cell === 'string' ? undefined : cell.color;
            return (
                <td
                    key={idx}
                    className={`px-3 py-2.5 text-[10px] ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${bold ? 'font-black' : 'font-medium'} ${isFooter ? 'text-slate-900' : 'text-slate-700'}`}
                    style={color ? { color } : undefined}
                >
                    {texto}
                    {typeof cell !== 'string' && cell.sub && (
                        <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{cell.sub}</span>
                    )}
                </td>
            );
        };
        return (
            <table className="w-full text-left border-collapse print-avoid-break">
                <thead>
                    <tr className="bg-slate-900 text-white">
                        {colunas.map((c, i) => (
                            <th key={i} className={`px-3 py-2.5 text-[8px] font-black uppercase tracking-widest ${aligns[i] === 'right' ? 'text-right' : aligns[i] === 'center' ? 'text-center' : 'text-left'}`}>{c}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {linhas.map((r, i) => (
                        <tr key={i} className="border-b border-slate-100 break-inside-avoid hover:bg-slate-50">
                            {r.map((cell, j) => renderCell(cell, j))}
                        </tr>
                    ))}
                    {linhas.length === 0 && (
                        <tr><td colSpan={colunas.length} className="px-3 py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Nenhum registro encontrado no período.</td></tr>
                    )}
                </tbody>
                {rodape && (
                    <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-900">
                            {rodape.map((cell, j) => renderCell(cell, j, true))}
                        </tr>
                    </tfoot>
                )}
            </table>
        );
    };

    const BoxTitulo = ({ titulo, extra }: { titulo: string; extra?: string }) => (
        <div className="flex items-center justify-between mb-3 print-avoid-break">
            <h2 className="text-[9px] font-black uppercase tracking-[0.2em] text-white bg-slate-900 px-4 py-2 rounded-md shadow-md">{titulo}</h2>
            {extra && <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">{extra}</span>}
        </div>
    );

    const Legenda = ({ texto }: { texto: string }) => (
        <p className="mt-2 text-[8px] font-bold text-slate-500 uppercase tracking-wider leading-relaxed">{texto}</p>
    );

    // ── Renderizadores por tipo ─────────────────────────────────────────
    const renderFluxo = () => {
        const s = report.summary || {};
        const itens = Array.isArray(report.items) ? report.items : [];
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Total de Entradas" valor={fmt(s.totalEntries || s.totalSales || 0)} destaque="positivo" />
                    <CardResumo label="Total de Saídas" valor={fmt(s.totalExits || s.totalExpenses || 0)} destaque="negativo" />
                    <CardResumo label="Resultado do Período" valor={fmt(s.net || 0)} destaque={Number(s.net || 0) >= 0 ? 'positivo' : 'negativo'} />
                </div>
                {report.type === 'GENERAL' && (
                    <div className="grid grid-cols-3 gap-4">
                        <CardResumo label="Pedidos Processados" valor={String(s.ordersCount || 0)} />
                        <CardResumo label="Novos Familiares (30d)" valor={String(s.newUsers || 0)} />
                        <CardResumo label="Itens Zerados no Estoque" valor={String(s.outOfStock || 0)} destaque="negativo" />
                    </div>
                )}
                <div>
                    <BoxTitulo titulo={report.title} extra={`${itens.length} lançamento(s)`} />
                    <Tabela
                        colunas={['Data', 'Tipo', 'Descrição / Documento', 'Valor']}
                        colunais={['left', 'center', 'left', 'right']}
                        linhas={itens.map((i: any) => [
                            { text: fmtData(i.date), align: 'left' as const },
                            { text: i.type === 'ENTRY' ? 'Entrada' : 'Saída', align: 'center' as const, bold: true, color: i.type === 'ENTRY' ? '#047857' : '#b91c1c' },
                            { text: String(i.description || ''), sub: i.person ? String(i.person) : '' },
                            { text: `${i.type === 'ENTRY' ? '+' : '-'} ${fmt(i.amount)}`, align: 'right' as const, bold: true, color: i.type === 'ENTRY' ? '#047857' : '#b91c1c' }
                        ])}
                        rodape={[
                            { text: 'SALDO DO PERÍODO', align: 'right' as const, bold: true },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'left' as const },
                            { text: fmt(s.net || 0), align: 'right' as const, bold: true, color: Number(s.net || 0) >= 0 ? '#047857' : '#b91c1c' }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderDre = () => {
        const d = report.dre;
        if (!d) return null;
        const linha = (label: string, valor: number, destaque?: 'positivo' | 'negativo', sub?: string): (string | Celula)[] => [
            { text: label, sub },
            { text: fmt(valor), align: 'right' as const, bold: true, color: destaque === 'positivo' ? '#047857' : destaque === 'negativo' ? '#b91c1c' : '#334155' }
        ];
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Receita Bruta" valor={fmt(d.receitaBruta)} destaque="positivo" />
                    <CardResumo label="CMV" valor={fmt(-d.custoMercadoriasVendidas)} destaque="negativo" />
                    <CardResumo label="Impostos (Estim.)" valor={fmt(-d.impostosEstimados)} destaque="negativo" />
                    <CardResumo label="Despesas Operacionais" valor={fmt(-d.despesasOperacionais)} destaque="negativo" />
                </div>
                <div>
                    <BoxTitulo titulo="Demonstração do Resultado — Simplificada" extra={`Ticket médio: ${fmt(d.ticketMedio)}`} />
                    <Tabela
                        colunas={['Demonstração', 'Valor']}
                        colunais={['left', 'right']}
                        linhas={[
                            linha(`Receita Bruta de Vendas (${d.qtdPedidos} pedidos · ${d.qtdItensVendidos} itens)`, d.receitaBruta, 'positivo'),
                            linha('(-) Custo das Mercadorias Vendidas (CMV)', -d.custoMercadoriasVendidas, 'negativo', 'Custos de aquisição importados via NFe/XML'),
                            linha('(=) Lucro Bruto', d.lucroBruto, d.lucroBruto >= 0 ? 'positivo' : 'negativo'),
                            linha(`(-) Impostos Estimados (${(d.aliquotaImposto * 100).toFixed(0)}%)`, -d.impostosEstimados, 'negativo'),
                            linha('(-) Despesas Operacionais', -d.despesasOperacionais, 'negativo', 'Saídas registradas no período')
                        ]}
                        rodape={[
                            { text: 'LUCRO LÍQUIDO REAL DO PERÍODO', bold: true },
                            { text: fmt(d.lucroLiquido), align: 'right' as const, bold: true, color: d.lucroLiquido >= 0 ? '#047857' : '#b91c1c' }
                        ]}
                    />
                    {d.qtdPedidosCancelados > 0 && (
                        <Legenda texto={`Obs.: ${d.qtdPedidosCancelados} pedido(s) cancelado(s) excluído(s) da base de cálculo.`} />
                    )}
                </div>
            </section>
        );
    };

    const renderStockAbc = () => {
        const abc = report.stockAbc;
        if (!abc) return null;
        const cor = (c: string) => c === 'A' ? '#047857' : c === 'B' ? '#b45309' : '#b91c1c';
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Receita Geral (Giro)" valor={fmt(abc.totalReceita)} destaque="positivo" />
                    <CardResumo label="Inventário (Custo)" valor={fmt(abc.totalValorEstoqueCusto)} />
                    <CardResumo label="Estoque Parado" valor={fmt(abc.valorEstoqueParado)} destaque="negativo" />
                    <CardResumo label="Produtos no Giro A" valor={String(abc.qtdProdutosGiroAlto)} />
                </div>
                <div>
                    <BoxTitulo titulo="Classificação A/B/C por Faturamento" extra={`${abc.qtdProdutosTotais} produtos`} />
                    <Tabela
                        colunas={['Produto', 'Qtd Vendida', 'Receita', '% Acum.', 'Estoque', 'Valor (Custo)', 'Classe']}
                        colunais={['left', 'right', 'right', 'right', 'right', 'right', 'center']}
                        linhas={abc.linhas.map((l: any) => [
                            { text: String(l.name), bold: true, sub: l.qtdVendida === 0 ? 'Sem giro no período' : undefined },
                            { text: String(l.qtdVendida), align: 'right' as const },
                            { text: fmt(l.receita), align: 'right' as const, bold: true, color: '#047857' },
                            { text: `${Number(l.acumuladoPct || 0).toFixed(1)}%`, align: 'right' as const },
                            { text: String(l.estoque), align: 'right' as const },
                            { text: fmt(l.valorEstoqueCusto), align: 'right' as const },
                            { text: String(l.classe), align: 'center' as const, bold: true, color: cor(l.classe) }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${abc.qtdProdutosTotais} produtos`, bold: true },
                            { text: '', align: 'right' as const },
                            { text: fmt(abc.totalReceita), align: 'right' as const, bold: true, color: '#047857' },
                            { text: '100%', align: 'right' as const },
                            { text: '', align: 'right' as const },
                            { text: fmt(abc.totalValorEstoqueCusto), align: 'right' as const, bold: true },
                            { text: '', align: 'center' as const }
                        ]}
                    />
                    <Legenda texto="Critério: A ≤ 80% do faturamento · B ≤ 95% · C restante. Inventário valorizado a custo para balanço patrimonial." />
                </div>
            </section>
        );
    };

    const renderTopProducts = () => {
        const tp = report.topProducts;
        if (!tp) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Receita do Ranking" valor={fmt(tp.totalReceita)} destaque="positivo" />
                    <CardResumo label="Itens Vendidos" valor={String(tp.totalItens)} />
                    <CardResumo label="Produtos no Ranking" valor={String(tp.totalProdutos)} />
                </div>
                <div>
                    <BoxTitulo titulo="TOP Produtos — Ranking por Quantidade Vendida" extra={`${tp.linhas.length} posições`} />
                    <Tabela
                        colunas={['#', 'Produto', 'Categoria', 'Qtd Vendida', 'Receita', 'Preço Médio']}
                        colunais={['center', 'left', 'left', 'right', 'right', 'right']}
                        linhas={tp.linhas.map((l: any, idx: number) => [
                            { text: String(idx + 1), align: 'center' as const, bold: true, color: idx === 0 ? '#b45309' : '#64748b' },
                            { text: String(l.name), bold: true },
                            { text: String(l.categoria || '') },
                            { text: String(l.qtdVendida), align: 'right' as const, bold: true },
                            { text: fmt(l.receita), align: 'right' as const, bold: true, color: '#047857' },
                            { text: fmt(l.precoMedio), align: 'right' as const }
                        ])}
                        rodape={[
                            { text: '', align: 'center' as const },
                            { text: `TOTAL · ${tp.totalProdutos} produtos`, bold: true },
                            { text: '', align: 'left' as const },
                            { text: String(tp.totalItens), align: 'right' as const, bold: true },
                            { text: fmt(tp.totalReceita), align: 'right' as const, bold: true, color: '#047857' },
                            { text: '', align: 'right' as const }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderSalesCsv = () => {
        const csv = report.salesCsv;
        if (!csv) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Vendas no Período" valor={String(csv.linhas.length)} />
                    <CardResumo label="Faturamento Bruto" valor={fmt(csv.totalVendas)} destaque="positivo" />
                    <CardResumo label="Impostos Estimados (7%)" valor={fmt(csv.totalImpostos)} destaque="negativo" />
                </div>
                <div>
                    <BoxTitulo titulo="Movimentação de Vendas — Arquivo para o Contador" extra="CSV separado por ';'" />
                    <Tabela
                        colunas={['Data', 'Cupom', 'CPF Cliente', 'Pagamento', 'Alíq.', 'Imposto Est.', 'Valor Total']}
                        colunais={['left', 'left', 'center', 'center', 'right', 'right', 'right']}
                        linhas={csv.linhas.map((l: any) => [
                            { text: String(l.DATA) },
                            { text: `${String(l.NUMERO_CUPOM)}`, bold: true },
                            { text: String(l.CPF_CLIENTE || '—'), align: 'center' as const },
                            { text: String(l.FORMA_PAGAMENTO || '—'), align: 'center' as const },
                            { text: `${l['ALIQUOTA_ESTIMADA(%)']}%`, align: 'right' as const },
                            { text: fmt(l.IMPOSTO_ESTIMADO), align: 'right' as const, bold: true, color: '#b45309' },
                            { text: fmt(l.VALOR_TOTAL), align: 'right' as const, bold: true }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${csv.linhas.length} vendas`, bold: true },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'right' as const },
                            { text: fmt(csv.totalImpostos), align: 'right' as const, bold: true, color: '#b45309' },
                            { text: fmt(csv.totalVendas), align: 'right' as const, bold: true, color: '#047857' }
                        ]}
                    />
                    <Legenda texto="CPF sanitizado (LGPD): os 7 primeiros dígitos são mascarados." />
                </div>
            </section>
        );
    };

    const renderVendasDiarias = () => {
        const ds = report.dailySales || report.collective;
        if (!ds) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Dias com Venda" valor={String(ds.dias.length)} />
                    <CardResumo label="Vendas no Período" valor={String(ds.totalVendas)} />
                    <CardResumo label="Itens Vendidos" valor={String(ds.totalItens)} />
                    <CardResumo label="Faturamento" valor={fmt(ds.totalGeral)} destaque="positivo" />
                </div>
                <div>
                    <BoxTitulo titulo="Vendas por Dia" extra={`Ticket médio: ${fmt(ds.ticketMedio)}`} />
                    <Tabela
                        colunas={['Data', 'Vendas', 'Itens', 'Faturamento', 'Ticket Médio']}
                        colunais={['left', 'center', 'center', 'right', 'right']}
                        linhas={ds.dias.map((d: any) => [
                            { text: String(d.data), bold: true },
                            { text: String(d.vendas), align: 'center' as const },
                            { text: String(d.items), align: 'center' as const },
                            { text: fmt(d.total), align: 'right' as const, bold: true, color: '#047857' },
                            { text: fmt(d.vendas > 0 ? d.total / d.vendas : 0), align: 'right' as const }
                        ])}
                        rodape={[
                            { text: 'TOTAL', align: 'center' as const, bold: true },
                            { text: String(ds.totalVendas), align: 'center' as const, bold: true },
                            { text: String(ds.totalItens), align: 'center' as const, bold: true },
                            { text: fmt(ds.totalGeral), align: 'right' as const, bold: true, color: '#047857' },
                            { text: fmt(ds.ticketMedio), align: 'right' as const, bold: true }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderSalesByCategory = () => {
        const c = report.salesByCategory;
        if (!c) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Grupos de Produtos" valor={String(c.linhas.length)} />
                    <CardResumo label="Itens Vendidos" valor={String(c.totalQuantidade)} />
                    <CardResumo label="Receita Total" valor={fmt(c.totalReceita)} destaque="positivo" />
                </div>
                <div>
                    <BoxTitulo titulo="Desempenho por Grupo (Categoria)" extra={`${c.qtdPedidos} pedidos no período`} />
                    <Tabela
                        colunas={['Grupo', 'Itens Vendidos', 'Receita', '% do Total']}
                        colunais={['left', 'right', 'right', 'right']}
                        linhas={c.linhas.map((l: any) => [
                            { text: String(l.categoria), bold: true },
                            { text: String(l.quantidade), align: 'right' as const },
                            { text: fmt(l.receita), align: 'right' as const, bold: true, color: '#047857' },
                            { text: `${c.totalReceita ? (Number(l.receita) / Number(c.totalReceita) * 100).toFixed(1) : '0.0'}%`, align: 'right' as const }
                        ])}
                        rodape={[
                            { text: 'TOTAL', bold: true },
                            { text: String(c.totalQuantidade), align: 'right' as const, bold: true },
                            { text: fmt(c.totalReceita), align: 'right' as const, bold: true, color: '#047857' },
                            { text: '100%', align: 'right' as const, bold: true }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderLowStock = () => {
        const ls = report.lowStock;
        if (!ls) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Itens Críticos" valor={String(ls.totalCriticos)} destaque="negativo" />
                    <CardResumo label="Itens Zerados" valor={String(ls.totalZerados)} destaque="negativo" />
                    <CardResumo label="Valor do Estoque (Custo)" valor={fmt(ls.totalValorEstoque)} />
                </div>
                <div>
                    <BoxTitulo titulo="Reposição / Inventário — Itens Abaixo do Mínimo" />
                    <Tabela
                        colunas={['Produto', 'Categoria', 'Código', 'Estoque', 'Mínimo', 'Valor (Custo)']}
                        colunais={['left', 'left', 'center', 'center', 'center', 'right']}
                        linhas={ls.linhas.map((l: any) => [
                            { text: String(l.name), bold: true, sub: l.semEstoque ? 'SEM ESTOQUE' : 'Estoque crítico' },
                            { text: String(l.category || '') },
                            { text: l.barcode ? String(l.barcode) : '—', align: 'center' as const },
                            { text: String(l.estoque), align: 'center' as const, bold: true, color: l.estoque <= 0 ? '#b91c1c' : '#b45309' },
                            { text: String(l.minimo), align: 'center' as const },
                            { text: fmt(l.valorEstoque), align: 'right' as const }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${ls.totalCriticos} item(ns) em reposição`, bold: true },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: fmt(ls.totalValorEstoque), align: 'right' as const, bold: true }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderProductsCatalog = () => {
        const pc = report.productsCatalog;
        if (!pc) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Produtos Cadastrados" valor={String(pc.totalProdutos)} />
                    <CardResumo label="Unidades em Estoque" valor={String(pc.totalEstoque)} />
                    <CardResumo label="Valor do Estoque (Venda)" valor={fmt(pc.totalValorEstoque)} destaque="positivo" />
                </div>
                <div>
                    <BoxTitulo titulo="Catálogo Completo de Produtos" extra={`${pc.linhas.length} SKUs`} />
                    <Tabela
                        colunas={['Nº', 'Produto', 'Marca', 'Peso', 'Categoria', 'Código', 'Estoque', 'Preço de Venda']}
                        colunais={['center', 'left', 'left', 'left', 'left', 'center', 'right', 'right']}
                        linhas={pc.linhas.map((l: any, idx: number) => [
                            { text: String(idx + 1), align: 'center' as const, bold: true, color: '#64748b' },
                            { text: String(l.name), bold: true },
                            { text: l.brand || '—' },
                            { text: l.weight || '—' },
                            { text: String(l.category || '') },
                            { text: l.barcode || '—', align: 'center' as const },
                            { text: String(l.estoque), align: 'right' as const, bold: true, color: l.estoque <= 0 ? '#b91c1c' : l.estoque <= 5 ? '#b45309' : '#334155' },
                            { text: `${l.precoPromocional > 0 ? 'Oferta ' : ''}${fmt(l.precoPromocional > 0 ? l.precoPromocional : l.preco)}`, align: 'right' as const, bold: true, color: l.precoPromocional > 0 ? '#047857' : '#334155' }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${pc.totalProdutos} produtos`, bold: true },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'center' as const },
                            { text: String(pc.totalEstoque), align: 'right' as const, bold: true },
                            { text: fmt(pc.totalValorEstoque), align: 'right' as const, bold: true, color: '#047857' }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderExtratoIndividual = () => {
        const ex = report.extrato;
        if (!ex) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Familiar" valor={(ex.usuario.inmateName || ex.usuario.name || '—').slice(0, 22)} />
                    <CardResumo label="Saldo Atual" valor={fmt(ex.usuario.saldoAtual)} destaque={Number(ex.usuario.saldoAtual || 0) >= 0 ? 'positivo' : 'negativo'} />
                    <CardResumo label="Entradas no Período" valor={fmt(ex.totalEntradas)} destaque="positivo" />
                    <CardResumo label="Saídas no Período" valor={fmt(-ex.totalSaidas)} destaque="negativo" />
                </div>
                <div>
                    <BoxTitulo titulo={`Extrato Individual — ${ex.usuario.name || ex.usuario.inmateName || 'Usuário'}`} extra={ex.usuario.cpf ? `CPF ${ex.usuario.cpf}` : ''} />
                    <Tabela
                        colunas={['Data', 'Tipo', 'Descrição', 'Valor']}
                        colunais={['left', 'center', 'left', 'right']}
                        linhas={ex.movs.map((m: any) => [
                            { text: fmtData(m.date) },
                            { text: m.type === 'ENTRY' ? 'Entrada' : 'Saída', align: 'center' as const, bold: true, color: m.type === 'ENTRY' ? '#047857' : '#b91c1c' },
                            { text: String(m.description || '') },
                            { text: `${m.type === 'ENTRY' ? '+' : '-'} ${fmt(m.amount)}`, align: 'right' as const, bold: true, color: m.type === 'ENTRY' ? '#047857' : '#b91c1c' }
                        ])}
                        rodape={[
                            { text: 'SALDO DO PERÍODO', align: 'right' as const, bold: true },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'left' as const },
                            { text: fmt(ex.saldoPeriodo), align: 'right' as const, bold: true, color: Number(ex.saldoPeriodo || 0) >= 0 ? '#047857' : '#b91c1c' }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderDailyClosing = () => {
        const dc = report.dailyClosing;
        if (!dc) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Vendas do Período" valor={fmt(dc.totalSales)} destaque="positivo" />
                    <CardResumo label="Despesas" valor={fmt(dc.totalExpenses)} destaque="negativo" />
                    <CardResumo label="Resultado" valor={fmt(dc.net)} destaque={Number(dc.net || 0) >= 0 ? 'positivo' : 'negativo'} />
                    <CardResumo label="Depósitos Aprovados" valor={fmt(dc.totalDeposits)} />
                </div>
                <div>
                    <BoxTitulo titulo="Vendas por Forma de Pagamento" extra={report.title} />
                    <Tabela
                        colunas={['Forma de Pagamento', 'Nº de Operações', 'Valor', '% do Total']}
                        colunais={['left', 'center', 'right', 'right']}
                        linhas={dc.paymentRows.map((r: any) => [
                            { text: String(r.label), bold: true },
                            { text: String(r.count), align: 'center' as const },
                            { text: fmt(r.amount), align: 'right' as const, bold: true, color: '#047857' },
                            { text: `${dc.totalSales ? (Number(r.amount) / Number(dc.totalSales) * 100).toFixed(1) : '0.0'}%`, align: 'right' as const }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${dc.salesCount} venda(s)`, bold: true },
                            { text: '', align: 'center' as const },
                            { text: fmt(dc.totalSales), align: 'right' as const, bold: true, color: '#047857' },
                            { text: '100%', align: 'right' as const, bold: true }
                        ]}
                    />
                    <Legenda texto={`Despesas do período: ${dc.expensesCount} lançamento(s) · Depósitos: ${dc.depositsCount} aprovação(ões).`} />
                </div>
            </section>
        );
    };

    const renderDetalheVendas = () => {
        const d = report.detalheVendas;
        if (!d) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Dias com Venda" valor={String(d.dias.length)} />
                    <CardResumo label="Total de Vendas" valor={String(d.totalVendas)} />
                    <CardResumo label="Itens Vendidos" valor={String(d.totalItens)} />
                    <CardResumo label="Faturamento" valor={fmt(d.totalGeral)} destaque="positivo" />
                </div>
                {d.dias.map((dia: any) => (
                    <div key={dia.data} className="print-avoid-break">
                        <BoxTitulo titulo={`${dia.data} — ${dia.vendas} venda(s) · ${dia.itens} itens`} extra={fmt(dia.total)} />
                        <Tabela
                            colunas={['Hora', 'Cupom', 'Cliente / Interno', 'Itens', 'Pagamento', 'Operador', 'Valor']}
                            colunais={['center', 'left', 'left', 'left', 'center', 'center', 'right']}
                            linhas={dia.vendasDetalhe.map((v: any) => [
                                { text: fmtHora('2000-01-01T' + (v.hora || '00:00') + ':00'), align: 'center' as const },
                                { text: String(v.cupom || ''), bold: true },
                                { text: String(v.cliente || 'Consumidor'), sub: v.interno ? String(v.interno) : v.cpf ? `CPF ${String(v.cpf)}` : '' },
                                { text: v.items.map((i: any) => `${i.qtd}x ${i.nome}`).join(' · ') },
                                { text: (v.formas || []).join(' / '), align: 'center' as const },
                                { text: String(v.operador || '—'), align: 'center' as const },
                                { text: fmt(v.total), align: 'right' as const, bold: true, color: '#047857' }
                            ])}
                        />
                    </div>
                ))}
            </section>
        );
    };

    const renderRankingClientes = () => {
        const r = report.rankingClientes;
        if (!r) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Clientes no Ranking" valor={String(r.totalClientes)} />
                    <CardResumo label="Compras no Período" valor={String(r.totalVendas)} />
                    <CardResumo label="Faturamento" valor={fmt(r.totalGeral)} destaque="positivo" />
                </div>
                <div>
                    <BoxTitulo titulo="Ranking de Clientes do Período" />
                    <Tabela
                        colunas={['#', 'Cliente', 'CPF', 'Compras', 'Itens', 'Faturamento', 'Ticket', '%']}
                        colunais={['center', 'left', 'center', 'center', 'center', 'right', 'right', 'right']}
                        linhas={r.linhas.map((l: any) => [
                            { text: String(l.pos), align: 'center' as const, bold: true, color: l.pos <= 3 ? '#b45309' : '#64748b' },
                            { text: String(l.cliente), bold: true },
                            { text: l.cpf || '—', align: 'center' as const },
                            { text: String(l.compras), align: 'center' as const },
                            { text: String(l.itens), align: 'center' as const },
                            { text: fmt(l.total), align: 'right' as const, bold: true, color: '#047857' },
                            { text: fmt(l.ticket), align: 'right' as const },
                            { text: `${Number(l.pct || 0).toFixed(1)}%`, align: 'right' as const }
                        ])}
                        rodape={[
                            { text: '', align: 'center' as const },
                            { text: `TOTAL · ${r.totalClientes} cliente(s)`, bold: true },
                            { text: '', align: 'center' as const },
                            { text: String(r.totalVendas), align: 'center' as const, bold: true },
                            { text: '', align: 'center' as const },
                            { text: fmt(r.totalGeral), align: 'right' as const, bold: true, color: '#047857' },
                            { text: '', align: 'right' as const },
                            { text: '100%', align: 'right' as const, bold: true }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderVendasOperador = () => {
        const o = report.vendasOperador;
        if (!o) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Operadores" valor={String(o.totalOperadores)} />
                    <CardResumo label="Vendas no Período" valor={String(o.totalVendas)} />
                    <CardResumo label="Faturamento" valor={fmt(o.totalGeral)} destaque="positivo" />
                </div>
                <div>
                    <BoxTitulo titulo="Desempenho por Operador (CAIXA)" />
                    <Tabela
                        colunas={['#', 'Operador', 'Vendas', 'Itens', 'Faturamento', 'Ticket', '%']}
                        colunais={['center', 'left', 'center', 'center', 'right', 'right', 'right']}
                        linhas={o.linhas.map((l: any) => [
                            { text: String(l.pos), align: 'center' as const, bold: true, color: l.pos === 1 ? '#b45309' : '#64748b' },
                            { text: String(l.operador), bold: true },
                            { text: String(l.vendas), align: 'center' as const },
                            { text: String(l.itens), align: 'center' as const },
                            { text: fmt(l.total), align: 'right' as const, bold: true, color: '#047857' },
                            { text: fmt(l.ticket), align: 'right' as const },
                            { text: `${Number(l.pct || 0).toFixed(1)}%`, align: 'right' as const }
                        ])}
                        rodape={[
                            { text: '', align: 'center' as const },
                            { text: `TOTAL · ${o.totalOperadores} operador(es)`, bold: true },
                            { text: String(o.totalVendas), align: 'center' as const, bold: true },
                            { text: '', align: 'center' as const },
                            { text: fmt(o.totalGeral), align: 'right' as const, bold: true, color: '#047857' },
                            { text: '', align: 'right' as const },
                            { text: '100%', align: 'right' as const, bold: true }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderFiadoVendas = () => {
        const f = report.fiadoVendas;
        if (!f) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Vendas no Fiado" valor={String(f.count)} />
                    <CardResumo label="Valor Fiado no Período" valor={fmt(f.total)} destaque="negativo" />
                </div>
                <div>
                    <BoxTitulo titulo="Vendas Fiadas (Período)" />
                    <Tabela
                        colunas={['Data', 'Cliente', 'CPF', 'Forma', 'Status', 'Itens', 'Valor']}
                        colunais={['left', 'left', 'center', 'center', 'center', 'left', 'right']}
                        linhas={f.vendas.map((v: any) => [
                            { text: String(v.data) },
                            { text: String(v.cliente), bold: true },
                            { text: v.cpf || '—', align: 'center' as const },
                            { text: String(v.forma || ''), align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: v.items.map((i: any) => `${i.qtd}x ${i.nome}`).join(' · ') },
                            { text: fmt(v.total), align: 'right' as const, bold: true, color: '#b45309' }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${f.count} venda(s)`, bold: true },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'left' as const },
                            { text: fmt(f.total), align: 'right' as const, bold: true, color: '#b45309' }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderFiadoContas = () => {
        const c = report.fiadoContas;
        if (!c) return null;
        const resumo = c.resumo || {};
        const statusCor = (st: string) => st === 'vencido' ? '#b91c1c' : st === 'vence_hoje' ? '#b45309' : st === 'a_vencer' ? '#1d4ed8' : '#64748b';
        const statusLabel = (conta: any) => conta.status === 'vencido' ? `VENCIDO (${conta.diasAtraso}d)` : conta.status === 'vence_hoje' ? 'VENCE HOJE' : conta.status === 'a_vencer' ? 'A VENCER' : 'SEM VENCIMENTO';
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Contas em Aberto" valor={String(resumo.totalClientes || 0)} />
                    <CardResumo label="Total da Dívida" valor={fmt(resumo.totalDivida || 0)} destaque="negativo" />
                    <CardResumo label="Vencidas" valor={String(resumo.vencidos || 0)} destaque="negativo" />
                    <CardResumo label="Vencem Hoje" valor={String(resumo.vencemHoje || 0)} destaque="negativo" />
                </div>
                <div>
                    <BoxTitulo titulo="Contas a Receber (Fiado)" />
                    <Tabela
                        colunas={['Cliente', 'CPF', 'Telefone', 'Dívida', 'Limite', 'Disponível', 'Início', 'Vencimento', 'Status']}
                        colunais={['left', 'center', 'center', 'right', 'right', 'right', 'center', 'center', 'center']}
                        linhas={c.contas.map((conta: any) => [
                            { text: String(conta.nome), bold: true },
                            { text: conta.cpf || '—', align: 'center' as const },
                            { text: conta.telefone || '—', align: 'center' as const },
                            { text: fmt(conta.divida), align: 'right' as const, bold: true, color: '#b45309' },
                            { text: fmt(conta.limite), align: 'right' as const },
                            { text: fmt(conta.disponivel), align: 'right' as const },
                            { text: String(conta.debtStartedAt || '—'), align: 'center' as const },
                            { text: String(conta.debtDueAt || '—'), align: 'center' as const },
                            { text: statusLabel(conta), align: 'center' as const, bold: true, color: statusCor(conta.status) }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${c.contas.length} conta(s)`, bold: true },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: fmt(resumo.totalDivida || 0), align: 'right' as const, bold: true, color: '#b45309' },
                            { text: fmt(resumo.totalLimite || 0), align: 'right' as const, bold: true },
                            { text: fmt(resumo.totalDisponivel || 0), align: 'right' as const, bold: true },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const }
                        ]}
                    />
                </div>
            </section>
        );
    };

    const renderFiadoVencimentos = () => {
        const v = report.fiadoVencimentos;
        if (!v) return null;
        const ordemCor: Record<string, string> = { red: '#b91c1c', amber: '#b45309', blue: '#1d4ed8', green: '#047857' };
        return (
            <section className="space-y-8">
                {v.faixas.filter((f: any) => Number(f.count) > 0).map((faixa: any) => (
                    <div key={faixa.faixa} className="print-avoid-break">
                        <BoxTitulo titulo={`${faixa.faixa} — ${faixa.count} cliente(s)`} extra={fmt(faixa.totalDivida)} />
                        <Tabela
                            colunas={['Cliente', 'Dívida', 'Vencimento', 'Dias']}
                            colunais={['left', 'right', 'center', 'right']}
                            linhas={faixa.itens.map((i: any) => [
                                { text: String(i.nome), bold: true },
                                { text: fmt(i.divida), align: 'right' as const, bold: true, color: '#b45309' },
                                { text: String(i.debtDueAt || '—'), align: 'center' as const },
                                { text: String(i.diasAtraso) + ' dia(s)', align: 'right' as const }
                            ])}
                            rodape={[
                                { text: `SUBTOTAL · ${faixa.count} conta(s)`, bold: true },
                                { text: fmt(faixa.totalDivida), align: 'right' as const, bold: true, color: '#b45309' },
                                { text: '', align: 'center' as const },
                                { text: '', align: 'right' as const }
                            ]}
                        />
                    </div>
                ))}
                {v.faixas.every((f: any) => Number(f.count) === 0) && (
                    <div className="text-center py-16 text-slate-500 font-black uppercase tracking-[0.2em] border-4 border-dashed border-slate-100 rounded-[3rem]">
                        Nenhuma dívida em aberto no fiado.
                    </div>
                )}
            </section>
        );
    };

    const renderUsersCredits = () => {
        const lista = report.creditsRows || [];
        if (!lista.length) return null;
        const totalSaldo = lista.reduce((s: number, x: any) => s + Number(x.saldo || 0), 0);
        const totalGasto = lista.reduce((s: number, x: any) => s + Number(x.gastoSemanal || 0), 0);
        const ativos = lista.filter((x: any) => x.status === 'active').length;
        const pendentes = lista.filter((x: any) => x.status === 'pending').length;
        const suspensos = lista.filter((x: any) => x.status === 'suspended').length;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-4 gap-4">
                    <CardResumo label="Saldo Total Disponível" valor={fmt(totalSaldo)} destaque="positivo" />
                    <CardResumo label="Familiares Ativos" valor={String(ativos)} />
                    <CardResumo label="Gasto Semanal Acumulado" valor={fmt(totalGasto)} />
                    <CardResumo label="Saldo Médio" valor={fmt(lista.length ? totalSaldo / lista.length : 0)} />
                </div>
                <div>
                    <BoxTitulo titulo="Relatório de Créditos dos Usuários" extra={`${lista.length} familiar(es)`} />
                    <Tabela
                        colunas={['#', 'Familiar', 'CPF', 'Status', 'Saldo Disponível', 'Gasto Semanal']}
                        colunais={['center', 'left', 'center', 'center', 'right', 'right']}
                        linhas={lista.map((x: any, idx: number) => [
                            { text: String(idx + 1).padStart(2, '0'), align: 'center' as const },
                            { text: String(x.name || '—'), bold: true },
                            { text: String(x.cpf || '—'), align: 'center' as const },
                            { text: x.status === 'active' ? 'Ativo' : x.status === 'pending' ? 'Pendente' : 'Suspenso', align: 'center' as const, bold: true, color: x.status === 'active' ? '#047857' : x.status === 'pending' ? '#b45309' : '#b91c1c' },
                            { text: fmt(x.saldo), align: 'right' as const, bold: true, color: Number(x.saldo || 0) > 0 ? '#047857' : '#64748b' },
                            { text: fmt(x.gastoSemanal), align: 'right' as const }
                        ])}
                        rodape={[
                            { text: `TOTAL · ${lista.length} familiares`, bold: true },
                            { text: '', align: 'left' as const },
                            { text: '', align: 'center' as const },
                            { text: '', align: 'center' as const },
                            { text: fmt(totalSaldo), align: 'right' as const, bold: true, color: '#047857' },
                            { text: fmt(totalGasto), align: 'right' as const, bold: true }
                        ]}
                    />
                    {(pendentes > 0 || suspensos > 0) && (
                        <Legenda texto={`Critério da listagem: todos os familiares cadastrados${pendentes > 0 ? ` · ${pendentes} pendente(s)` : ''}${suspensos > 0 ? ` · ${suspensos} suspenso(s)` : ''}.`} />
                    )}
                </div>
            </section>
        );
    };

    // Seleciona o render conforme o tipo.
    let corpo: React.ReactNode = null;
    switch (report.type) {
        case 'GENERAL':
        case 'FINANCIAL':
        case 'ACCOUNTABILITY':
            corpo = renderFluxo();
            break;
        case 'DRE_MONTHLY':
            corpo = renderDre();
            break;
        case 'STOCK_ABC':
            corpo = renderStockAbc();
            break;
        case 'TOP_PRODUCTS':
            corpo = renderTopProducts();
            break;
        case 'SALES_CSV':
            corpo = renderSalesCsv();
            break;
        case 'VENDAS_DIARIAS':
        case 'COLLECTIVE_PURCHASES':
            corpo = renderVendasDiarias();
            break;
        case 'SALES_BY_CATEGORY':
            corpo = renderSalesByCategory();
            break;
        case 'STOCK_LOW':
            corpo = renderLowStock();
            break;
        case 'PRODUCTS_ALL':
            corpo = renderProductsCatalog();
            break;
        case 'INDIVIDUAL':
            corpo = renderExtratoIndividual();
            break;
        case 'DAILY_CLOSING':
            corpo = renderDailyClosing();
            break;
        case 'DETALHE_VENDAS':
            corpo = renderDetalheVendas();
            break;
        case 'RANKING_CLIENTES':
            corpo = renderRankingClientes();
            break;
        case 'VENDAS_OPERADOR':
            corpo = renderVendasOperador();
            break;
        case 'FIADO_VENDAS':
            corpo = renderFiadoVendas();
            break;
        case 'FIADO_CONTAS':
            corpo = renderFiadoContas();
            break;
        case 'FIADO_VENCIMENTOS':
            corpo = renderFiadoVencimentos();
            break;
        case 'USERS_CREDITS':
            corpo = renderUsersCredits();
            break;
        default:
            corpo = renderFluxo();
    }

    return (
        <div className="documento-a4 bg-white p-8 max-w-[210mm] w-full mx-auto text-slate-900 font-sans shadow-xl mb-8 print:shadow-none print:m-0 print:p-6 print:max-w-none print:w-full">
            <Cabecalho />

            {corpo || (
                <div className="text-center py-24 text-slate-500 font-black uppercase tracking-[0.2em] border-4 border-dashed border-slate-100 rounded-[3rem]">
                    Sem dados para exibir neste relatório.
                </div>
            )}

            {/* Rodapé de autenticação e assinaturas */}
            <div className="mt-14 pt-5 border-t-2 border-slate-100 print-avoid-break">
                <div className="flex justify-between items-end gap-20">
                    <div className="flex-1 text-center print-avoid-break">
                        <div className="border-b-2 border-slate-400 h-8"></div>
                        <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mt-1">Assinatura do Responsável</p>
                    </div>
                    <div className="flex-1 text-center print-avoid-break">
                        <div className="border-b-2 border-slate-400 h-8"></div>
                        <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mt-1">Conferência / Auditoria</p>
                    </div>
                </div>
                <p className="mt-10 text-center text-[8px] font-bold text-slate-500 uppercase tracking-tight leading-relaxed">
                    {appName} · {sistema} — Documento gerado eletronicamente. Não é documento fiscal.<br />
                    Código de Autenticação: {codigoAutenticacao} · Emitido em {dataEmissao} às {horaEmissao} · Período: {report.period}
                </p>
            </div>
        </div>
    );
};

export default RelatorioA4;