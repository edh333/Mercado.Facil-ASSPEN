import React, { useMemo } from 'react';
import { X, Printer, FileText, TrendingUp, TrendingDown, Package, Users, Download, Calendar, BarChart3, PieChart, Activity, FileSpreadsheet, Landmark, Wallet } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { User } from '../../types';
import { isAdminRole } from '../../utils';
import { buildMonthlyDre, buildSalesCsv, buildStockAbc } from '../../context/StoreContext';

const PAYMENT_LABELS: Record<string, string> = {
    PIX: 'Pix',
    CASH: 'Dinheiro',
    CARD: 'Cartão',
    WALLET: 'Carteira',
    FIADO: 'Fiado',
    MIXED: 'Misto'
};

const buildDailyClosing = (orders: any[], expenses: any[], transactions: any[], startDateStr: string, endDateStr: string) => {
    const statusReceita = (s?: string) => !['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'reembolsado', 'rejected', 'rejeitado'].includes(String(s || '').toLowerCase());
    const inPeriod = (ts?: string | number) => {
        if (!ts) return false;
        const d = new Date(ts);
        return d >= new Date(startDateStr) && d <= new Date(endDateStr + 'T23:59:59');
    };

    const periodOrders = (orders || []).filter(o => statusReceita(o.status) && inPeriod(o.date));
    const periodExpenses = (expenses || []).filter(e => inPeriod(e.date));
    const periodDeposits = (transactions || []).filter((tx: any) =>
        tx.type === 'deposit' && tx.status === 'approved' && inPeriod(tx.createdAt || tx.date));

    const methods: Record<string, { label: string; amount: number; count: number }> = {};
    let totalSales = 0;
    periodOrders.forEach(order => {
        const splits = Array.isArray(order.payments) && order.payments.length
            ? order.payments
            : [{ method: order.paymentMethod || 'PIX', amount: Number(order.total) || 0 }];
        const primary = String(order.paymentMethod || 'PIX').toUpperCase();
        splits.forEach((split: any) => {
            const method = String(split.method || primary).toUpperCase();
            const label = PAYMENT_LABELS[method] || method;
            if (!methods[method]) methods[method] = { label, amount: 0, count: 0 };
            methods[method].amount += Number(split.amount) || 0;
        });
        if (!methods[primary]) methods[primary] = { label: PAYMENT_LABELS[primary] || primary, amount: 0, count: 0 };
        methods[primary].count += 1;
        totalSales += Number(order.total) || 0;
    });

    const paymentRows = Object.values(methods).sort((a, b) => b.amount - a.amount);
    const totalExpenses = periodExpenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const totalDeposits = periodDeposits.reduce((a, b) => a + (Number(b.amount) || 0), 0);

    return {
        paymentRows,
        totalSales,
        salesCount: periodOrders.length,
        totalExpenses,
        totalDeposits,
        net: totalSales - totalExpenses,
        expensesCount: periodExpenses.length,
        depositsCount: periodDeposits.length
    };
};

interface AdminReportPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    config: any;
    orders: any[];
    expenses: any[];
    users: User[];
    products: any[];
    settings: any;
    transactions?: any[];
}

