import React, { useEffect, useRef, useState } from 'react';
import { ReciboA4 } from './ReciboA4';
import { CupomEntrega } from './CupomEntrega';
import { CatalogoA4 } from './CatalogoA4';
import { RelatorioA4 } from './RelatorioA4';
import { gerarCupomEntregaRaw, imprimirBobinaFiscal, baixarCupomTxt } from '../utils/printUtils';
import { Printer, Download, X, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface PrintData {
    item: {
        type: string;
        data: any;
        subType?: string;
    };
    config: any;
}

type PrintStatus = 'loading' | 'ready' | 'fiscal' | 'dialog' | 'error';

export const PrintPage: React.FC = () => {
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [status, setStatus] = useState<PrintStatus>('loading');
    const [error, setError] = useState<string | null>(null);
    const [isFiscalPrinting, setIsFiscalPrinting] = useState(false);
    const [closeCountdown, setCloseCountdown] = useState(0);
    const rawCupomRef = useRef('');
    const closedRef = useRef(false);

    useEffect(() => {
        let mounted = true;

        try {
            const data = localStorage.getItem('printItem');
            const settings = localStorage.getItem('appSettings');

            if (!data) {
                setError('Nenhum dado de impressão encontrado. Feche esta janela e tente novamente.');
                setStatus('error');
                return;
            }

            const parsedItem = JSON.parse(data);
            const parsedSettings = settings ? JSON.parse(settings) : {};

            if (!parsedItem || !parsedItem.type || !parsedItem.data) {
                setError('Dados de impressão inválidos ou incompletos.');
                setStatus('error');
                return;
            }

            setPrintData({ item: parsedItem, config: parsedSettings });

            const isCupom = parsedItem.type === 'CUPOM';
            if (isCupom) {
                rawCupomRef.current = gerarCupomEntregaRaw(parsedItem.data, parsedSettings);
            }

            setStatus('ready');

            // PRIORIDADE FISCAL: cupom tenta a bobina (QZ Tray) automaticamente.
            // Com QZ → imprime direto na fiscal e mostra confirmação.
            // Sem QZ → abre o diálogo do navegador com o layout térmico 80mm.
            const timer = setTimeout(async () => {
                if (!mounted) return;
                if (isCupom) {
                    const ok = await imprimirBobinaFiscal(rawCupomRef.current);
                    if (!mounted) return;
                    if (ok) {
                        setStatus('fiscal');
                        setCloseCountdown(4);
                    } else {
                        setStatus('dialog');
                        setTimeout(() => {
                            if (!closedRef.current) window.print();
                        }, 500);
                    }
                } else {
                    setStatus('dialog');
                    setTimeout(() => {
                        if (!closedRef.current) window.print();
                    }, 500);
                }
            }, 400);

            return () => { mounted = false; clearTimeout(timer); };
        } catch (e: any) {
            setError('Erro ao carregar dados: ' + (e.message || 'Falha desconhecida'));
            setStatus('error');
        }
    }, []);

    // Auto-fecha quando imprime direto na fiscal
    useEffect(() => {
        if (status !== 'fiscal' || closeCountdown <= 0) return;
        const t = setTimeout(() => {
            setCloseCountdown((c) => c - 1);
        }, 1000);
        return () => clearTimeout(t);
    }, [status, closeCountdown]);

    useEffect(() => {
        if (status === 'fiscal' && closeCountdown === 0) {
            closedRef.current = true;
            try { window.close(); } catch { /* noop */ }
        }
    }, [status, closeCountdown]);

    const handleFiscalPrint = async () => {
        if (isFiscalPrinting) return;
        setIsFiscalPrinting(true);
        try {
            const ok = await imprimirBobinaFiscal(rawCupomRef.current);
            if (ok) {
                setStatus('fiscal');
                setCloseCountdown(4);
            } else {
                setTimeout(() => window.print(), 300);
            }
        } finally {
            setIsFiscalPrinting(false);
        }
    };

    const handleDownloadTxt = () => {
        if (!rawCupomRef.current) return;
        baixarCupomTxt(rawCupomRef.current, 'cupom');
    };

    const handleClose = () => {
        closedRef.current = true;
        try { window.close(); } catch { /* noop */ }
    };

    // ── Loading ──────────────────────────────────────────────
    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mx-auto mb-6 shadow-[0_0_30px_rgba(16,185,129,0.3)]"></div>
                    <p className="font-black text-sm uppercase tracking-[0.3em] text-white/90">Preparando Impressão</p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2">Mercado Fácil · ASSPEN</p>
                </div>
            </div>
        );
    }

    // ── Error ────────────────────────────────────────────────
    if (status === 'error') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex items-center justify-center p-8">
                <div className="text-center max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertTriangle size={30} className="text-red-400" />
                    </div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight mb-3">Erro na Impressão</h2>
                    <p className="text-sm text-white/60 mb-8">{error}</p>
                    <div className="space-y-3">
                        <button onClick={() => { setStatus('ready'); setTimeout(() => window.print(), 350); }} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-3.5 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/30 transition-all">
                            Tentar Imprimir Novamente
                        </button>
                        <button onClick={handleClose} className="w-full bg-white/10 hover:bg-white/20 text-white px-6 py-3.5 rounded-xl font-black uppercase tracking-widest text-xs transition-all">
                            Fechar Janela
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!printData) return null;

    const { item, config } = printData;
    const type = item?.type || 'CUPOM';
    const isCupom = type === 'CUPOM';
    const docName = isCupom
        ? 'Cupom de Entrega'
        : type === 'RECIBO' ? (item.subType === 'EXPENSE' ? 'Recibo de Despesa' : 'Recibo de Pedido')
        : type === 'CATALOGO' ? 'Catálogo de Produtos'
        : 'Relatório';

    return (
        <>
            <style>{`
                @media print {
                    @page { size: ${isCupom ? '80mm auto' : 'A4'}; margin: ${isCupom ? '2mm' : '10mm'}; }
                    body { margin: 0; padding: 0; background: white !important; }
                    .print-header, .print-toolbar { display: none !important; }
                    .print-preview { background: white !important; padding: 0 !important; }
                    .thermal-card { width: 80mm !important; max-width: 80mm !important; margin: 0 auto !important; padding: 2mm !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; }
                    * { color: black !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50">
                {/* Header professional */}
                <header className="print-header sticky top-0 z-50 bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                            <Printer size={22} />
                        </div>
                        <div>
                            <h1 className="font-black text-sm uppercase tracking-tight leading-none">{config?.appName || 'Mercado Fácil'}</h1>
                            <p className="text-[9px] font-bold text-white/50 uppercase tracking-[0.25em] mt-1">{docName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {status === 'fiscal' ? (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 animate-pulse">
                                <CheckCircle size={14} /> Impresso na Fiscal
                            </span>
                        ) : status === 'dialog' ? (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 text-amber-300 text-[10px] font-black uppercase tracking-widest border border-amber-500/30">
                                <AlertTriangle size={14} /> Selecione a Impressora
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest">
                                <Loader2 size={14} className="animate-spin" /> Pronto
                            </span>
                        )}
                    </div>
                </header>

                {/* Aviso de sucesso fiscal */}
                {status === 'fiscal' && (
                    <div className="print-header px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                        <p className="text-xs font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle size={16} /> Cupom enviado para a bobina fiscal com sucesso
                        </p>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Fechando em {closeCountdown}s…</p>
                    </div>
                )}

                {/* Preview */}
                <main className="print-preview flex-1 flex items-start justify-center px-4 py-8 overflow-y-auto">
                    <div className={`${isCupom ? 'thermal-card' : 'w-full max-w-4xl'} bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200/60 p-6`}>
                        {type === 'RECIBO' && item?.data && (
                            <ReciboA4
                                data={item.data}
                                type={(item.subType === 'EXPENSE' ? 'EXPENSE' : 'ORDER') as 'ORDER' | 'EXPENSE'}
                                config={config}
                            />
                        )}
                        {isCupom && item?.data && (
                            <CupomEntrega order={item.data} remainingBalance={item.data.walletBalanceAfter} config={config} />
                        )}
                        {type === 'CATALOGO' && item?.data && (
                            <CatalogoA4 products={item.data} config={config} />
                        )}
                        {type === 'RELATORIO' && item?.data && (
                            <RelatorioA4 report={item.data} config={config} />
                        )}
                    </div>
                </main>

                {/* Toolbar profissional */}
                <footer className="print-toolbar sticky bottom-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200 px-6 py-4 flex items-center justify-center gap-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
                    {isCupom && (
                        <button
                            onClick={handleFiscalPrint}
                            disabled={isFiscalPrinting}
                            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-lg disabled:opacity-50"
                        >
                            {isFiscalPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Imprimir na Fiscal
                        </button>
                    )}
                    <button
                        onClick={() => { closedRef.current = false; setTimeout(() => window.print(), 300); }}
                        className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-500/25"
                    >
                        <Printer size={16} /> {status === 'dialog' ? 'Imprimir Agora' : 'Imprimir'}
                    </button>
                    {isCupom && (
                        <button
                            onClick={handleDownloadTxt}
                            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 border border-slate-200"
                        >
                            <Download size={16} /> Baixar TXT
                        </button>
                    )}
                    <button
                        onClick={handleClose}
                        className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 border border-slate-200"
                    >
                        <X size={16} /> Fechar
                    </button>
                </footer>
            </div>
        </>
    );
};
