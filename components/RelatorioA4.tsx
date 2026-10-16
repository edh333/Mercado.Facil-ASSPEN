import React from 'react';
import { formatarMoeda } from '../utils';
import { toDate } from '../utils/dateUtils';
import {
    specSalesCsv, specStockAbc, specTopProducts, specDailyClosing, specVendasDiarias,
    specDetalheVendasDia, specSalesByCategory, specLowStock, specProductsCatalog,
    specUsersCredits, specRankingClientes, specVendasOperador, specFiadoVendas,
    specFiadoContas, specFiadoVencimentosFaixa, type CelulaSpec
} from '../utils/reportSpecs';

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
                    <p className="text-[11px] font-black uppercase tracking-[0.25em] text-emerald-700 mt-2">{report.title}</p>
                    {(cnpj || telefone) && (
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
                            {cnpj ? `CNPJ: ${cnpj}` : ''}
                            {cnpj && telefone ? ' · ' : ''}
                            {telefone ? `Tel: ${telefone}` : ''}
                        </p>
                    )}
                </div>
            </div>
            <div className="text-right shrink-0 print-avoid-break">
                <p className="text-[10px] font-black uppercase text-slate-500 mb-1">Emitido em</p>
                <p className="text-sm font-black text-slate-800 leading-none">{dataEmissao}</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1">às {horaEmissao}</p>
                <p className="text-[10px] font-black text-slate-500 mt-2 uppercase tracking-widest">Período: {report.period}</p>
            </div>
        </div>
    );

    const CardResumo = ({ label, valor, destaque }: { label: string; valor: string; destaque?: 'positivo' | 'negativo' | 'neutro' }) => (
        <div className={`border-2 rounded-xl p-4 ${destaque === 'positivo' ? 'border-emerald-600 bg-emerald-50' : destaque === 'negativo' ? 'border-red-600 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
            <p className="text-[9px] font-black uppercase text-slate-500 mb-1 tracking-widest">{label}</p>
            <p className={`text-lg font-black leading-tight ${destaque === 'positivo' ? 'text-emerald-700' : destaque === 'negativo' ? 'text-red-700' : 'text-slate-900'}`}>{valor}</p>
        </div>
    );

    // Tabela genérica: cabeçalhos alinhados, linhas ({cell, align, bold, color}) e rodapé opcional.
    interface Celula { text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; color?: string; sub?: string }
    const Tabela = ({ colunas, linhas, rodape, colunais, vazio }: { colunas: string[]; linhas: (string | Celula)[][]; rodape?: (string | Celula)[]; colunais?: ('left' | 'center' | 'right')[]; vazio?: string }) => {
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
                        <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{cell.sub}</span>
                    )}
                </td>
            );
        };
        return (
            <table className="w-full text-left border-collapse print-avoid-break">
                <thead>
                    <tr className="bg-slate-900 text-white">
                        {colunas.map((c, i) => (
                            <th key={i} className={`px-3 py-2.5 text-[9px] font-black uppercase tracking-widest ${aligns[i] === 'right' ? 'text-right' : aligns[i] === 'center' ? 'text-center' : 'text-left'}`}>{c}</th>
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
                        <tr><td colSpan={colunas.length} className="px-3 py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">{vazio || 'Nenhum registro encontrado no período.'}</td></tr>
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

    // Adaptador SpecTabela -> shape interno (Celula) — nenhuma lógica por relatório.
    const toCelula = (cell: CelulaSpec): Celula => typeof cell === 'string'
        ? { text: cell }
        : { text: cell.texto, align: cell.align, bold: cell.bold, color: cell.cor, sub: cell.sub };
    const toLinhas = (linhas: CelulaSpec[][]): Celula[][] => linhas.map(r => r.map(toCelula));
    const toRodape = (rodape?: CelulaSpec[]): Celula[] | undefined => rodape ? rodape.map(toCelula) : undefined;

    const BoxTitulo = ({ titulo, extra }: { titulo: string; extra?: string }) => (
        <div className="flex items-center justify-between mb-3 print-avoid-break">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white bg-slate-900 px-4 py-2 rounded-md shadow-md">{titulo}</h2>
            {extra && <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{extra}</span>}
        </div>
    );

    const Legenda = ({ texto }: { texto: string }) => (
        <p className="mt-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-relaxed">{texto}</p>
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
        const s = specStockAbc(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                    <Legenda texto="Critério: A ≤ 80% do faturamento · B ≤ 95% · C restante. Inventário valorizado a custo para balanço patrimonial." />
                </div>
            </section>
        );
    };

    const renderTopProducts = () => {
        const tp = report.topProducts;
        if (!tp) return null;
        const s = specTopProducts(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderSalesCsv = () => {
        const csv = report.salesCsv;
        if (!csv) return null;
        const s = specSalesCsv(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                    <Legenda texto="CPF sanitizado (LGPD): os 7 primeiros dígitos são mascarados." />
                </div>
            </section>
        );
    };

    const renderVendasDiarias = () => {
        const ds = report.dailySales || report.collective;
        if (!ds) return null;
        const s = specVendasDiarias(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderSalesByCategory = () => {
        const c = report.salesByCategory;
        if (!c) return null;
        const s = specSalesByCategory(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderLowStock = () => {
        const ls = report.lowStock;
        if (!ls) return null;
        const s = specLowStock(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderProductsCatalog = () => {
        const pc = report.productsCatalog;
        if (!pc) return null;
        const s = specProductsCatalog(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
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
        const s = specDailyClosing(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
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
                {d.dias.map((dia: any) => {
                    const s = specDetalheVendasDia(dia);
                    if (!s) return null;
                    return (
                        <div key={dia.data} className="print-avoid-break">
                            <BoxTitulo titulo={`${dia.data} — ${dia.vendas} venda(s) · ${dia.itens} itens`} extra={fmt(dia.total)} />
                            <Tabela
                                colunas={s.colunas}
                                colunais={s.alinhamentos}
                                linhas={toLinhas(s.linhas)}
                                rodape={toRodape(s.rodape)}
                                vazio={s.vazio}
                            />
                        </div>
                    );
                })}
            </section>
        );
    };

    const renderRankingClientes = () => {
        const r = report.rankingClientes;
        if (!r) return null;
        const s = specRankingClientes(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderVendasOperador = () => {
        const o = report.vendasOperador;
        if (!o) return null;
        const s = specVendasOperador(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderFiadoVendas = () => {
        const f = report.fiadoVendas;
        if (!f) return null;
        const s = specFiadoVendas(report);
        if (!s) return null;
        return (
            <section className="space-y-8">
                <div className="grid grid-cols-3 gap-4">
                    <CardResumo label="Vendas no Fiado" valor={String(f.count)} />
                    <CardResumo label="Valor Fiado no Período" valor={fmt(f.total)} destaque="negativo" />
                </div>
                <div>
                    <BoxTitulo titulo="Vendas Fiadas (Período)" />
                    <Tabela
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderFiadoContas = () => {
        const c = report.fiadoContas;
        if (!c) return null;
        const resumo = c.resumo || {};
        const s = specFiadoContas(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
                    />
                </div>
            </section>
        );
    };

    const renderFiadoVencimentos = () => {
        const v = report.fiadoVencimentos;
        if (!v) return null;
        const faixas = (v.faixas || []).filter((f: any) => Number(f.count) > 0);
        return (
            <section className="space-y-8">
                {faixas.map((faixa: any) => {
                    const s = specFiadoVencimentosFaixa(faixa);
                    if (!s) return null;
                    return (
                        <div key={faixa.faixa} className="print-avoid-break">
                            <BoxTitulo titulo={`${faixa.faixa} — ${faixa.count} cliente(s)`} extra={fmt(faixa.totalDivida)} />
                            <Tabela
                                colunas={s.colunas}
                                colunais={s.alinhamentos}
                                linhas={toLinhas(s.linhas)}
                                rodape={toRodape(s.rodape)}
                                vazio={s.vazio}
                            />
                        </div>
                    );
                })}
                {faixas.length === 0 && (
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
        const s = specUsersCredits(report);
        if (!s) return null;
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
                        colunas={s.colunas}
                        colunais={s.alinhamentos}
                        linhas={toLinhas(s.linhas)}
                        rodape={toRodape(s.rodape)}
                        vazio={s.vazio}
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
                        <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mt-1">Assinatura do Responsável</p>
                    </div>
                    <div className="flex-1 text-center print-avoid-break">
                        <div className="border-b-2 border-slate-400 h-8"></div>
                        <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mt-1">Conferência / Auditoria</p>
                    </div>
                </div>
                <p className="mt-10 text-center text-[9px] font-bold text-slate-500 uppercase tracking-tight leading-relaxed">
                    {appName} · {sistema} — Documento gerado eletronicamente. Não é documento fiscal.<br />
                    Código de Autenticação: {codigoAutenticacao} · Emitido em {dataEmissao} às {horaEmissao} · Período: {report.period}
                </p>
            </div>
        </div>
    );
};

export default RelatorioA4;