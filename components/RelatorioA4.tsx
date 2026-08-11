import React from 'react';
import { formatarMoeda } from '../utils';

interface RelatorioA4Props {
    report: any;
    config: any;
}

export const RelatorioA4: React.FC<RelatorioA4Props> = ({ report, config }) => {
    if (!report) return null;

    return (
        <div className="bg-white p-12 max-w-[210mm] w-full mx-auto text-slate-900 font-sans print:p-0 print:m-0">
            {/* Cabeçalho Institucional */}
            <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter mb-1">{report.title}</h1>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
                        {config?.appName || 'Mercado Fácil'}<br/>
                        Período: {report.period}<br/>
                        Gerado em: {new Date().toLocaleString('pt-BR')}
                    </p>
                </div>
                {config?.logoUrl && <img src={config.logoUrl} alt="Logo" className="h-14 object-contain" />}
            </div>

            {/* Resumo Consolidado */}
            <div className="grid grid-cols-3 gap-6 mb-10">
                <div className="border-2 border-slate-100 p-4 rounded-xl">
                    <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Total de Entradas</p>
                    <p className="text-lg font-black text-emerald-600">R$ {formatarMoeda(report.summary.totalEntries || report.summary.totalSales || 0)}</p>
                </div>
                <div className="border-2 border-slate-100 p-4 rounded-xl">
                    <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Total de Saídas</p>
                    <p className="text-lg font-black text-red-600">R$ {formatarMoeda(report.summary.totalExits || report.summary.totalExpenses || 0)}</p>
                </div>
                <div className="bg-slate-900 p-4 rounded-xl text-white">
                    <p className="text-[8px] font-black uppercase text-slate-400 mb-1">Saldo Final</p>
                    <p className="text-lg font-black">R$ {formatarMoeda(report.summary.net || 0)}</p>
                </div>
            </div>

            {/* Tabela de Dados */}
            <div className="space-y-4">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-100 border-b-2 border-slate-900">
                            <th className="p-2 text-[9px] font-black uppercase">Data</th>
                            <th className="p-2 text-[9px] font-black uppercase">Descrição / Documento</th>
                            <th className="p-2 text-[9px] font-black uppercase text-right">Entrada (+)</th>
                            <th className="p-2 text-[9px] font-black uppercase text-right">Saída (-)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(report.items || []).map((item: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 break-inside-avoid">
                                <td className="p-2 text-[10px] font-medium whitespace-nowrap">{new Date(item.date).toLocaleDateString('pt-BR')}</td>
                                <td className="p-2 text-[10px] font-bold text-slate-700">{item.description}</td>
                                <td className="p-2 text-[10px] font-black text-emerald-600 text-right">
                                    {item.type === 'ENTRY' ? `R$ ${formatarMoeda(item.amount)}` : '-'}
                                </td>
                                <td className="p-2 text-[10px] font-black text-red-600 text-right">
                                    {item.type === 'EXIT' ? `R$ ${formatarMoeda(item.amount)}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {report.items.length === 0 && (
                    <div className="py-10 text-center text-[10px] font-black uppercase text-slate-400">Nenhum registro encontrado no período.</div>
                )}
            </div>

            {/* Rodapé de Autenticação */}
            <div className="mt-20 pt-10 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-20">
                    <div className="text-center">
                        <div className="border-b border-slate-900 mb-2"></div>
                        <p className="text-[8px] font-black uppercase text-slate-400">Assinatura do Responsável</p>
                    </div>
                    <div className="text-center">
                        <div className="border-b border-slate-900 mb-2"></div>
                        <p className="text-[8px] font-black uppercase text-slate-400">Conferência / Auditoria</p>
                    </div>
                </div>
                <p className="mt-12 text-center text-[8px] font-bold text-slate-300 uppercase tracking-tight">
                    Documento gerado eletronicamente pelo Sistema de Gestão Prisional Mercado Fácil.
                    Código de Autenticação: {Math.random().toString(36).substr(2, 9).toUpperCase()}
                </p>
            </div>
        </div>
    );
};
