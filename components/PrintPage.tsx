import React, { useEffect, useRef, useState } from 'react';
import { ReciboA4 } from './ReciboA4';
import { CupomEntrega } from './CupomEntrega';
import { CatalogoA4 } from './CatalogoA4';
import { RelatorioA4 } from './RelatorioA4';
import { NotaPromissoriaA4 } from './NotaPromissoriaA4';
import { gerarCupomEntregaRaw, imprimirBobinaFiscal, imprimirHtmlSilencioso, baixarCupomTxt } from '../utils/printUtils';
import { Printer, Download, X, CheckCircle, AlertTriangle, Loader2, WifiOff } from 'lucide-react';

interface PrintData {
    item: {
        type: string;
        data: any;
        subType?: string;
    };
    config: any;
}

type PrintStatus = 'loading' | 'ready' | 'fiscal' | 'comum' | 'dialog' | 'error';

export const PrintPage: React.FC = () => {
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [status, setStatus] = useState<PrintStatus>('loading');
    const [error, setError] = useState<string | null>(null);
    const [isFiscalPrinting, setIsFiscalPrinting] = useState(false);
    const [closeCountdown, setCloseCountdown] = useState(0);
    const [qzStatus, setQzStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
    const rawCupomRef = useRef('');
    const closedRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusRef = useRef<PrintStatus>('loading');
    const [autoCloseCancelado, setAutoCloseCancelado] = useState(false);
    // Guarda anti-duplicação: impede que dois timers/cliques disparem
    // window.print() duas vezes para o MESMO documento (causa clássica de
    // "a mesma página imprime duas vezes").
    const printingRef = useRef(false);

    statusRef.current = status;
    const verificarQz = async () => {
        try {
            const w = window as any;
            if (w.qz && typeof w.qz.websocket && w.qz.websocket.isActive && w.qz.websocket.isActive()) {
                setQzStatus('connected');
                return;
            }
            setTimeout(() => {
                try {
                    const w2 = window as any;
                    if (w2.qz && w2.qz.websocket && w2.qz.websocket.isActive && w2.qz.websocket.isActive()) {
                        setQzStatus('connected');
                    } else {
                        setQzStatus('disconnected');
                    }
                } catch {
                    setQzStatus('disconnected');
                }
            }, 2000);
        } catch {
            setQzStatus('disconnected');
        }
    };


    // Carrega (ou RECARREGA) os dados da impressão. Chamado no mount e sempre
    // que a janela do pai publica uma NOVA impressão (evento 'storage') — assim
    // a janela /print se atualiza sozinha, sem precisar dar refresh manual.
    const carregar = () => {
        let mounted = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (dialogTimerRef.current) clearTimeout(dialogTimerRef.current);
        try {
            // Payload veiculado (?d=base64) — preferencial no Electron (file://),
            // onde o localStorage entre janelas não é confiável.
            const dadosUrl = new URLSearchParams(window.location.search).get('d') || '';
            let itemValido: any = null;
            let configValida: any = {};
            if (dadosUrl) {
                try {
                    const base64 = decodeURIComponent(dadosUrl);
                    const binario = typeof atob === 'function' ? atob(base64) : '';
                    const u8 = Uint8Array.from(binario, (c) => c.charCodeAt(0));
                    const texto = new TextDecoder().decode(u8);
                    const payload = JSON.parse(texto);
                    if (payload?.item) {
                        itemValido = payload.item;
                        configValida = payload.config || {};
                    }
                } catch { /* payload inválido — cai no localStorage */ }
            }

            // Fallback: dados publicados no localStorage pelo app (janelas web).
            if (!itemValido) {
                const data = localStorage.getItem('printItem');
                const settings = localStorage.getItem('appSettings');
                if (!data) {
                    setError('Nenhum dado de impressão encontrado. Feche esta janela e tente novamente.');
                    setStatus('error');
                    return () => { mounted = false; };
                }
                itemValido = JSON.parse(data);
                configValida = settings ? JSON.parse(settings) : {};
            }

            const parsedItem = itemValido;
            const parsedSettings = configValida;

            if (!parsedItem || !parsedItem.type || !parsedItem.data) {
                setError('Dados de impressão inválidos ou incompletos.');
                setStatus('error');
                return () => { mounted = false; };
            }

            closedRef.current = false;
            setAutoCloseCancelado(false);
            setCloseCountdown(0);
            setError(null);
            setPrintData({ item: parsedItem, config: parsedSettings });

            const isCupom = parsedItem.type === 'CUPOM' || parsedItem.type === 'CUPOM_COMUM';
            // CUPOM = cupom de venda (auto-imprime na fiscal quando houver QZ).
            // CUPOM_COMUM = rota "impressora comum" escolhida pelo operador
            // (ex.: comprovante de cancelamento): NUNCA toca na fiscal.
            const isCupomFiscal = parsedItem.type === 'CUPOM';
            if (isCupom) {
                rawCupomRef.current = gerarCupomEntregaRaw(parsedItem.data, parsedSettings);
            }

            setStatus('ready');

            // PRIORIDADE FISCAL: cupom tenta a bobina (QZ Tray) automaticamente.
            // Com QZ → imprime direto na fiscal e mostra confirmação.
            // Sem QZ → abre o diálogo do navegador com o layout térmico 80mm.
            timerRef.current = setTimeout(async () => {
                if (!mounted) return;
                if (isCupom) {
                    // Rota "impressora comum": o operador pediu explicitamente
                    // a comum (comprovante de cancelamento, por exemplo) — não
                    // toca na fiscal. Vai para a impressora padrão do desktop
                    // ou para o diálogo do navegador.
                    if (!isCupomFiscal) {
                        const electronOk = await imprimirHtmlSilencioso(rawCupomRef.current, parsedSettings);
                        if (!mounted) return;
                        if (electronOk) {
                            setStatus('comum');
                            setCloseCountdown(4);
                        } else {
                            setStatus('dialog');
                            dialogTimerRef.current = setTimeout(() => {
                                if (!closedRef.current && mounted && !printingRef.current) window.print();
                            }, 500);
                        }
                        return;
                    }
                    const ok = await imprimirBobinaFiscal(rawCupomRef.current, parsedSettings);
                    if (!mounted) return;
                    if (ok) {
                        setStatus('fiscal');
                        setCloseCountdown(4);
                    } else {
                        const electronOk = await imprimirHtmlSilencioso(rawCupomRef.current, parsedSettings);
                        if (!mounted) return;
                        if (electronOk) {
                            setStatus('fiscal');
                            setCloseCountdown(4);
                        } else {
                            setStatus('dialog');
                            dialogTimerRef.current = setTimeout(() => {
                                if (!closedRef.current && mounted && !printingRef.current) window.print();
                            }, 500);
                        }
                    }
                } else {
                    const electronApi = (window as any).electronAPI;
                    if (electronApi?.printHtmlSilent) {
                        // Documento A4 no desktop: imprime silencioso na impressora padrão
                        const receiptEl = document.querySelector('.print-preview') || document.querySelector('#print-root');
                        const innerHtml = receiptEl
                            ? receiptEl.innerHTML
                            : '';
                        if (innerHtml) {
                            // A4 precisa de CSS embutido — sem isso o Electron imprime HTML cru sem formatação.
                            // Tailwind CDN recria as utility classes dos componentes A4 na janela silenciosa.
                            const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                            <style>*,::after,::before{box-sizing:border-box}body{font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;margin:0;background:#fff;color:#000}.text-center{text-align:center}.text-left{text-align:left}.text-right{text-align:right}.font-black{font-weight:900}.font-bold{font-weight:700}.font-semibold{font-weight:600}.font-extrabold{font-weight:800}.font-medium{font-weight:500}.uppercase{text-transform:uppercase}.tracking-tight{letter-spacing:-.01em}.tracking-widest{letter-spacing:.1em}.tracking-\[0\.2em\]{letter-spacing:.2em}.text-xs{font-size:12px}.text-sm{font-size:14px}.text-base{font-size:16px}.text-lg{font-size:18px}.text-xl{font-size:20px}.text-\[8px\]{font-size:8px}.text-\[9px\]{font-size:9px}.text-\[10px\]{font-size:10px}.text-\[11px\]{font-size:11px}.leading-none{line-height:1}.leading-tight{line-height:1.25}.p-2{padding:8px}.p-3{padding:12px}.p-4{padding:16px}.p-6{padding:24px}.p-8{padding:32px}.px-2{padding-left:8px;padding-right:8px}.px-4{padding-left:16px;padding-right:16px}.px-6{padding-left:24px;padding-right:24px}.py-1{padding-top:4px;padding-bottom:4px}.py-2{padding-top:8px;padding-bottom:8px}.py-3{padding-top:12px;padding-bottom:12px}.mb-1{margin-bottom:4px}.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}.mb-4{margin-bottom:16px}.mb-6{margin-bottom:24px}.mt-1{margin-top:4px}.mt-2{margin-top:8px}.mt-4{margin-top:16px}.w-full{width:100%}.max-w-full{max-width:100%}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.gap-2{gap:8px}.gap-3{gap:12px}.gap-4{gap:16px}.flex{display:flex}.items-center{align-items:center}.items-start{align-items:flex-start}.justify-between{justify-content:space-between}.justify-center{justify-content:center}.border{border-width:1px}.border-t{border-top-width:1px}.border-b{border-bottom-width:1px}.border-slate-200{border-color:#e2e8f0}.border-slate-300{border-color:#cbd5e1}.bg-white{background:#fff}.bg-slate-50{background:#f8fafc}.bg-slate-100{background:#f1f5f9}.text-slate-400{color:#94a3b8}.text-slate-500{color:#64748b}.text-slate-600{color:#475569}.text-slate-700{color:#334155}.text-slate-900{color:#0f172a}.rounded-lg{border-radius:8px}</style>
                            <style>
                                @page { size: A4; margin: 8mm; }
                                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                                body { font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; color: #000; background: #fff; }
                                body > div { width: 100%; }
                            </style>
                        </head><body>${innerHtml}</body></html>`;
                            const res = await electronApi.printHtmlSilent(html);
                            if (mounted && res?.ok) {
                                setStatus('fiscal');
                                setCloseCountdown(3);
                                return;
                            }
                        }
                    }
                    setStatus('dialog');
                    dialogTimerRef.current = setTimeout(() => {
                        if (!closedRef.current && mounted && !printingRef.current) window.print();
                    }, 500);
                }
            }, 400);

            return () => { mounted = false; };
        } catch (e: any) {
            setError('Erro ao carregar dados: ' + (e.message || 'Falha desconhecida'));
            setStatus('error');
            return () => { mounted = false; };
        }
    };

    useEffect(() => {
        verificarQz();
        const limpar = carregar();

        // A janela do PDV publica a nova impressão via localStorage; o evento
        // 'storage' (que só dispara em OUTRAS janelas) nos avisa na hora.
        const onStorage = (e: StorageEvent) => {
            if (e.key !== 'printItem' && e.key !== 'appSettings' && e.key !== 'printTicket') return;
            if (limpar) limpar();
            carregar();
        };
        window.addEventListener('storage', onStorage);

        // Terminou o diálogo de impressão do navegador → fecha a janela sozinha
        // (após pequena contagem, cancelável ao interagir com a janela).
        const onAfterPrint = () => {
            printingRef.current = false;
            if (statusRef.current === 'error') return;
            setStatus('fiscal');
            setCloseCountdown(3);
        };
        window.addEventListener('afterprint', onAfterPrint);

        const cancelarAutoClose = () => {
            setAutoCloseCancelado(true);
            setCloseCountdown(0);
        };
        window.addEventListener('mousedown', cancelarAutoClose);
        window.addEventListener('keydown', cancelarAutoClose);
        window.addEventListener('touchstart', cancelarAutoClose);

        return () => {
            if (limpar) limpar();
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('afterprint', onAfterPrint);
            window.removeEventListener('mousedown', cancelarAutoClose);
            window.removeEventListener('keydown', cancelarAutoClose);
            window.removeEventListener('touchstart', cancelarAutoClose);
            if (timerRef.current) clearTimeout(timerRef.current);
            if (dialogTimerRef.current) clearTimeout(dialogTimerRef.current);
        };
    }, []);

    // Auto-fecha quando imprime direto na fiscal/comum (ou após o diálogo terminar)
    useEffect(() => {
        if ((status !== 'fiscal' && status !== 'comum') || closeCountdown <= 0) return;
        const t = setTimeout(() => {
            setCloseCountdown((c) => c - 1);
        }, 1000);
        return () => clearTimeout(t);
    }, [status, closeCountdown]);

    useEffect(() => {
        if ((status === 'fiscal' || status === 'comum') && closeCountdown === 0 && !autoCloseCancelado) {
            closedRef.current = true;
            fecharJanela();
        }
    }, [status, closeCountdown, autoCloseCancelado]);

    const handleFiscalPrint = async () => {
        if (isFiscalPrinting) return;
        setIsFiscalPrinting(true);
        try {
            const ok = await imprimirBobinaFiscal(rawCupomRef.current, printData?.config);
            if (ok) {
                setStatus('fiscal');
                setCloseCountdown(4);
                } else {
                    const electronOk = await imprimirHtmlSilencioso(rawCupomRef.current, printData?.config);
                    if (electronOk) {
                        setStatus('fiscal');
                        setCloseCountdown(4);
                    } else {
                        dispararImpressaoUnica(300);
                    }
                }
        } finally {
            setIsFiscalPrinting(false);
        }
    };

    const handleDownloadTxt = () => {
        if (!rawCupomRef.current) return;
        baixarCupomTxt(rawCupomRef.current, 'cupom');
    };

    // Disparo único de impressão: cancela qualquer timer pendente e ignora
    // chamadas repetidas enquanto o diálogo já estiver aberto.
    const dispararImpressaoUnica = (atrasoMs = 300) => {
        if (printingRef.current) return;
        printingRef.current = true;
        if (dialogTimerRef.current) { clearTimeout(dialogTimerRef.current); dialogTimerRef.current = null; }
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        closedRef.current = false;
        setTimeout(() => {
            try { window.print(); } finally {
                // Libera novamente após o diálogo fechar (afterprint também reseta).
                setTimeout(() => { printingRef.current = false; }, 1200);
            }
        }, atrasoMs);
    };

    const handleClose = () => {
        closedRef.current = true;
        fecharJanela();
    };

    // Fecha a janela de forma controlada: no Electron, a janela /print é criada
    // pelo main (deny no window.open), então window.close() do renderer não age —
    // usa o IPC close-print-window; no navegador usa window.close() normal.
    const fecharJanela = () => {
        const api = (window as any).electronAPI;
        if (api?.closeWindow) {
            try { api.closeWindow(); return; } catch { /* noop */ }
        }
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
                        <button onClick={() => { setStatus('ready'); dispararImpressaoUnica(350); }} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-3.5 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-500/30 transition-all">
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
    const isCupom = type === 'CUPOM' || type === 'CUPOM_COMUM';
    const isCupomFiscal = type === 'CUPOM';
    const docName = type === 'CUPOM_COMUM'
        ? 'Comprovante (impressora comum)'
        : isCupomFiscal
        ? 'Cupom de Entrega'
        : type === 'RECIBO' ? (item.subType === 'EXPENSE' ? 'Recibo de Despesa' : 'Recibo de Pedido')
        : type === 'PROMISSORIA' ? 'Nota Promissória'
        : type === 'CATALOGO' ? 'Catálogo de Produtos'
        : 'Relatório';

    return (
        <>
            <style>{`
                /* Tela: documento A4 com aparência de PAPEL (proporção 210x297mm),
                   centralizado — elimina o "vazio cinza" desproporcional ao redor. */
                .a4-sheet { width: 794px; max-width: 100%; }
            `}</style>
            <style>{`
                @media print {
                    @page { size: ${isCupom ? '76mm auto' : 'A4'}; margin: ${isCupom ? '0' : '10mm'}; }
                    html, body { height: auto !important; overflow: visible !important; }
                    .min-h-screen { min-height: 0 !important; display: block !important; }
                    body { margin: 0; padding: 0; background: white !important; }
                    .print-header, .print-toolbar { display: none !important; }
                    .print-preview { display: block !important; background: white !important; padding: 0 !important; margin: 0 !important; overflow: visible !important; height: auto !important; max-height: none !important; }
                    .print-preview > div { max-width: none !important; width: 100% !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; --tw-ring-shadow: 0 0 #0000 !important; }
                    .thermal-card { width: 76mm !important; max-width: 76mm !important; margin: 0 auto !important; padding: 2mm 1mm !important; box-sizing: border-box !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; }
                    .print-avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
                    /* Impressão FIEL às cores: mantém texto branco em caixas escuras
                       legível no papel (o antigo "color:black !important" universal
                       apagava o texto dentro dos blocos bg-slate-900). */
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
                        {isCupomFiscal && (
                            <span className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${qzStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : qzStatus === 'checking' ? 'bg-white/10 text-white/60 border-white/20' : 'bg-amber-500/10 text-amber-300 border-amber-500/30'}`}>
                                {qzStatus === 'connected' ? <CheckCircle size={12} /> : qzStatus === 'checking' ? <Loader2 size={12} className="animate-spin" /> : <WifiOff size={12} />}
                                QZ Tray: {qzStatus === 'connected' ? 'Conectado' : qzStatus === 'checking' ? 'Verificando...' : 'Desconectado'}
                            </span>
                        )}
                        {status === 'fiscal' ? (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 animate-pulse">
                                <CheckCircle size={14} /> Impresso na Fiscal
                            </span>
                        ) : status === 'comum' ? (
                            <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 text-[10px] font-black uppercase tracking-widest border border-emerald-500/30 animate-pulse">
                                <CheckCircle size={14} /> Impresso na Comum
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
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                            {autoCloseCancelado ? 'Janela mantida aberta — clique em Fechar para sair' : `Fechando em ${closeCountdown}s…`}
                        </p>
                    </div>
                )}

                {/* Aviso de sucesso — impressora comum */}
                {status === 'comum' && (
                    <div className="print-header px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                        <p className="text-xs font-black text-emerald-700 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle size={16} /> Comprovante enviado para a impressora comum
                        </p>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                            {autoCloseCancelado ? 'Janela mantida aberta — clique em Fechar para sair' : `Fechando em ${closeCountdown}s…`}
                        </p>
                    </div>
                )}

                {/* Preview — A4 vira "papel" centralizado; cupom térmico fica estreito e limpo */}
                <main className="print-preview flex-1 flex items-start justify-center px-4 py-8 overflow-y-auto bg-slate-200/40">
                    <div className={`${isCupom ? 'thermal-card' : 'a4-sheet'} bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200/60 p-6`}>
                        {type === 'RECIBO' && item?.data && (
                            <ReciboA4
                                data={item.data}
                                type={(item.subType === 'EXPENSE' ? 'EXPENSE' : 'ORDER') as 'ORDER' | 'EXPENSE'}
                                config={config}
                                embedded
                            />
                        )}
                        {type === 'PROMISSORIA' && item?.data && (
                            <NotaPromissoriaA4 data={item.data} embedded />
                        )}
                        {isCupom && item?.data && (
                            <CupomEntrega order={item.data} remainingBalance={item.data.walletBalanceAfter} config={config} />
                        )}
                        {type === 'CATALOGO' && item?.data && (
                            <CatalogoA4 products={item.data} config={config} showUnavailable={true} />
                        )}
                        {type === 'RELATORIO' && item?.data && (
                            <RelatorioA4 report={item.data} config={config} />
                        )}
                        {!['RECIBO', 'PROMISSORIA', 'CUPOM', 'CUPOM_COMUM', 'CATALOGO', 'RELATORIO'].includes(type) && (
                            <div className="p-16 text-center">
                                <p className="font-black text-slate-300 uppercase tracking-[0.2em]">Tipo de impressão não suportado</p>
                                <p className="text-[11px] font-bold text-slate-400 mt-2">"{type}" — feche a janela e tente novamente.</p>
                            </div>
                        )}
                    </div>
                </main>

                {/* Toolbar profissional */}
                <footer className="print-toolbar sticky bottom-0 z-50 bg-white/90 backdrop-blur-xl border-t border-slate-200 px-6 py-4 flex items-center justify-center gap-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
                    {isCupomFiscal && (
                        <button
                            onClick={handleFiscalPrint}
                            disabled={isFiscalPrinting}
                            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-lg disabled:opacity-50"
                        >
                            {isFiscalPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Imprimir na Fiscal
                        </button>
                    )}
                    <button
                        onClick={async () => {
                            if (isCupom) {
                                const electronOk = await imprimirHtmlSilencioso(rawCupomRef.current, printData?.config);
                                if (electronOk) {
                                    setStatus(isCupomFiscal ? 'fiscal' : 'comum');
                                    setCloseCountdown(4);
                                } else {
                                    dispararImpressaoUnica(300);
                                }
                            } else {
                                dispararImpressaoUnica(300);
                            }
                        }}
                        className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-500/25"
                    >
                        <Printer size={16} /> {status === 'dialog' ? 'Imprimir Agora' : isCupomFiscal ? 'Imprimir' : 'Imprimir (comum)'}
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
