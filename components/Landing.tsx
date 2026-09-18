import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Store, ShieldCheck, QrCode, ClipboardCheck, Package, Building2,
    Smartphone, Tablet, Monitor, Download, ArrowRight, CheckCircle2,
    Lock, HeartHandshake, Loader2, Menu, X
} from 'lucide-react';
import { Login } from '../pages/Login';
import { AppFooter } from './ui';

const fadeUp = {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }
};

export const Landing: React.FC<{ skipLanding?: boolean; initialTab?: 'login' | 'register' | 'admin' }> = ({ skipLanding, initialTab }) => {
    const [authOpen, setAuthOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'login' | 'register' | 'admin'>(initialTab || 'login');
    const [installing, setInstalling] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (skipLanding) { setAuthOpen(true); return; }
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === '1') { setAuthOpen(true); return; }
        const applyHash = () => {
            const h = window.location.hash;
            if (h === '#entrar') { setActiveTab('login'); setAuthOpen(true); }
            if (h === '#criar-conta') { setActiveTab('register'); setAuthOpen(true); }
        };
        applyHash();
        window.addEventListener('hashchange', applyHash);
        return () => window.removeEventListener('hashchange', applyHash);
    }, [skipLanding]);

    const abrir = (tab: 'login' | 'register') => {
        setActiveTab(tab);
        setAuthOpen(true);
        try { window.history.replaceState(null, '', tab === 'register' ? '#criar-conta' : '#entrar'); } catch { /* ignora */ }
    };

    const instalarApp = async () => {
        const promptEvent = (window as any).__deferredPrompt;
        if (!promptEvent) { abrir('register'); return; }
        setInstalling(true);
        try {
            promptEvent.prompt();
            await promptEvent.userChoice;
            (window as any).__deferredPrompt = null;
        } catch { /* ignora */ } finally {
            setInstalling(false);
        }
    };

    if (authOpen) {
        return <Login initialTab={activeTab} onVolver={() => { setAuthOpen(false); try { window.history.replaceState(null, '', ' '); } catch { /* ignora */ } }} />;
    }

    return (
        <div className="min-h-screen bg-white text-slate-900 font-sans overflow-x-hidden">
            {/* ── NAV ── */}
            <header className="fixed top-0 inset-x-0 z-50 bg-[#0e7a4d]/95 backdrop-blur-md border-b border-white/10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
                            <Store size={19} className="text-[#0e7a4d]" strokeWidth={2.4} />
                        </div>
                        <div className="leading-none min-w-0">
                            <p className="text-white font-extrabold tracking-tight text-base">ASSPEN</p>
                            <p className="text-white/70 text-[10px] font-semibold tracking-widest uppercase truncate">Peixoto de Azevedo/MT</p>
                        </div>
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold text-white/85">
                        <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
                        <a href="#familiares" className="hover:text-white transition-colors">Para familiares</a>
                        <a href="#unidade" className="hover:text-white transition-colors">Para a unidade</a>
                        <a href="#app" className="hover:text-white transition-colors">Aplicativo</a>
                    </nav>
                    <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Menu">
                        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={() => abrir('login')} className="px-4 py-3 min-h-[44px] rounded-xl text-[12px] font-bold text-white border border-white/30 hover:bg-white/10 transition-colors cursor-pointer">Entrar</button>
                        <button onClick={() => abrir('register')} className="px-4 py-3 min-h-[44px] rounded-xl text-[12px] font-bold bg-white text-[#0e7a4d] hover:bg-emerald-50 transition-colors shadow-sm cursor-pointer">Criar conta</button>
                    </div>
                </div>
            </header>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
                        className="fixed top-16 inset-x-0 z-40 bg-[#0e7a4d]/98 backdrop-blur-md border-b border-white/10 md:hidden">
                        <nav className="flex flex-col p-4 gap-1">
                            {['#como-funciona','#familiares','#unidade','#app'].map((href, i) => (
                                <a key={href} href={href} onClick={() => setMobileMenuOpen(false)}
                                    className="min-h-[44px] flex items-center py-3 px-4 rounded-xl text-sm font-semibold text-white/90 hover:bg-white/10 transition-colors">
                                    {['Como funciona','Para familiares','Para a unidade','Aplicativo'][i]}
                                </a>
                            ))}
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── HERO ── */}
            <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 bg-gradient-to-b from-[#0e7a4d] via-[#0c6b44] to-[#0a5c3a] overflow-hidden">
                <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }}></div>
                <div className="absolute -top-32 -right-24 w-[480px] h-[480px] rounded-full bg-emerald-400/20 blur-[140px]"></div>
                <div className="absolute -bottom-40 -left-24 w-[420px] h-[420px] rounded-full bg-teal-300/15 blur-[130px]"></div>

                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
                    <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-[11px] font-bold tracking-widest uppercase mb-6">
                            <ShieldCheck size={14} /> Plataforma oficial da associação
                        </span>
                        <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-[1.08] tracking-tight">
                            ASSPEN<br />
                            <span className="text-emerald-200">Aproxima você</span> de quem você ama
                        </h1>
                        <p className="mt-5 text-emerald-50/90 text-base sm:text-lg leading-relaxed max-w-lg font-medium">
                            Pedidos, crédito e atendimento para familiares de pessoas privadas de liberdade — com pagamento via PIX e aprovação da unidade.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <button onClick={() => abrir('register')} className="px-7 py-3.5 min-h-[44px] rounded-2xl bg-white text-[#0e7a4d] font-bold text-sm hover:bg-emerald-50 transition-all shadow-xl active:scale-[0.98] cursor-pointer flex items-center gap-2">
                                Cadastrar como familiar <ArrowRight size={17} />
                            </button>
                            <button onClick={() => abrir('login')} className="px-7 py-3.5 min-h-[44px] rounded-2xl border-2 border-white/40 text-white font-bold text-sm hover:bg-white/10 transition-all active:scale-[0.98] cursor-pointer">
                                Já tenho conta
                            </button>
                        </div>
                        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-semibold text-emerald-100/90">
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Cadastro validado pela unidade</span>
                            <span className="flex items-center gap-1.5"><CheckCircle2 size={14} /> Pagamento via PIX</span>
                        </div>
                    </motion.div>

                    {/* Mockup do painel */}
                    <motion.div initial={{ opacity: 0, y: 34 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.15 }} className="hidden lg:block">
                        <div className="relative mx-auto w-[380px]">
                            <div className="absolute -inset-4 bg-white/10 rounded-[2.5rem] blur-xl"></div>
                            <div className="relative bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-white/60">
                                <div className="bg-[#0e7a4d] px-5 py-4 flex items-center justify-between">
                                    <div>
                                        <p className="text-white font-extrabold text-sm tracking-tight">Seu painel de compras</p>
                                        <p className="text-white/70 text-[10px] font-semibold tracking-widest uppercase mt-0.5">ASSPEN · Peixoto de Azevedo/MT</p>
                                    </div>
                                    <HeartHandshake size={22} className="text-white/80" />
                                </div>
                                <div className="p-5 space-y-3">
                                    {[
                                        { nome: 'Kit higiene pessoal', tag: 'Aprovado', cor: 'bg-emerald-100 text-emerald-700' },
                                        { nome: 'Salgadinhos', tag: 'Em separação', cor: 'bg-amber-100 text-amber-700' },
                                        { nome: 'Caderno e caneta', tag: 'Entregue', cor: 'bg-sky-100 text-sky-700' }
                                    ].map((p, i) => (
                                        <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-[#0e7a4d]/10 flex items-center justify-center"><Package size={17} className="text-[#0e7a4d]" /></div>
                                                <p className="text-[13px] font-bold text-slate-800">{p.nome}</p>
                                            </div>
                                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${p.cor}`}>{p.tag}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-3 bg-[#0e7a4d]/5 border border-[#0e7a4d]/15 rounded-2xl px-4 py-3.5">
                                        <QrCode size={18} className="text-[#0e7a4d]" />
                                        <p className="text-[11px] font-bold text-slate-600">PIX gerado com o CNPJ da unidade</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── COMO FUNCIONA ── */}
            <section id="como-funciona" className="py-16 sm:py-24 max-w-6xl mx-auto px-4 sm:px-6">
                <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto mb-12">
                    <p className="text-[11px] font-black text-[#0e7a4d] tracking-[0.3em] uppercase mb-3">Simples e seguro</p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Como funciona</h2>
                    <p className="mt-4 text-slate-500 font-medium leading-relaxed">Três passos entre você e a sua encomenda — tudo acompanhado pela administração da unidade.</p>
                </motion.div>
                <div className="grid sm:grid-cols-3 gap-5">
                    {[
                        { icone: ClipboardCheck, titulo: 'Cadastro com documento', texto: 'Envio de documento com foto e selfie, grau de parentesco e CPF do preso. Motivo claro caso o cadastro seja recusado.' },
                        { icone: Store, titulo: 'Loja online', texto: 'Catálogo aprovado pela unidade, carrinho simples e pedido enviado direto para conferência.' },
                        { icone: QrCode, titulo: 'Pagamento por PIX', texto: 'PIX gerado com o CNPJ da unidade e recebimento direto na conta da empresa.' }
                    ].map((p, i) => (
                        <motion.div key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="group bg-white border border-slate-200 rounded-[1.75rem] p-7 hover:border-[#0e7a4d]/40 hover:shadow-xl hover:-translate-y-1 transition-all">
                            <div className="w-12 h-12 rounded-2xl bg-[#0e7a4d]/10 flex items-center justify-center mb-5 group-hover:bg-[#0e7a4d] transition-colors">
                                <p.icone size={22} className="text-[#0e7a4d] group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="font-extrabold text-lg tracking-tight mb-2">{p.titulo}</h3>
                            <p className="text-sm text-slate-500 leading-relaxed font-medium">{p.texto}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── FAMILIARES / UNIDADE ── */}
            <section className="py-8 sm:py-14 max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-6">
                <motion.div id="familiares" {...fadeUp} className="bg-gradient-to-br from-[#0e7a4d] to-[#0a5c3a] rounded-[2rem] p-8 sm:p-10 text-white relative overflow-hidden scroll-mt-24">
                    <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl"></div>
                    <p className="text-[11px] font-black tracking-[0.3em] uppercase text-emerald-200 mb-3">Para familiares</p>
                    <h3 className="text-2xl font-extrabold tracking-tight mb-6">Tudo pelo celular, sem burocracia</h3>
                    <ul className="space-y-3.5 text-[14px] font-medium text-emerald-50/95">
                        {['Cadastro com documento e validação pela unidade', 'Loja online disponível 24 horas', 'Pagamento por PIX, sem fila e sem papelada', 'Acompanhamento do pedido em tempo real'].map((t, i) => (
                            <li key={i} className="flex items-start gap-3"><CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-200" /> {t}</li>
                        ))}
                    </ul>
                </motion.div>
                <motion.div id="unidade" {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="bg-slate-50 border border-slate-200 rounded-[2rem] p-8 sm:p-10 scroll-mt-24">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center mb-5"><Building2 size={22} className="text-white" /></div>
                    <p className="text-[11px] font-black tracking-[0.3em] uppercase text-slate-400 mb-3">Para a unidade</p>
                    <h3 className="text-2xl font-extrabold tracking-tight mb-6">Controle total no painel administrativo</h3>
                    <ul className="space-y-3.5 text-[14px] font-medium text-slate-600">
                        {['Aprovação de cadastros com documento anexado', 'Produtos manuais ou importados do XML de NF-e', 'PDV de balcão, caixa e relatórios completos', 'Recebimento direto na conta da empresa'].map((t, i) => (
                            <li key={i} className="flex items-start gap-3"><CheckCircle2 size={18} className="shrink-0 mt-0.5 text-[#0e7a4d]" /> {t}</li>
                        ))}
                    </ul>
                </motion.div>
            </section>

            {/* ── STATS ── */}
            <section className="py-14 sm:py-20 max-w-6xl mx-auto px-4 sm:px-6">
                <div className="grid sm:grid-cols-3 gap-5">
                    {[
                        { icone: HeartHandshake, titulo: 'Quem administra o sistema', texto: 'Associação dos Servidores do Sistema Penal de Peixoto de Azevedo/MT — ASSPEN.' },
                        { icone: ShieldCheck, titulo: 'Dados protegidos', texto: 'Cadastros verificados, documentos confidenciais e trilha de auditoria completa.' },
                        { icone: Package, titulo: 'Milhares de vendas por semana', texto: 'Plataforma testada em operação real, funciona em qualquer dispositivo.' }
                    ].map((s, i) => (
                        <motion.div key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="text-center px-6 py-8 rounded-[1.75rem] bg-slate-50 border border-slate-100">
                            <div className="w-11 h-11 rounded-2xl bg-[#0e7a4d]/10 flex items-center justify-center mx-auto mb-4"><s.icone size={20} className="text-[#0e7a4d]" /></div>
                            <h4 className="font-extrabold tracking-tight mb-1.5">{s.titulo}</h4>
                            <p className="text-[13px] text-slate-500 font-medium leading-relaxed">{s.texto}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* ── APP ── */}
            <section id="app" className="py-16 sm:py-24 bg-[#0f172a] scroll-mt-16">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-10 items-center">
                    <motion.div {...fadeUp}>
                        <p className="text-[11px] font-black tracking-[0.3em] uppercase text-emerald-400 mb-3">Instale no seu aparelho</p>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Baixe o app da ASSPEN no seu aparelho</h2>
                        <p className="mt-4 text-slate-400 font-medium leading-relaxed">Funciona em celular, tablet e computador — leve, rápido e sem ocupar espaço.</p>
                        <div className="mt-7 flex flex-wrap gap-3">
                            <button onClick={instalarApp} disabled={installing} className="px-6 py-3.5 min-h-[44px] rounded-2xl bg-[#0e7a4d] hover:bg-[#0c6b44] text-white font-bold text-sm transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center gap-2 disabled:opacity-60">
                                {installing ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />} Instalar app agora
                            </button>
                            <button onClick={() => abrir('login')} className="px-6 py-3.5 min-h-[44px] rounded-2xl border border-slate-700 text-slate-200 font-bold text-sm hover:bg-slate-800 transition-colors cursor-pointer">
                                Continuar no navegador
                            </button>
                        </div>
                    </motion.div>
                    <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="flex justify-center gap-4">
                        {[{ i: Smartphone, l: 'Celular' }, { i: Tablet, l: 'Tablet' }, { i: Monitor, l: 'Computador' }].map((d, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-3 bg-slate-900 border border-slate-800 rounded-3xl px-7 py-8 min-h-[44px]">
                                <d.i size={30} className="text-emerald-400" />
                                <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">{d.l}</p>
                            </div>
                        ))}
                    </motion.div>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <AppFooter
                appName="ASSPEN"
                institutionName="Peixoto de Azevedo/MT"
                developerName="Edevaldo de Lima Almeida"
                developerEmail="edh333@hotmail.com"
            />
        </div>
    );
};