export const AdminReportPreviewModal: React.FC<AdminReportPreviewModalProps> = ({ isOpen, onClose, config, orders, expenses, users, products, settings, transactions = [] }) => {
    const { colors } = useTheme();
    const [thermalMode, setThermalMode] = React.useState(false);
    const [fontSize, setFontSize] = React.useState(14);

    // Pedidos cancelados/estornados/rejeitados NÃO são receita (contagem e valores).
    const statusReceita = (s?: string) => !['cancelled', 'cancelado', 'refunded', 'estornado', 'devolvido', 'reembolsado', 'rejected', 'rejeitado'].includes(String(s || '').toLowerCase());

    const report = useMemo(() => {
        if (!config || !orders || !expenses) return null;

        const totalEntries = (orders || []).filter(o => statusReceita(o.status)).reduce((a, b) => a + (Number(b.total) || 0), 0);
        const totalExits = (expenses || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
        const ordersCount = (orders || []).filter(o => statusReceita(o.status)).length;
        const newUsers = (users || []).filter((u: User) => !isAdminRole(u.role) && u.createdAt && new Date(u.createdAt) >= new Date(Date.now() - 30 * 86400000)).length;
        const outOfStock = (products || []).filter((p: any) => (p.stock || 0) <= 0).length;
        const net = totalEntries - totalExits;

        const startDateStr = config?.startDate || new Date().toISOString().split('T')[0];
        const endDateStr = config?.endDate || new Date().toISOString().split('T')[0];
        const periodLabel = `${new Date(startDateStr).toLocaleDateString('pt-BR')} a ${new Date(endDateStr).toLocaleDateString('pt-BR')}`;

        let items: any[] = [];
        if (config?.type === 'FINANCIAL' || config?.type === 'GENERAL' || config?.type === 'ACCOUNTABILITY') {
            const filteredExpenses = (expenses || []).filter(e => {
                const d = new Date(e.date || 0);
                return d >= new Date(startDateStr) && d <= new Date(endDateStr + 'T23:59:59');
            }).map(e => ({
                date: e.date,
                description: e.description || 'Despesa',
                type: 'EXIT' as const,
                amount: Math.abs(e.amount || 0),
                person: e.recipientName || ''
            }));

            const filteredOrders = (orders || []).filter(o => {
                const d = new Date(o.date || 0);
                return statusReceita(o.status) && d >= new Date(startDateStr) && d <= new Date(endDateStr + 'T23:59:59');
            }).map(o => ({
                date: o.date,
                description: `Venda #${(o.id || '').slice(0, 6).toUpperCase()}`,
                type: 'ENTRY' as const,
                amount: o.total || 0,
                person: o.userName || ''
            }));

            items = [...filteredOrders, ...filteredExpenses].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        }

        const reportTypes: Record<string, string> = {
            'GENERAL': 'Resumo Geral',
            'FINANCIAL': 'Fluxo de Caixa',
            'ACCOUNTABILITY': 'Prestação de Contas',
            'PRODUCTS_ALL': 'Catálogo de Produtos',
            'USERS_CREDITS': 'Usuários e Saldos',
            'INDIVIDUAL': 'Extrato Individual',
            'COLLECTIVE_PURCHASES': 'Compras Coletivas',
            'STOCK_LOW': 'Reposição / Inventário',
            'SALES_BY_CATEGORY': 'Vendas por Grupo',
            'DRE_MONTHLY': 'Fechamento de Caixa Mensal (DRE Simplificado)',
            'SALES_CSV': 'Arquivo de Movimentação de Vendas (CSV/Excel)',
            'STOCK_ABC': 'Curva ABC de Estoque',
            'DAILY_CLOSING': 'Fechamento do Dia (Conferência de Caixa)'
        };

        const dailyClosing = config?.type === 'DAILY_CLOSING'
            ? buildDailyClosing(orders, expenses, transactions, startDateStr, endDateStr)
            : null;

        const dre = config?.type === 'DRE_MONTHLY'
            ? buildMonthlyDre(orders, expenses, products, startDateStr, endDateStr)
            : null;

        const salesCsv = config?.type === 'SALES_CSV'
            ? buildSalesCsv(orders, users, startDateStr, endDateStr)
            : null;

        const stockAbc = config?.type === 'STOCK_ABC'
            ? buildStockAbc(products, orders, startDateStr, endDateStr)
            : null;

        return {
            type: config?.type || 'GENERAL',
            title: reportTypes[config?.type] || 'Relatório',
            period: periodLabel,
            dre,
            salesCsv,
            stockAbc,
            dailyClosing,
            summary: {
                totalSales: totalEntries,
                totalExpenses: totalExits,
                net,
                ordersCount,
                newUsers,
                outOfStock,
                totalEntries,
                totalExits
            },
            items
        };
    }, [config, orders, expenses, users, products, settings, transactions]);

    if (!isOpen || !report) return null;

    const renderGeneral = () => (
        <div className="space-y-8 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[var(--bg-main)]/50 p-6 rounded-[2rem] border border-[var(--border-color)] shadow-inner group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg"><TrendingUp size={16}/></div>
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest leading-none">Receita Bruta</p>
                    </div>
                    <p className="text-2xl font-black text-emerald-600 tracking-tighter">R$ {report.summary.totalSales.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                </div>
                <div className="bg-[var(--bg-main)]/50 p-6 rounded-[2rem] border border-[var(--border-color)] shadow-inner group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-red-500/10 text-red-600 rounded-lg"><TrendingDown size={16}/></div>
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest leading-none">Custo / Despesas</p>
                    </div>
                    <p className="text-2xl font-black text-red-600 tracking-tighter">R$ {report.summary.totalExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                </div>
                <div className="bg-[var(--bg-main)]/50 p-6 rounded-[2rem] border border-[var(--border-color)] shadow-inner group">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg"><Activity size={16}/></div>
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest leading-none">Resultado Líquido</p>
                    </div>
                    <p className={`text-2xl font-black tracking-tighter ${report.summary.net >= 0 ? 'text-[var(--primary-color)]' : 'text-orange-600'}`}>R$ {report.summary.net.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                </div>
            </div>

            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden shadow-sm">
                <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-main)]/30">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
                        <BarChart3 size={16}/> Indicadores de Operação
                    </h4>
                </div>
                <div className="divide-y divide-[var(--border-color)]">
                    <div className="flex justify-between items-center p-6 hover:bg-[var(--bg-main)]/20 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-2 h-2 rounded-full bg-[var(--primary-color)] shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]"></div>
                            <span className="text-xs font-black text-[var(--text-main)] uppercase tracking-tight">Total de Pedidos Processados</span>
                        </div>
                        <span className="text-lg font-black text-[var(--text-main)]">{report.summary.ordersCount}</span>
                    </div>
                    <div className="flex justify-between items-center p-6 hover:bg-[var(--bg-main)]/20 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <span className="text-xs font-black text-[var(--text-main)] uppercase tracking-tight">Captação de Novos Familiares</span>
                        </div>
                        <span className="text-lg font-black text-[var(--text-main)]">{report.summary.newUsers}</span>
                    </div>
                    <div className="flex justify-between items-center p-6 hover:bg-[var(--bg-main)]/20 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                            <span className="text-xs font-black text-[var(--text-main)] uppercase tracking-tight">Ruptura de Estoque (Itens Zerados)</span>
                        </div>
                        <span className="text-lg font-black text-red-600">{report.summary.outOfStock}</span>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderFinancial = () => (
        <div className="space-y-6 animate-fadeIn">
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden shadow-xl flex flex-col">
                <div className="max-h-[45vh] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left">
                        <thead className="bg-[var(--text-main)] text-[var(--bg-card)] font-black uppercase text-[9px] tracking-widest sticky top-0 z-10 shadow-lg">
                            <tr>
                                <th className="p-5">Data Operação</th>
                                <th className="p-5">Fluxo</th>
                                <th className="p-5">Histórico / Descritivo</th>
                                <th className="p-5 text-right">Valor Unitário</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
                            {report.items.length === 0 ? (
                                <tr><td colSpan={4} className="p-20 text-center font-black uppercase text-xs opacity-30">Nenhum registro encontrado para este período.</td></tr>
                            ) : report.items.map((item: any, idx: number) => (
                                <tr key={idx} className="hover:bg-[var(--bg-main)]/30 transition-all group">
                                    <td className="p-5 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-[var(--text-muted)] opacity-50"/>
                                            <span className="text-[10px] font-black text-[var(--text-main)] font-mono">{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                    </td>
                                    <td className="p-5">
                                        <span className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-widest shadow-sm ${item.type === 'ENTRY' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'}`}>
                                            {item.type === 'ENTRY' ? 'Entrada' : 'Saída'}
                                        </span>
                                    </td>
                                    <td className="p-5">
                                        <span className="text-[11px] font-black text-[var(--text-main)] uppercase tracking-tight line-clamp-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                            {item.description}
                                        </span>
                                    </td>
                                    <td className={`p-5 text-right font-black text-sm tracking-tighter ${item.type === 'ENTRY' ? 'text-emerald-600' : 'text-red-600'}`}>
                                        <span className="text-[10px] opacity-40 mr-1">{item.type === 'ENTRY' ? '+' : '-'} R$</span>
                                        {item.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-[var(--text-main)] text-[var(--bg-card)] p-8 rounded-[3rem] flex flex-col md:flex-row justify-between items-center shadow-2xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--primary-color)] rounded-full blur-[80px] -mr-32 -mt-32 opacity-10"></div>
                 <div className="relative z-10 text-center md:text-left mb-6 md:mb-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mb-2">Consolidado do Período</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-sm opacity-50 font-black">R$</span>
                        <h3 className="text-4xl font-black tracking-tighter">{report.summary.net.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</h3>
                    </div>
                 </div>
                 <div className="relative z-10 grid grid-cols-2 gap-4 w-full md:w-auto">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-right backdrop-blur-sm">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Total Entradas</p>
                        <p className="text-sm font-black text-white">+ R$ {report.summary.totalEntries.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 text-right backdrop-blur-sm">
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Total Saídas</p>
                        <p className="text-sm font-black text-white">- R$ {report.summary.totalExits.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                    </div>
                 </div>
            </div>
        </div>
    );

    const renderDre = () => {
        const d = report.dre;
        if (!d) return null;
        const linhaDre = (label: string, valor: number, destaque?: 'positivo' | 'negativo' | 'neutro', sub?: string) => (
            <div className="flex justify-between items-center p-5 border-b border-[var(--border-color)] last:border-0">
                <div>
                    <p className={`text-[11px] font-black uppercase tracking-tight ${destaque === 'positivo' ? 'text-emerald-600' : destaque === 'negativo' ? 'text-red-600' : 'text-[var(--text-main)]'}`}>{label}</p>
                    {sub && <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest mt-0.5">{sub}</p>}
                </div>
                <span className={`text-base font-black tracking-tighter ${destaque === 'positivo' ? 'text-emerald-600' : destaque === 'negativo' ? 'text-red-600' : 'text-[var(--text-main)]'}`}>
                    {valor >= 0 ? 'R$ ' : '- R$ '}{Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
            </div>
        );
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-main)]/30 flex items-center gap-3">
                        <Landmark size={18} className="text-teal-600"/>
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Demonstração do Resultado do Exercício — Simplificada</h4>
                    </div>
                    <div className="divide-y divide-[var(--border-color)]">
                        {linhaDre('Receita Bruta de Vendas', d.receitaBruta, 'positivo', `${d.qtdPedidos} pedidos · ${d.qtdItensVendidos} itens`)}
                        {linhaDre('(-) Custo das Mercadorias Vendidas (CMV)', -d.custoMercadoriasVendidas, 'negativo', 'Custos de aquisição importados via NFe/XML')}
                        {linhaDre('(=) Lucro Bruto', d.lucroBruto, d.lucroBruto >= 0 ? 'positivo' : 'negativo')}
                        {linhaDre('(-) Impostos Estimados', -d.impostosEstimados, 'negativo', `Alíquota estimada ${(d.aliquotaImposto * 100).toFixed(0)}%`) }
                        {linhaDre('(-) Despesas Operacionais', -d.despesasOperacionais, 'negativo', 'Saídas registradas no período')}
                    </div>
                    <div className="p-6 bg-[var(--text-main)] text-[var(--bg-card)] flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40 mb-1">Lucro Líquido Real do Período</p>
                            <p className="text-sm font-bold opacity-70">Ticket médio: R$ {d.ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <h3 className={`text-4xl font-black tracking-tighter ${d.lucroLiquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {d.lucroLiquido >= 0 ? 'R$ ' : '- R$ '}{Math.abs(d.lucroLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </h3>
                    </div>
                    {d.qtdPedidosCancelados > 0 && (
                        <p className="p-4 text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest opacity-60">
                            Obs: {d.qtdPedidosCancelados} pedido(s) cancelado(s) excluído(s) da base de cálculo.
                        </p>
                    )}
                </div>
            </div>
        );
    };

    const baixarCsv = () => {
        if (!report.salesCsv?.csv) return;
        const blob = new Blob([report.salesCsv.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `movimentacao-vendas-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const renderSalesCsv = () => {
        const csv = report.salesCsv;
        if (!csv) return null;
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-600 text-white p-6 rounded-[2rem] shadow-xl">
                    <div className="flex items-center gap-4">
                        <FileSpreadsheet size={28}/>
                        <div>
                            <p className="font-black text-sm uppercase tracking-tight">Arquivo de Movimentação de Vendas</p>
                            <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mt-0.5">Formato CSV separado por ";" — compatível com Excel pt-BR</p>
                        </div>
                    </div>
                    <button onClick={baixarCsv} className="bg-white text-emerald-700 px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-50 transition-all active:scale-95 shadow-lg">
                        <Download size={18}/> BAIXAR CSV ({csv.linhas.length} linhas)
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-2xl border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Vendas no Período</p>
                        <p className="text-xl font-black text-[var(--text-main)]">{csv.linhas.length}</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-2xl border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Faturamento Bruto</p>
                        <p className="text-xl font-black text-emerald-600">R$ {csv.totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-2xl border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Impostos Estimados (7%)</p>
                        <p className="text-xl font-black text-amber-600">R$ {csv.totalImpostos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden shadow-xl">
                    <div className="max-h-[45vh] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-[var(--text-main)] text-[var(--bg-card)] font-black uppercase text-[9px] tracking-widest sticky top-0 z-10 shadow-lg">
                                <tr>
                                    <th className="p-4">Data</th>
                                    <th className="p-4">Cupom</th>
                                    <th className="p-4">CPF Cliente</th>
                                    <th className="p-4">Pagamento</th>
                                    <th className="p-4 text-right">Alíq.</th>
                                    <th className="p-4 text-right">Imposto Est.</th>
                                    <th className="p-4 text-right">Valor Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
                                {csv.linhas.length === 0 ? (
                                    <tr><td colSpan={7} className="p-20 text-center font-black uppercase text-xs opacity-30">Nenhuma venda encontrada para este período.</td></tr>
                                ) : csv.linhas.map((l: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-[var(--bg-main)]/30 transition-all">
                                        <td className="p-4 text-[10px] font-black font-mono text-[var(--text-main)]">{l.DATA}</td>
                                        <td className="p-4 text-[10px] font-black text-[var(--text-main)]">{l.NUMERO_CUPOM}</td>
                                        <td className="p-4 text-[10px] font-black font-mono text-[var(--text-muted)]">{l.CPF_CLIENTE}</td>
                                        <td className="p-4">
                                            <span className="px-2.5 py-1 rounded-lg font-black text-[10px] uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">{l.FORMA_PAGAMENTO}</span>
                                        </td>
                                        <td className="p-4 text-right text-[10px] font-black text-[var(--text-muted)]">{l['ALIQUOTA_ESTIMADA(%)']}%</td>
                                        <td className="p-4 text-right text-[10px] font-black text-amber-600">R$ {l.IMPOSTO_ESTIMADO}</td>
                                        <td className="p-4 text-right text-xs font-black text-[var(--text-main)]">R$ {l.VALOR_TOTAL}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="text-[9px] text-[var(--text-muted)] text-center uppercase font-black tracking-widest opacity-60">
                    CPF sanitizado (LGPD) — os 7 primeiros dígitos são mascarados.
                </p>
            </div>
        );
    };

    const renderStockAbc = () => {
        const abc = report.stockAbc;
        if (!abc) return null;
        const corClasse = (c: string) => c === 'A' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : c === 'B' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-red-500/15 text-red-600 border-red-500/30';
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-2xl border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Receita Gerada (Giro)</p>
                        <p className="text-xl font-black text-emerald-600">R$ {abc.totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-2xl border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Inventário Total (Custo)</p>
                        <p className="text-xl font-black text-[var(--text-main)]">R$ {abc.totalValorEstoqueCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-red-500/5 p-5 rounded-2xl border border-red-500/20">
                        <p className="text-[9px] font-black uppercase text-red-500 tracking-widest mb-1">Estoque Parado ({abc.qtdProdutosParados} itens)</p>
                        <p className="text-xl font-black text-red-500">R$ {abc.valorEstoqueParado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-main)]/30 flex items-center justify-between">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
                            <PieChart size={16} className="text-amber-600"/> Classificação A/B/C por Faturamento
                        </h4>
                        <span className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest">{abc.qtdProdutosTotais} produtos</span>
                    </div>
                    <div className="max-h-[45vh] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-[var(--text-main)] text-[var(--bg-card)] font-black uppercase text-[9px] tracking-widest sticky top-0 z-10 shadow-lg">
                                <tr>
                                    <th className="p-4">Produto</th>
                                    <th className="p-4 text-right">Qtd Vendida</th>
                                    <th className="p-4 text-right">Receita</th>
                                    <th className="p-4 text-right">% Acum.</th>
                                    <th className="p-4 text-right">Estoque</th>
                                    <th className="p-4 text-right">Valor (Custo)</th>
                                    <th className="p-4 text-center">Classe</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
                                {abc.linhas.length === 0 ? (
                                    <tr><td colSpan={7} className="p-20 text-center font-black uppercase text-xs opacity-30">Nenhum produto cadastrado.</td></tr>
                                ) : abc.linhas.map((l: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-[var(--bg-main)]/30 transition-all">
                                        <td className="p-4">
                                            <p className="text-[11px] font-black uppercase text-[var(--text-main)] tracking-tight max-w-[220px] truncate">{l.name}</p>
                                            {l.qtdVendida === 0 && <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Sem giro no período</span>}
                                        </td>
                                        <td className="p-4 text-right text-[11px] font-black text-[var(--text-main)]">{l.qtdVendida}</td>
                                        <td className="p-4 text-right text-[11px] font-black text-emerald-600">R$ {l.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="p-4 text-right text-[11px] font-black text-[var(--text-muted)]">{l.acumuladoPct.toFixed(1)}%</td>
                                        <td className="p-4 text-right text-[11px] font-black text-[var(--text-main)]">{l.estoque}</td>
                                        <td className="p-4 text-right text-[11px] font-black text-[var(--text-main)]">R$ {l.valorEstoqueCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-block px-3 py-1 rounded-lg font-black text-[9px] uppercase tracking-widest border ${corClasse(l.classe)}`}>{l.classe}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="text-[9px] text-[var(--text-muted)] text-center uppercase font-black tracking-widest opacity-60">
                    Critério: A ≤ 80% do faturamento · B ≤ 95% · C restante. Inventário valorizado a custo para balanço patrimonial.
                </p>
            </div>
        );
    };

    const renderUsersCredits = () => {
        const lista = (users || [])
            .filter((u: User) => !isAdminRole(u.role))
            .map(u => ({ u, saldo: Number(u.walletBalance) || 0, gastoSemanal: Number(u.weeklySpent) || 0 }))
            .sort((a, b) => b.saldo - a.saldo);
        const ativos = lista.filter(x => x.u.status === 'active').length;
        const pendentes = lista.filter(x => x.u.status === 'pending').length;
        const suspensos = lista.filter(x => x.u.status === 'suspended').length;
        const totalSaldo = lista.reduce((a, b) => a + b.saldo, 0);
        const totalGastoSemanal = lista.reduce((a, b) => a + b.gastoSemanal, 0);
        const saldoMedio = lista.length ? totalSaldo / lista.length : 0;
        const statusBadge = (s: string) =>
            s === 'active' ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
            : s === 'pending' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30'
            : 'bg-red-500/15 text-red-600 border-red-500/30';
        const statusLabel = (s: string) =>
            s === 'active' ? 'Ativo' : s === 'pending' ? 'Pendente' : 'Suspenso';
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-emerald-600 p-5 rounded-[2rem] shadow-xl text-white relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Saldo Total Disponível</p>
                        <p className="text-2xl font-black tracking-tighter">R$ {totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <p className="text-[9px] font-bold opacity-60 uppercase tracking-widest mt-1">{lista.length} familiares</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-[2rem] border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Familiares Ativos</p>
                        <p className="text-2xl font-black text-emerald-600">{ativos}</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-[2rem] border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Saldo Médio por Familiar</p>
                        <p className="text-2xl font-black text-[var(--text-main)]">R$ {saldoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-[2rem] border border-[var(--border-color)]">
                        <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest mb-1">Gasto Semanal Acumulado</p>
                        <p className="text-2xl font-black text-amber-600">R$ {totalGastoSemanal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                {(pendentes > 0 || suspensos > 0) && (
                    <div className="flex flex-wrap gap-3">
                        {pendentes > 0 && (
                            <span className="px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-widest bg-amber-500/15 text-amber-600 border border-amber-500/30">{pendentes} pendente(s)</span>
                        )}
                        {suspensos > 0 && (
                            <span className="px-3 py-1.5 rounded-xl font-black text-[9px] uppercase tracking-widest bg-red-500/15 text-red-600 border border-red-500/30">{suspensos} suspenso(s)</span>
                        )}
                    </div>
                )}

                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden shadow-xl">
                    <div className="max-h-[50vh] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="bg-[var(--text-main)] text-[var(--bg-card)] font-black uppercase text-[9px] tracking-widest sticky top-0 z-10 shadow-lg">
                                <tr>
                                    <th className="p-5">#</th>
                                    <th className="p-5">Familiar</th>
                                    <th className="p-5">CPF</th>
                                    <th className="p-5">Status</th>
                                    <th className="p-5 text-right">Saldo Disponível</th>
                                    <th className="p-5 text-right">Gasto Semanal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)] bg-[var(--bg-card)]">
                                {lista.length === 0 ? (
                                    <tr><td colSpan={6} className="p-20 text-center font-black uppercase text-xs opacity-30">Nenhum familiar cadastrado.</td></tr>
                                ) : lista.map((x: any, idx: number) => (
                                    <tr key={x.u.id} className="hover:bg-[var(--bg-main)]/30 transition-all group">
                                        <td className="p-5 text-[10px] font-black text-[var(--text-muted)]">{String(idx + 1).padStart(2, '0')}</td>
                                        <td className="p-5">
                                            <p className="text-[11px] font-black uppercase text-[var(--text-main)] tracking-tight max-w-[200px] truncate">{x.u.name || '—'}</p>
                                            {x.u.inmateName && <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest truncate max-w-[200px]">PUP: {x.u.inmateName}</p>}
                                        </td>
                                        <td className="p-5 text-[10px] font-black font-mono text-[var(--text-muted)]">{x.u.cpf || '—'}</td>
                                        <td className="p-5">
                                            <span className={`px-3 py-1 rounded-lg font-black text-[10px] uppercase tracking-widest border ${statusBadge(x.u.status)}`}>{statusLabel(x.u.status)}</span>
                                        </td>
                                        <td className={`p-5 text-right font-black text-sm tracking-tighter ${x.saldo > 0 ? 'text-emerald-600' : 'text-[var(--text-muted)]'}`}>R$ {x.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="p-5 text-right font-black text-sm tracking-tighter text-amber-600">R$ {x.gastoSemanal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                            {lista.length > 0 && (
                                <tfoot className="bg-[var(--bg-main)]/40">
                                    <tr className="border-t-2 border-[var(--border-color)]">
                                        <td colSpan={4} className="p-5 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Total de {lista.length} familiares</td>
                                        <td className="p-5 text-right font-black text-[var(--text-main)]">R$ {totalSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="p-5 text-right font-black text-[var(--text-main)]">R$ {totalGastoSemanal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
                <p className="text-[9px] text-[var(--text-muted)] text-center uppercase font-black tracking-widest opacity-60">
                    Saldos em tempo real — atualize a página para revalidar os valores.
                </p>
            </div>
        );
    };

    const printUsersCredits = () => {
        const lista = (users || [])
            .filter((u: User) => !isAdminRole(u.role))
            .map(u => ({ name: u.name || '—', cpf: u.cpf || '—', status: u.status, saldo: Number(u.walletBalance) || 0, gastoSemanal: Number(u.weeklySpent) || 0 }))
            .sort((a, b) => b.saldo - a.saldo);
        const totalSaldo = lista.reduce((a, b) => a + b.saldo, 0);
        const totalGasto = lista.reduce((a, b) => a + b.gastoSemanal, 0);
        const ativos = lista.filter(x => x.status === 'active').length;
        const hoje = new Date().toLocaleDateString('pt-BR');
        const linha = lista.map((x, i) => `
            <tr>
                <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${String(i + 1).padStart(2, '0')}</td>
                <td style="padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-transform:uppercase;">${x.name}</td>
                <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">${x.cpf}</td>
                <td style="text-align:center;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;">${x.status === 'active' ? 'Ativo' : x.status === 'pending' ? 'Pendente' : 'Suspenso'}</td>
                <td style="text-align:right;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;">R$ ${x.saldo.toFixed(2)}</td>
                <td style="text-align:right;padding:9px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">R$ ${x.gastoSemanal.toFixed(2)}</td>
            </tr>`).join('');
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório de Créditos dos Usuários</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:#0f172a; padding:32px; background:#fff; }
    .cabecalho { border-bottom:3px solid #059669; padding-bottom:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:flex-end; }
    .cabecalho h1 { font-size:20px; text-transform:uppercase; letter-spacing:1px; color:#059669; }
    .cabecalho p { font-size:12px; color:#64748b; margin-top:4px; }
    .meta { text-align:right; font-size:11px; color:#64748b; }
    .cards { display:flex; gap:12px; margin-bottom:22px; }
    .card { flex:1; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; }
    .card p.titulo { font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; color:#94a3b8; margin-bottom:4px; }
    .card p.valor { font-size:18px; font-weight:800; color:#059669; }
    table { width:100%; border-collapse:collapse; }
    thead th { background:#0f172a; color:#fff; padding:10px; font-size:10px; text-transform:uppercase; letter-spacing:1px; text-align:left; }
    tfoot td { padding:10px; font-weight:800; font-size:12px; background:#f8fafc; border-top:2px solid #0f172a; }
    .rodape { margin-top:22px; text-align:center; font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; }
    .assinatura { margin-top:48px; display:flex; justify-content:space-between; }
    .assinatura div { width:40%; border-top:1px solid #64748b; padding-top:8px; font-size:10px; text-transform:uppercase; text-align:center; color:#475569; }
    @media print { body { padding:16px; } }
</style>
</head>
<body>
    <div class="cabecalho">
        <div>
            <h1>Relatório de Créditos dos Usuários</h1>
            <p>Mercado Fácil — Gestão Penitenciária de Alta Performance</p>
        </div>
        <div class="meta">
            <p>Emitido em: <b>${hoje}</b></p>
            <p>${lista.length} familiares cadastrados</p>
        </div>
    </div>
    <div class="cards">
        <div class="card"><p class="titulo">Saldo Total Disponível</p><p class="valor">R$ ${totalSaldo.toFixed(2)}</p></div>
        <div class="card"><p class="titulo">Familiares Ativos</p><p class="valor">${ativos}</p></div>
        <div class="card"><p class="titulo">Gasto Semanal Acumulado</p><p class="valor">R$ ${totalGasto.toFixed(2)}</p></div>
        <div class="card"><p class="titulo">Saldo Médio</p><p class="valor">R$ ${lista.length ? (totalSaldo / lista.length).toFixed(2) : '0.00'}</p></div>
    </div>
    <table>
        <thead>
            <tr><th style="text-align:center;width:36px;">#</th><th>Familiar</th><th style="text-align:center;">CPF</th><th style="text-align:center;">Status</th><th style="text-align:right;">Saldo Disponível</th><th style="text-align:right;">Gasto Semanal</th></tr>
        </thead>
        <tbody>${linha}</tbody>
        <tfoot>
            <tr><td colspan="4" style="text-align:right;">TOTAL</td><td style="text-align:right;">R$ ${totalSaldo.toFixed(2)}</td><td style="text-align:right;">R$ ${totalGasto.toFixed(2)}</td></tr>
        </tfoot>
    </table>
    <div class="assinatura">
        <div>Emitido por: ${(settings as any)?.adminName || 'Administração'}</div>
        <div>Assinatura / Carimbo</div>
    </div>
    <p class="rodape">Documento gerado pelo sistema Mercado Fácil — uso interno</p>
</body>
</html>`;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
    };

    const renderDailyClosing = () => {
        const dc = report.dailyClosing;
        if (!dc) return null;
        const maxAmount = Math.max(...dc.paymentRows.map((r: any) => r.amount), 0.01);
        const fmt = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-[2rem] border border-[var(--border-color)] shadow-inner">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg"><TrendingUp size={16}/></div>
                            <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest leading-none">Vendas do Período</p>
                        </div>
                        <p className="text-2xl font-black text-emerald-600 tracking-tighter">{fmt(dc.totalSales)}</p>
                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1">{dc.salesCount} venda(s)</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-[2rem] border border-[var(--border-color)] shadow-inner">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-red-500/10 text-red-600 rounded-lg"><TrendingDown size={16}/></div>
                            <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest leading-none">Despesas do Período</p>
                        </div>
                        <p className="text-2xl font-black text-red-600 tracking-tighter">{fmt(dc.totalExpenses)}</p>
                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1">{dc.expensesCount} lançamento(s)</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-[2rem] border border-[var(--border-color)] shadow-inner">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-[var(--primary-color)]/10 text-[var(--primary-color)] rounded-lg"><Activity size={16}/></div>
                            <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest leading-none">Resultado do Período</p>
                        </div>
                        <p className={`text-2xl font-black tracking-tighter ${dc.net >= 0 ? 'text-[var(--primary-color)]' : 'text-orange-600'}`}>{fmt(dc.net)}</p>
                    </div>
                    <div className="bg-[var(--bg-main)]/50 p-5 rounded-[2rem] border border-[var(--border-color)] shadow-inner">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg"><Wallet size={16}/></div>
                            <p className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-widest leading-none">Depósitos Aprovados</p>
                        </div>
                        <p className="text-2xl font-black text-indigo-600 tracking-tighter">{fmt(dc.totalDeposits)}</p>
                        <p className="text-[9px] font-black text-[var(--text-muted)] uppercase tracking-widest mt-1">{dc.depositsCount} aprovação(ões)</p>
                    </div>
                </div>

                <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[2.5rem] overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-main)]/30">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)] flex items-center gap-2">
                            <PieChart size={16}/> Vendas por Forma de Pagamento
                        </h4>
                    </div>
                    <div className="divide-y divide-[var(--border-color)]">
                        {dc.paymentRows.length === 0 && (
                            <div className="p-8 text-center font-black uppercase text-xs opacity-30">Nenhuma venda neste período.</div>
                        )}
                        {dc.paymentRows.map((row: any, idx: number) => (
                            <div key={idx} className="p-5">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-black text-[var(--text-main)] uppercase tracking-tight">{row.label}</span>
                                    <span className="text-sm font-black text-[var(--text-main)] tracking-tighter">{fmt(row.amount)}</span>
                                </div>
                                <div className="h-2 bg-[var(--bg-main)] rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.max((row.amount / maxAmount) * 100, row.amount > 0 ? 4 : 0)}%`, backgroundColor: ['#10b981', '#6366f1', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'][idx % 6] }}></div>
                                </div>
                            </div>
                        ))}
                        <div className="p-5 flex justify-between items-center bg-[var(--bg-main)]/30">
                            <span className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest">Total de Vendas</span>
                            <span className="text-base font-black text-[var(--text-main)] tracking-tighter">{fmt(dc.totalSales)}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const printDailyClosing = () => {
        const dc = report.dailyClosing;
        if (!dc) return;
        const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
        const hoje = new Date().toLocaleDateString('pt-BR');
        const linhas = dc.paymentRows.map((r: any) => `<tr><td>${r.label}</td><td style="text-align:right;">${fmt(r.amount)}</td></tr>`).join('');
        const html = `<html><head><title>${report.title}</title><style>
            body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;color:#0f172a}
            h1{font-size:22px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
            .sub{color:#64748b;font-size:13px;margin-bottom:24px}
            table{width:100%;border-collapse:collapse}
            th{padding:10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #0f172a}
            td{padding:11px 10px;font-size:14px;border-bottom:1px solid #e2e8f0;font-weight:600}
            tfoot td{font-size:15px;font-weight:800;border-top:2px solid #0f172a}
            .cards{display:flex;gap:14px;margin:18px 0 26px;flex-wrap:wrap}
            .card{flex:1;min-width:140px;padding:16px 18px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0}
            .card p{margin:0}
            .card .titulo{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#64748b;font-weight:700;margin-bottom:6px}
            .card .valor{font-size:20px;font-weight:800}
            .assinatura{margin-top:70px;display:flex;justify-content:space-between;font-size:13px;color:#475569}
            .rodape{margin-top:30px;font-size:11px;color:#94a3b8;text-align:center}
            @media print{body{background:white!important;padding:20px!important}}
        </style></head><body>
            <h1>${report.title}</h1>
            <p class="sub">Período: ${report.period} · Emitido em: ${hoje} · ${dc.salesCount} venda(s) no período</p>
            <div class="cards">
                <div class="card"><p class="titulo">Vendas</p><p class="valor">${fmt(dc.totalSales)}</p></div>
                <div class="card"><p class="titulo">Despesas</p><p class="valor">${fmt(dc.totalExpenses)}</p></div>
                <div class="card"><p class="titulo">Resultado</p><p class="valor">${fmt(dc.net)}</p></div>
                <div class="card"><p class="titulo">Depósitos Aprovados</p><p class="valor">${fmt(dc.totalDeposits)}</p></div>
            </div>
            <table>
                <thead><tr><th>Forma de Pagamento</th><th style="text-align:right;">Valor</th></tr></thead>
                <tbody>${linhas}</tbody>
                <tfoot><tr><td>TOTAL DE VENDAS</td><td style="text-align:right;">${fmt(dc.totalSales)}</td></tr></tfoot>
            </table>
            <div class="assinatura"><div>Emitido por: ${(settings as any)?.adminName || 'Administração'}</div><div>Assinatura / Carimbo</div></div>
            <p class="rodape">Documento gerado pelo sistema Mercado Fácil — conferência de caixa</p>
        </body></html>`;
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.print();
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fadeIn" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-[var(--bg-card)] w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] border border-[var(--border-color)] animate-slideUp" style={{ overflow: 'hidden' }}>
                {/* TOOLBAR SUPERIOR — FORA DO CONTEÚDO */}
                <div className="toolbar-recibo-superior w-full flex items-center justify-between shrink-0 px-5 py-4" style={{ backgroundColor: '#0f172a', color: '#ffffff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
                    <div className="flex items-center gap-3">
                        <FileText size={20} className="text-emerald-400"/>
                        <span className="font-black text-sm uppercase tracking-tight text-white" style={{ color: '#ffffff' }}>Visualização do Recibo</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setThermalMode(!thermalMode)}
                            className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border"
                            style={{ color: '#ffffff', backgroundColor: thermalMode ? '#059669' : 'rgba(255,255,255,0.15)', borderColor: thermalMode ? '#059669' : 'rgba(255,255,255,0.2)' }}
                            onMouseOver={(e)=>{if(!thermalMode)e.currentTarget.style.backgroundColor='rgba(255,255,255,0.25)'}} onMouseOut={(e)=>{if(!thermalMode)e.currentTarget.style.backgroundColor='rgba(255,255,255,0.15)'}}
                        >
                            <FileText size={14} className="inline-block mr-1.5 -mt-0.5" /> {thermalMode ? '80mm' : 'Cupom'}
                        </button>
                        <button
                            onClick={() => setFontSize(s => Math.min(s + 2, 24))}
                            className="px-3 py-1.5 rounded-lg text-[13px] font-black transition-all border"
                            style={{ color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.2)' }}
                            onMouseOver={(e)=>e.currentTarget.style.backgroundColor='rgba(255,255,255,0.25)'} onMouseOut={(e)=>e.currentTarget.style.backgroundColor='rgba(255,255,255,0.15)'}
                            title="Aumentar fonte"
                        >A+</button>
                        <button
                            onClick={() => setFontSize(s => Math.max(s - 2, 10))}
                            className="px-3 py-1.5 rounded-lg text-[13px] font-black transition-all border"
                            style={{ color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.2)' }}
                            onMouseOver={(e)=>e.currentTarget.style.backgroundColor='rgba(255,255,255,0.25)'} onMouseOut={(e)=>e.currentTarget.style.backgroundColor='rgba(255,255,255,0.15)'}
                            title="Diminuir fonte"
                        >A-</button>
                        <span className="text-[10px] font-mono mx-1" style={{ color: '#94a3b8' }}>{fontSize}px</span>
                        <button onClick={onClose} className="p-2 rounded-lg transition-all active:scale-90" style={{ color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.15)' }} onMouseOver={(e)=>e.currentTarget.style.backgroundColor='#ef4444'} onMouseOut={(e)=>e.currentTarget.style.backgroundColor='rgba(255,255,255,0.15)'} title="Fechar">
                            <X size={22}/>
                        </button>
                    </div>
                </div>

                {/* Report Info Header */}
                <div className="p-6 bg-[var(--text-main)] text-[var(--bg-card)] flex items-center gap-4 shrink-0">
                    <div className="p-3 bg-[var(--bg-card)] text-[var(--text-main)] rounded-2xl shadow-xl">
                        <FileText size={24}/>
                    </div>
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-tighter leading-none">{report.title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="px-2.5 py-0.5 bg-[var(--primary-color)]/20 text-[var(--primary-color)] rounded-full text-[10px] font-black uppercase tracking-widest">{report.period}</span>
                            <span className="text-[10px] font-black text-[var(--bg-card)] opacity-40 uppercase tracking-[0.2em]">Cód: {Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                {/* Content — 80mm thermal when active */}
                <div className={`flex-1 overflow-y-auto custom-scrollbar ${thermalMode ? 'bg-white' : 'bg-[var(--bg-main)]/20 p-8 lg:p-12'}`}>
                    <div className={`${thermalMode ? 'max-w-[380px] mx-auto bg-white p-6 min-h-full font-mono' : ''}`} style={{ fontSize: `${fontSize}px` }}>
                        {report.type === 'GENERAL' && renderGeneral()}
                        {(report.type === 'FINANCIAL' || ['ACCOUNTABILITY', 'INDIVIDUAL', 'STOCK_LOW', 'SALES_BY_CATEGORY'].includes(report.type)) && renderFinancial()}
                        {report.type === 'USERS_CREDITS' && renderUsersCredits()}
                        {report.type === 'DRE_MONTHLY' && renderDre()}
                        {report.type === 'SALES_CSV' && renderSalesCsv()}
                        {report.type === 'STOCK_ABC' && renderStockAbc()}
                        {report.type === 'DAILY_CLOSING' && renderDailyClosing()}
                    </div>
                </div>

                {/* Footer Actions — escondido na impressão */}
                <div className="toolbar-recibo-superior p-6 border-t border-[var(--border-color)] flex flex-col sm:flex-row justify-between items-center bg-[var(--bg-card)] gap-4 shrink-0">
                    <div className="flex items-center gap-3 opacity-40">
                        <Activity size={14} className="text-[var(--text-muted)]"/>
                        <p className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] text-center sm:text-left leading-relaxed">
                            © Mercado Fácil - Gestão Penitenciária de Alta Performance
                        </p>
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button onClick={() => {
                            const jsonStr = JSON.stringify(report, null, 2);
                            const blob = new Blob([jsonStr], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `relatorio-${report.title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            URL.revokeObjectURL(url);
                        }} className="flex-1 sm:flex-none px-6 py-3 bg-emerald-600/10 text-emerald-600 border border-emerald-600/20 font-black rounded-2xl hover:bg-emerald-600 hover:text-white transition-all text-[9px] uppercase tracking-widest flex items-center justify-center gap-2">
                            <Download size={16}/> JSON
                        </button>
                        <button onClick={() => {
                            if (report.type === 'USERS_CREDITS') {
                                printUsersCredits();
                                return;
                            }
                            if (report.type === 'DAILY_CLOSING') {
                                printDailyClosing();
                                return;
                            }
                            const printWindow = window.open('', '_blank');
                            if (printWindow) {
                                const thermalClass = thermalMode ? 'max-width:380px;margin:0 auto;font-family:monospace;' : '';
                                const html = `<html><head><title>${report.title}</title><style>body{font-family:monospace;padding:40px;${thermalClass}}h1{font-size:24px;text-transform:uppercase}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}.entry{color:#10b981}.exit{color:#ef4444}.summary{margin-top:30px;padding:20px;background:#f8fafc;border-radius:12px}@media print{body{background:white!important;padding:20px!important}}</style></head><body><h1>${report.title}</h1><p>${report.period}</p><table>${report.items.map((i: any) => `<tr><td>${new Date(i.date).toLocaleDateString('pt-BR')}</td><td class="${i.type === 'ENTRY' ? 'entry' : 'exit'}">${i.type === 'ENTRY' ? 'Entrada' : 'Saída'}</td><td>${i.description}</td><td class="${i.type === 'ENTRY' ? 'entry' : 'exit'}">${i.type === 'ENTRY' ? '+' : '-'} R$ ${i.amount.toFixed(2)}</td></tr>`).join('')}</table><div class="summary"><h2>Resumo</h2><p>Total Entradas: R$ ${report.summary.totalEntries.toFixed(2)}</p><p>Total Saídas: R$ ${report.summary.totalExits.toFixed(2)}</p><p>Resultado Líquido: R$ ${report.summary.net.toFixed(2)}</p></div></body></html>`;
                                printWindow.document.write(html);
                                printWindow.document.close();
                                printWindow.print();
                            }
                        }} className="flex-1 sm:flex-none px-8 py-3 bg-[var(--text-main)] text-[var(--bg-card)] font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.2em]">
                            <Printer size={18}/> IMPRIMIR / SALVAR PDF
                        </button>
                    </div>
                </div>
            </div>
            <style>{`
                @media screen {
                    .toolbar-recibo-superior {
                        display: flex !important;
                        position: relative;
                        width: 100%;
                    }
                }
                @media print {
                    .toolbar-recibo-superior {
                        display: none !important;
                    }
                    body { background: white !important; }
                    @page { margin: 0 !important; }
                }
            `}</style>
        </div>
    );
};
