import React from 'react';
import {
  ClipboardList, FileText, Search, TrendingUp, Users, Package, CreditCard,
  BarChart3, RefreshCcw, Calendar, Download, Landmark, FileSpreadsheet, PieChart,
  Wallet, Coins, Printer
} from 'lucide-react';
import { User } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { gerarRelatorioCredito, imprimirCupom, imprimirRelatorioCreditoA4 } from '../../utils/printUtils';

interface AdminReportsTabProps {
  reportConfig: any;
  setReportConfig: (config: any) => void;
  users: User[];
  handleOpenReport: () => void;
  handleExportExcel: () => void;
  settings?: any;
}

const getQuickDateRange = (period?: string): { start: Date; end: Date } => {
  const today = new Date();
  today.setHours(0,0,0,0);
  const end = new Date();
  end.setHours(23,59,59,999);

  const safePeriod = period || 'today';

  if (safePeriod === 'today') return { start: today, end };
  if (safePeriod === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    return { start, end };
  }
  if (safePeriod === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start, end };
  }
  return { start: today, end };
};

export const AdminReportsTab: React.FC<AdminReportsTabProps> = ({
  reportConfig, setReportConfig, users, handleOpenReport, handleExportExcel, settings
}) => {
  const { colors } = useTheme();
  const [showUserDropdown, setShowUserDropdown] = React.useState(false);
  const [creditSearch, setCreditSearch] = React.useState('');

  const apenasComSaldo = reportConfig.type === 'CREDITS_POSITIVE';
  const apenasSemSaldo = reportConfig.type === 'CREDITS_ZERO';
  const creditModeLabel = apenasComSaldo ? 'com crédito' : apenasSemSaldo ? 'sem crédito' : 'todos os registros';
  const termo = (creditSearch || '').trim().toLowerCase();
  const digitosTermo = termo.replace(/\D/g, '');
  const creditList = (users || []).filter(u => {
    if (u.role === 'ADMIN' || u.role === 'MASTER' || u.role === 'master') return false;
    if (termo) {
      const nomeOk = (u.name || '').toLowerCase().includes(termo);
      const cpfOk = digitosTermo.length > 0 && (u.cpf || '').replace(/\D/g, '').includes(digitosTermo);
      const uidOk = (u.id || '').toLowerCase().includes(termo);
      if (!nomeOk && !cpfOk && !uidOk) return false;
    }
    const saldo = Number(u.walletBalance || 0);
    if (apenasComSaldo) return saldo > 0;
    if (apenasSemSaldo) return saldo <= 0;
    return true;
  });
  const creditTotal = creditList.reduce((s, u) => s + Number(u.walletBalance || 0), 0);
  const creditComSaldo = creditList.filter(u => Number(u.walletBalance || 0) > 0).length;
  const creditSemSaldo = creditList.length - creditComSaldo;

  const creditTitle = apenasComSaldo
    ? `FAMILIARES COM CRÉDITO EM CONTA (${creditList.length})`
    : apenasSemSaldo
      ? `FAMILIARES SEM CRÉDITO EM CONTA (${creditList.length})`
      : `RELATÓRIO GERAL DE CRÉDITOS (${creditList.length})`;

  const handlePrintCredits = () => {
    if (creditList.length === 0) return;
    imprimirCupom(gerarRelatorioCredito(creditList as any, apenasComSaldo, termo ? `CONSULTA INDIVIDUAL (${creditList.length} REGISTRO(S))` : undefined));
  };

  const handlePrintCreditsA4 = () => {
    if (creditList.length === 0) return;
    const subtitulo = termo
      ? `Consulta individual — ${creditModeLabel} (${creditList.length} resultado(s))`
      : apenasComSaldo
        ? 'Somente familiares com saldo em conta maior que R$ 0,00'
        : apenasSemSaldo
          ? 'Somente familiares sem saldo em conta (R$ 0,00 ou negativo)'
          : 'Todos os familiares cadastrados, com e sem saldo';
    imprimirRelatorioCreditoA4(creditList as any, creditTitle, settings, subtitulo);
  };

  const reportOptions = [
    { id: 'GENERAL', name: 'Resumo Geral', desc: 'Visão panorâmica do sistema e saúde financeira.', icon: <BarChart3 className="text-blue-500" size={24}/> },
    { id: 'FINANCIAL', name: 'Fluxo de Caixa', desc: 'Detalhamento de todas as entradas e saídas.', icon: <TrendingUp className="text-emerald-500" size={24}/> },
    { id: 'ACCOUNTABILITY', name: 'Prestação de Contas', desc: 'Relatório para auditoria e associados.', icon: <ClipboardList className="text-purple-500" size={24}/> },
    { id: 'PRODUCTS_ALL', name: 'Catálogo de Produtos', desc: 'Lista completa de itens, preços e estoque.', icon: <Package className="text-blue-400" size={24}/> },
    { id: 'USERS_CREDITS', name: 'Usuários e Saldos', desc: 'Relatório de familiares e créditos em conta.', icon: <Users className="text-indigo-600" size={24}/> },
    { id: 'CREDITS_ALL', name: 'Todos os Créditos', desc: 'Listagem completa com filtro por com/sem crédito, individual e em lote.', icon: <Wallet className="text-emerald-500" size={24}/> },
    { id: 'CREDITS_POSITIVE', name: 'Créditos Ativos (com Saldo)', desc: 'Familiários com crédito em conta > R$ 0, consulta individual e em lote.', icon: <Wallet className="text-emerald-500" size={24}/> },
    { id: 'CREDITS_ZERO', name: 'Créditos Zerados (sem Saldo)', desc: 'Familiários sem crédito em conta, consulta individual e em lote.', icon: <Coins className="text-slate-500" size={24}/> },
    { id: 'INDIVIDUAL', name: 'Extrato Individual', desc: 'Movimentações completas de um familiar.', icon: <Users className="text-orange-500" size={24}/> },
    { id: 'COLLECTIVE_PURCHASES', name: 'Compras Coletivas', desc: 'Consolidado de vendas por período.', icon: <CreditCard className="text-emerald-400" size={24}/> },
    { id: 'STOCK_LOW', name: 'Reposição / Inventário', desc: 'Itens abaixo da margem de segurança.', icon: <Package className="text-red-500" size={24}/> },
    { id: 'SALES_BY_CATEGORY', name: 'Vendas por Grupo', desc: 'Desempenho de categorias de produtos.', icon: <RefreshCcw className="text-indigo-500" size={24}/> },
    { id: 'DRE_MONTHLY', name: 'Fechamento Mensal (DRE)', desc: 'DRE simplificado: receita, custo das mercadorias e lucro líquido real.', icon: <Landmark className="text-teal-600" size={24}/> },
    { id: 'SALES_CSV', name: 'Movimentação de Vendas', desc: 'CSV/Excel p/ contador: data, cupom, CPF, pagamento, imposto e valor.', icon: <FileSpreadsheet className="text-green-600" size={24}/> },
    { id: 'STOCK_ABC', name: 'Curva ABC de Estoque', desc: 'Giro dos produtos e valor do inventário parado p/ balanço patrimonial.', icon: <PieChart className="text-amber-600" size={24}/> },
  ];

  return (
    <div className="animate-slideUp space-y-8 pb-20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--bg-card)] p-6 rounded-3xl border border-[var(--border-color)] shadow-sm">
            <h2 className="text-xl font-black text-[var(--text-main)] flex items-center gap-2 uppercase tracking-tight">
                <ClipboardList size={24} className="text-emerald-400"/> Central de Relatórios
            </h2>
            <div className="flex items-center gap-2 text-[10px] font-black text-[var(--text-muted)] uppercase tracking-widest bg-[var(--bg-main)] px-4 py-2 rounded-xl border border-[var(--border-color)]">
                <Calendar size={14}/> {new Date().toLocaleDateString('pt-BR')}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-6">
                <p className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest ml-2">1. Selecione o Tipo de Relatório</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reportOptions.map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => setReportConfig({...reportConfig, type: opt.id})}
                            className={`p-5 rounded-[2rem] border-2 transition-all text-left flex items-start gap-4 group ${reportConfig.type === opt.id ? 'bg-emerald-600 border-emerald-600 shadow-xl' : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-emerald-500'}`}
                        >
                            <div className={`p-3 rounded-2xl ${reportConfig.type === opt.id ? 'bg-[var(--bg-card)]/20' : 'bg-[var(--bg-main)]'}`}>
                                {opt.icon}
                            </div>
                            <div className="min-w-0">
                                <p className={`font-black text-xs uppercase tracking-tight mb-1 truncate ${reportConfig.type === opt.id ? 'text-white' : 'text-[var(--text-main)]'}`}>{opt?.name || 'Relatório'}</p>
                                <p className={`text-[9px] font-medium leading-snug line-clamp-2 ${reportConfig.type === opt.id ? 'text-white/60' : 'text-[var(--text-muted)]'}`}>{opt.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
                <p className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest ml-2">2. Parametrização e Filtros</p>
                <div className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600 rounded-full -mr-16 -mt-16 opacity-5"/>

                    <div className="relative z-10 space-y-6">
                        {reportConfig.type === 'INDIVIDUAL' && (
                            <div className="animate-slideDown space-y-2">
                                <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1">Familiar / CPF</label>
                                <div className="relative group">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-[var(--bg-card)] p-2.5 rounded-2xl border border-[var(--border-color)] group-focus-within:bg-emerald-600 group-focus-within:border-emerald-600 transition-all duration-500 z-10 shadow-sm">
                                        <Search className="text-[var(--text-muted)] group-focus-within:text-white transition-colors" size={18}/>
                                    </div>
                                    <input
                                        className="w-full pl-16 pr-6 py-4.5 bg-[var(--bg-card)] border-2 border-[var(--border-color)] rounded-3xl font-black text-sm text-[var(--text-main)] outline-none focus:border-emerald-500 transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest shadow-inner"
                                        placeholder="DIGITE O NOME OU CPF..."
                                        value={reportConfig.individualSearch}
                                        onChange={e => {
                                            setReportConfig({...reportConfig, individualSearch: e.target.value.toUpperCase()});
                                            setShowUserDropdown(e.target.value.length > 2);
                                        }}
                                        onFocus={() => reportConfig.individualSearch.length > 2 && setShowUserDropdown(true)}
                                        onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
                                    />
                                </div>
                                {showUserDropdown && (
                                    <div className="border border-[var(--border-color)] rounded-2xl mt-2 max-h-48 overflow-y-auto bg-[var(--bg-card)] shadow-2xl absolute w-full z-50 custom-scrollbar">
                                        {(users || []).filter(u => (u.name || '').toLowerCase().includes((reportConfig.individualSearch || '').toLowerCase()) || (u.cpf || '').includes(reportConfig.individualSearch || '')).map(u => (
                                            <div key={u.id} className="p-4 hover:bg-[var(--bg-main)] cursor-pointer text-xs font-black border-b border-[var(--border-color)] last:border-0 flex justify-between uppercase" onClick={() => { setReportConfig({...reportConfig, selectedUser: u, individualSearch: u?.name || ''}); setShowUserDropdown(false); }}>
                                                <span className="text-[var(--text-main)]">{u?.name || 'Usuário'}</span>
                                                <span className="text-[9px] text-[var(--text-muted)] font-mono">CPF: {u?.cpf || '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {reportConfig.type !== 'STOCK_LOW' && reportConfig.type !== 'CREDITS_ALL' && reportConfig.type !== 'CREDITS_POSITIVE' && reportConfig.type !== 'CREDITS_ZERO' && (
                            <div>
                                <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-2 block ml-1">Período de Análise</label>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {[
                                        { id: 'today', label: 'Hoje' },
                                        { id: 'week', label: 'Semana' },
                                        { id: 'month', label: 'Mês' },
                                        { id: 'custom', label: 'Personalizado' }
                                    ].map(q => (
                                        <button
                                            key={q.id}
                                            onClick={() => {
                                                if (q.id !== 'custom') {
                                                    const range = getQuickDateRange(q.id) || { start: new Date(), end: new Date() };
                                                    const startDate = range?.start ? range.start.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                                                    const endDate = range?.end ? range.end.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                                                    setReportConfig({
                                                        ...reportConfig,
                                                        startDate,
                                                        endDate,
                                                        quickPeriod: q.id
                                                    });
                                                }
                                            }}
                                            className={`flex-1 py-2 px-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all ${(reportConfig.quickPeriod === q.id || (!reportConfig.quickPeriod && q.id === 'today')) ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-[var(--bg-main)]'}`}
                                        >
                                            {q.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1">Data Início</label>
                                        <input type="date" className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-lg font-bold text-sm text-[var(--text-main)] outline-none" value={reportConfig.startDate} onChange={e => setReportConfig({...reportConfig, startDate: e.target.value, quickPeriod: 'custom'})}/>
                                    </div>
                                    <div>
                                        <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-1 block ml-1">Data Fim</label>
                                        <input type="date" className="w-full p-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-lg font-bold text-sm text-[var(--text-main)] outline-none" value={reportConfig.endDate} onChange={e => setReportConfig({...reportConfig, endDate: e.target.value, quickPeriod: 'custom'})}/>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 space-y-3">
                            {reportConfig.type === 'CREDITS_ALL' || reportConfig.type === 'CREDITS_POSITIVE' || reportConfig.type === 'CREDITS_ZERO' ? (
                                <div className="p-5 rounded-2xl bg-emerald-600/10 border border-emerald-600/30 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] leading-relaxed text-center">
                                    <Wallet size={18} className="mx-auto mb-2 text-emerald-500"/>
                                    Consulta de créditos disponível abaixo: filtro com/sem saldo, impressão A4 profissional ou bobina 80mm.
                                </div>
                            ) : (<>
                            <button onClick={handleOpenReport} className="w-full bg-emerald-600 text-white py-5 rounded-[2rem] font-black hover:opacity-90 shadow-[0_20px_40px_-10px_rgba(16,185,129,0.3)] flex items-center justify-center gap-3 uppercase text-[10px] tracking-[0.2em] transition-all transform active:scale-95 group">
                                <FileText size={20} className="group-hover:scale-110 transition-transform text-white"/> {reportConfig.type === 'SALES_CSV' ? 'GERAR ARQUIVO DE MOVIMENTAÇÃO' : 'GERAR RELATÓRIO DOCUMENTADO'}
                            </button>
                            <button onClick={handleExportExcel} className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black hover:bg-emerald-700 shadow-lg flex items-center justify-center gap-3 uppercase text-[10px] tracking-[0.2em] transition-all transform active:scale-95 group disabled:opacity-30 disabled:cursor-not-allowed" disabled={!reportConfig.type}>
                                <Download size={18} className="group-hover:scale-110 transition-transform"/> {reportConfig.type === 'SALES_CSV' ? 'EXPORTAR CSV PARA CONTADOR' : 'EXPORTAR PARA EXCEL'}
                            </button>
                            </>)}
                            <p className="mt-4 text-[9px] text-[var(--text-muted)] text-center uppercase font-black leading-relaxed opacity-60">
                                {reportConfig.type === 'DRE_MONTHLY'
                                    ? 'Consolida receita bruta, custo das mercadorias (NFe/XML) e lucro líquido do período.'
                                    : reportConfig.type === 'SALES_CSV'
                                        ? 'Arquivo compatível com Excel (separador ;) — pronto para o contador.'
                                        : reportConfig.type === 'STOCK_ABC'
                                            ? 'Mapeia o giro A/B/C e o valor do inventário parado para balanço de fim de ano.'
                                            : 'O documento será gerado em formato A4 profissional, seguindo os padrões de auditoria institucional.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {(reportConfig.type === 'CREDITS_ALL' || reportConfig.type === 'CREDITS_POSITIVE' || reportConfig.type === 'CREDITS_ZERO') && (
            <div className="bg-[var(--bg-card)] p-8 rounded-[2.5rem] border border-[var(--border-color)] shadow-2xl space-y-6 relative overflow-hidden animate-slideDown">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="text-[var(--text-main)] font-black text-sm uppercase tracking-tight flex items-center gap-2">
                            {apenasComSaldo ? <Wallet className="text-emerald-500" size={20}/> : apenasSemSaldo ? <Coins className="text-slate-500" size={20}/> : <Wallet className="text-emerald-500" size={20}/>}
                            {apenasComSaldo ? 'Créditos Ativos (com Saldo)' : apenasSemSaldo ? 'Créditos Zerados (sem Saldo)' : 'Todos os Créditos'}
                        </h3>
                        <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest mt-1">
                            {creditList.length} registro(s) · {creditComSaldo} com saldo · {creditSemSaldo} sem saldo · Total: R$ {creditTotal.toFixed(2).replace('.', ',')}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={handlePrintCredits} disabled={creditList.length === 0} className="bg-slate-700 text-white px-5 py-3 rounded-2xl font-black hover:bg-slate-800 shadow-lg flex items-center gap-2 uppercase text-[9px] tracking-[0.2em] transition-all transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                            <Printer size={16}/> {termo ? 'IMPRIMIR CONSULTA (BOBINA)' : 'IMPRIMIR LISTA (BOBINA)'}
                        </button>
                        <button onClick={handlePrintCreditsA4} disabled={creditList.length === 0} className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-black hover:bg-emerald-700 shadow-lg flex items-center gap-2 uppercase text-[9px] tracking-[0.2em] transition-all transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed">
                            <FileText size={16}/> IMPRIMIR A4 PROFISSIONAL
                        </button>
                    </div>
                </div>

                <div>
                    <label className="text-[var(--text-main)] font-black text-[10px] uppercase tracking-widest mb-2 block ml-1">Filtro: quem deve aparecer?</label>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'CREDITS_ALL', label: 'Todos', desc: 'Com e sem saldo' },
                            { id: 'CREDITS_POSITIVE', label: 'Com Crédito', desc: 'Saldo > R$ 0' },
                            { id: 'CREDITS_ZERO', label: 'Sem Crédito', desc: 'Saldo ≤ R$ 0' }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setReportConfig({ ...reportConfig, type: f.id })}
                                className={`py-3 px-2 rounded-2xl font-black text-[9px] uppercase tracking-wider transition-all text-center ${reportConfig.type === f.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-[var(--bg-main)]'}`}
                            >
                                <span className="block">{f.label}</span>
                                <span className={`block text-[8px] mt-0.5 tracking-widest ${reportConfig.type === f.id ? 'text-white/60' : 'opacity-50'}`}>{f.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-[var(--bg-card)] p-2.5 rounded-2xl border border-[var(--border-color)] group-focus-within:bg-emerald-600 transition-all duration-500 z-10 shadow-sm">
                        <Search className="text-[var(--text-muted)]" size={18}/>
                    </div>
                    <input
                        className="w-full pl-16 pr-6 py-4 bg-[var(--bg-card)] border-2 border-[var(--border-color)] focus:border-emerald-500 rounded-3xl font-black text-sm text-[var(--text-main)] outline-none transition-all placeholder:text-[var(--text-muted)] uppercase tracking-widest shadow-inner"
                        placeholder="CONSULTA INDIVIDUAL: DIGITE NOME, CPF OU UID..."
                        value={creditSearch}
                        onChange={e => setCreditSearch(e.target.value.toUpperCase())}
                    />
                </div>

                <div className="border border-[var(--border-color)] rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-[var(--bg-main)] border-b border-[var(--border-color)] text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                        <span className="col-span-4">Cliente</span>
                        <span className="col-span-3">CPF</span>
                        <span className="col-span-4">UID</span>
                        <span className="col-span-1 text-right">Saldo</span>
                    </div>
                    {creditList.length === 0 ? (
                        <div className="px-5 py-10 text-center text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                            Nenhum registro encontrado{termo ? ' para a busca informada' : ''}.
                        </div>
                    ) : (
                        <div className="max-h-96 overflow-y-auto custom-scrollbar">
                            {creditList.map(u => (
                                <div key={u.id} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-[var(--border-color)] last:border-0 items-center text-xs hover:bg-[var(--bg-main)] transition-colors">
                                    <span className="col-span-4 font-black text-[var(--text-main)] truncate uppercase">{u.name || '—'}</span>
                                    <span className="col-span-3 font-mono text-[10px] text-[var(--text-muted)]">{u.cpf || '—'}</span>
                                    <span className="col-span-4 font-mono text-[9px] text-[var(--text-muted)] truncate">{u.id || '—'}</span>
                                    <span className={`col-span-1 text-right font-black ${Number(u.walletBalance || 0) > 0 ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                                        R$ {Number(u.walletBalance || 0).toFixed(2).replace('.', ',')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {creditList.length > 0 && (
                    <div className="flex flex-col md:flex-row justify-between items-center gap-2 px-1 text-[10px] font-black uppercase tracking-widest">
                        <span className="text-[var(--text-muted)]">
                            {termo ? `Consulta individual: ${creditList.length} resultado(s) para "${termo}"` : `Listagem em lote (${creditModeLabel}): ${creditList.length} usuário(s)`}
                        </span>
                        <span className={apenasComSaldo ? 'text-emerald-500' : 'text-[var(--text-muted)]'}>
                            TOTAL: R$ {creditTotal.toFixed(2).replace('.', ',')}
                        </span>
                    </div>
                )}
            </div>
        )}
    </div>
  );
};
