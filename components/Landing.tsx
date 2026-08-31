import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Store, ShieldCheck, QrCode, ClipboardCheck, Package, Building2,
    Smartphone, Tablet, Monitor, Download, ArrowRight, CheckCircle2,
    Lock, HeartHandshake, Loader2, Menu, X, Phone, Mail, MapPin
} from 'lucide-react';
import { Login } from '../pages/Login';

const fadeUp = {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }
};

const primaryColor = 'var(--primary-color)';
const primaryLight = 'var(--primary-light)';
const secondaryColor = 'var(--secondary-color)';
const textMain = 'var(--text-main)';
const textMuted = 'var(--text-muted)';
const bgMain = 'var(--bg-main)';
const bgCard = 'var(--bg-card)';
const borderColor = 'var(--border-color)';

const headerBg = { backgroundColor: `${primaryColor}/95`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${primaryColor}/20` };
const headerBgMobile = { backgroundColor: `${primaryColor}/98`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${primaryColor}/20` };
const heroGradient = { background: `linear-gradient(to bottom, ${primaryColor}, ${secondaryColor}, ${primaryColor})` };
const accentGradient = { background: `linear-gradient(to bottom right, ${primaryColor}, ${secondaryColor})` };
const btnPrimary = { backgroundColor: primaryColor, color: '#fff' };
const btnPrimaryHover = { backgroundColor: secondaryColor };
const btnOutline = { backgroundColor: '#fff', color: primaryColor, border: `2px solid ${primaryColor}` };
const btnOutlineHover = { backgroundColor: primaryLight };
const btnGhost = { color: primaryColor, backgroundColor: `${primaryColor}/10`, border: `1px solid ${primaryColor}/20` };
const btnGhostHover = { backgroundColor: `${primaryColor}/20` };
const cardAccent = { backgroundColor: `${primaryColor}/10`, border: `1px solid ${primaryColor}/20` };
const cardAccentHover = { backgroundColor: primaryColor, color: '#fff' };
const iconPrimary = { color: primaryColor };
const textPrimary = { color: primaryColor };
const textPrimaryLight = { color: `${primaryColor}/90` };
const badgePrimary = { backgroundColor: `${primaryColor}/15`, color: primaryColor };
const focusRing = { boxShadow: `0 0 0 3px ${primaryColor}/30` };

export const Landing: React.FC<{ skipLanding?: boolean }> = ({ skipLanding }) => {
    const [authOpen, setAuthOpen] = useState(false);
    const [initialTab, setInitialTab] = useState<'login' | 'register'>('login');
    const [installing, setInstalling] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (skipLanding) { setAuthOpen(true); return; }
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === '1') { setAuthOpen(true); return; }
        const applyHash = () => {
            const h = window.location.hash;
            if (h === '#entrar') { setInitialTab('login'); setAuthOpen(true); }
            if (h === '#criar-conta') { setInitialTab('register'); setAuthOpen(true); }
        };
        applyHash();
        window.addEventListener('hashchange', applyHash);
        return () => window.removeEventListener('hashchange', applyHash);
    }, [skipLanding]);

    const abrir = (tab: 'login' | 'register') => {
        setInitialTab(tab);
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
        return <Login initialTab={initialTab} onVolver={() => { setAuthOpen(false); try { window.history.replaceState(null, '', ' '); } catch { /* ignora */ } }} />;
    }

    return (
        <div style={{ backgroundColor: bgMain, color: textMain }} className="min-h-screen font-sans overflow-x-hidden">
            {/* ── NAV ── */}
            <header style={headerBg} className="fixed top-0 inset-x-0 z-50 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div style={{ width: 36, height: 36, borderRadius: '0.75rem', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Store size={19} style={iconPrimary} strokeWidth={2.4} />
                        </div>
                        <div className="leading-none min-w-0">
                            <p style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em' }}>ASSPEN</p>
                            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Peixoto de Azevedo/MT</p>
                        </div>
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold text-white/85">
                        <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
                        <a href="#familiares" className="hover:text-white transition-colors">Para familiares</a>
                        <a href="#unidade" className="hover:text-white transition-colors">Para a unidade</a>
                        <a href="#app" className="hover:text-white transition-colors">Aplicativo</a>
                    </nav>
                    <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ minHeight: 44, minWidth: 44, padding: 8, borderRadius: '0.5rem' }} className="md:hidden text-white hover:bg-white/10 transition-colors" aria-label="Menu">
                        {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={() => abrir('login')} style={{ padding: '12px 16px', minHeight: 44, borderRadius: '0.75rem', fontSize: '0.75rem', fontWeight: 700, color: '#fff', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'transparent', cursor: 'pointer' }} className="px-4 py-3 min-h-[44px] rounded-xl text-[12px] font-bold hover:bg-white/10 transition-colors">Entrar</button>
                        <button onClick={() => abrir('register')} style={btnOutline} className="px-4 py-3 min-h-[44px] rounded-xl text-[12px] font-bold hover:bg-emerald-50 transition-colors shadow-sm cursor-pointer">Criar conta</button>
                    </div>
                </div>
            </header>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
                        style={headerBgMobile} className="fixed top-16 inset-x-0 z-40 backdrop-blur-md border-b border-white/10 md:hidden">
                        <nav className="flex flex-col p-4 gap-1">
                            {['#como-funciona','#familiares','#unidade','#app'].map((href, i) => (
                                <a key={href} href={href} onClick={() => setMobileMenuOpen(false)}
                                    style={{ minHeight: 44, padding: '12px 16px', borderRadius: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}
                                    className="flex items-center py-3 px-4 rounded-xl hover:bg-white/10 transition-colors">
                                    {['Como funciona','Para familiares','Para a unidade','Aplicativo'][i]}
                                </a>
                            ))}
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HERO */}
            <section style={heroGradient} className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
                <div style={{ position: 'absolute', top: '-8rem', right: '-6rem', width: '12rem', height: '12rem', borderRadius: '50%', backgroundColor: `${primaryColor}/15`, filter: 'blur(80px)' }} className="absolute -top-32 -right-24 w-[480px] h-[480px] rounded-full blur-[140px]"></div>
                <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
                    <motion.h1 {...fadeUp} className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
                        Vendas para <span style={textPrimaryLight}>familiares de presos</span> com total segurança
                    </motion.h1>
                    <motion.p {...fadeUp} style={{ marginTop: '1.25rem', fontSize: '1rem', lineHeight: 1.7, maxWidth: '32rem', marginLeft: 'auto', marginRight: 'auto', fontWeight: 500 }} className="mt-5 text-base sm:text-lg leading-relaxed max-w-lg font-medium">
                        Sistema completo de gestão: catálogo, carrinho, PIX, carteira digital, relatórios e impressão térmica — tudo pensado para a rotina real de unidades prisionais.
                    </motion.p>
                    <motion.div {...fadeUp} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button onClick={() => abrir('register')} style={{ ...btnPrimary, padding: '14px 28px', minHeight: 44, borderRadius: '1rem', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'all 0.15s' }} className="px-7 py-3.5 min-h-[44px] rounded-2xl font-bold text-sm hover:bg-emerald-50 transition-all shadow-xl active:scale-[0.98] cursor-pointer flex items-center gap-2">
                            <ArrowRight size={18} /> Começar agora
                        </button>
                    </motion.div>
                    <motion.div {...fadeUp} className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[12px] font-semibold" style={{ color: `rgba(255,255,255,0.8)` }}>
                        <span className="flex items-center gap-1.5"><ShieldCheck size={14} /> Seguro e auditável</span>
                        <span className="flex items-center gap-1.5"><ClipboardCheck size={14} /> Aprovação em segundos</span>
                        <span className="flex items-center gap-1.5"><Package size={14} /> Entrega rastreada</span>
                        <span className="flex items-center gap-1.5"><HeartHandshake size={14} /> Feito para quem cuida</span>
                    </motion.div>
                </div>

                {/* Trust bar */}
                <motion.div {...fadeUp} className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-6xl px-4 pb-8">
                    <div style={{ backgroundColor: primaryColor, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '1rem' }} className="bg-[#0e7a4d] px-5 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div style={{ width: 36, height: 36, borderRadius: '0.75rem', backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="w-9 h-9 rounded-xl bg-[#0e7a4d]/10 flex items-center justify-center">
                                <Package size={17} style={iconPrimary} />
                            </div>
                            <div>
                                <p style={{ color: '#fff', fontWeight: 700, fontSize: '0.875rem' }}>Kit higiene pessoal</p>
                                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 600 }}>Aprovado · Entregue hoje</p>
                            </div>
                        </div>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: '1.125rem' }}>R$ 89,90</div>
                    </div>
                </motion.div>
            </section>

            {/* COMO FUNCIONA */}
            <section id="como-funciona" className="py-16 sm:py-24 bg-white">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
                        <p style={textPrimary} className="text-[11px] font-black tracking-[0.3em] uppercase mb-3">Como funciona</p>
                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Simples, rápido e transparente</h2>
                    </motion.div>
                    <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
                        {[
                            { icone: Store, titulo: 'Catálogo digital', desc: 'Produtos com foto, descrição, categoria e preço promocional. Busca por nome, marca ou código de barras.' },
                            { icone: ShieldCheck, titulo: 'Carrinho + PIX', desc: 'Familiar monta o pedido, escolhe PIX, anexa comprovante e envia. Tudo pelo celular, sem filas.' },
                            { icone: ClipboardCheck, titulo: 'Aprovação instantânea', desc: 'Operador valida o comprovante no painel e o pedido sai para separação. Estoque baixa automaticamente.' },
                        ].map((item, i) => (
                            <motion.div key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="group bg-white border border-slate-200 rounded-[1.75rem] p-7 hover:border-emerald-500/40 hover:shadow-xl hover:-translate-y-1 transition-all">
                                <div style={{ width: 48, height: 48, borderRadius: '1.25rem', backgroundColor: `${primaryColor}/10`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', transition: 'all 0.3s' }} className="w-12 h-12 rounded-2xl bg-[#0e7a4d]/10 flex items-center justify-center mb-5 group-hover:bg-[#0e7a4d] transition-colors">
                                    <item.icone size={22} style={iconPrimary} className="group-hover:text-white transition-colors" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">{item.titulo}</h3>
                                <p className="text-slate-600 leading-relaxed text-sm">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* PARA FAMILIARES */}
            <section id="familiares" style={accentGradient} className="relative overflow-hidden scroll-mt-24">
                <motion.div {...fadeUp} className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center" style={{ paddingTop: '4rem', paddingBottom: '4rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', borderRadius: '2rem', padding: '2rem 2.5rem' }}>
                    <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '0.75rem' }} className="text-[11px] font-black tracking-[0.3em] uppercase mb-3">Para familiares</p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-6">Compre para quem você ama sem sair de casa</h2>
                    <ul className="space-y-3.5 text-[14px] font-medium text-center" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        {[
                            'Escolha os produtos no catálogo pelo celular',
                            'Pague com PIX — comprovante anexado na hora',
                            'Acompanhe o status: separado → saiu → entregue',
                            'Receba confirmação de entrega em tempo real',
                        ].map((t, i) => (
                            <li key={i} className="flex items-start justify-center gap-3">
                                <CheckCircle2 size={18} style={{ color: 'rgba(255,255,255,0.85)', flexShrink: 0, marginTop: 2 }} className="shrink-0 mt-0.5" />
                                {t}
                            </li>
                        ))}
                    </ul>
                    <motion.div {...fadeUp} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button onClick={() => abrir('register')} style={{ ...btnPrimary, padding: '14px 24px', minHeight: 44, borderRadius: '1rem', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} className="px-6 py-3.5 min-h-[44px] rounded-2xl bg-[#0e7a4d] hover:bg-[#0c6b44] text-white font-bold text-sm transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center gap-2">
                            <Download size={18} /> Baixar aplicativo
                        </button>
                        <button onClick={() => abrir('login')} style={{ padding: '14px 24px', minHeight: 44, borderRadius: '1rem', fontWeight: 700, fontSize: '0.875rem', color: '#fff', border: '2px solid rgba(255,255,255,0.5)', backgroundColor: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} className="px-6 py-3.5 min-h-[44px] rounded-2xl border-2 border-white/50 text-white font-bold text-sm hover:bg-white/10 transition-all active:scale-[0.98] cursor-pointer flex items-center gap-2">
                            <ArrowRight size={18} /> Já tenho conta
                        </button>
                    </motion.div>
                </motion.div>
            </section>

            {/* PARA A UNIDADE */}
            <section id="unidade" className="py-16 sm:py-24 bg-white">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
                        <p style={textPrimary} className="text-[11px] font-black tracking-[0.3em] uppercase mb-3">Para a unidade</p>
                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Gestão completa no painel administrativo</h2>
                    </motion.div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                            { icone: Building2, titulo: 'Estoque & Catálogo', desc: 'Cadastro com foto, categoria, código de barras, preço promocional e estoque mínimo.' },
                            { icone: Smartphone, titulo: 'PDV Touch', desc: 'Tela de venda otimizada para touch: busca inteligente, atalhos F1-F12, carrinho persistente.' },
                            { icone: QrCode, titulo: 'PIX & Carteira', desc: 'Chaves PIX rotativas, carteira digital com limite semanal, saque controlado.' },
                            { icone: ShieldCheck, titulo: 'Relatórios & Auditoria', desc: 'Fechamento de dia, DRE, curva ABC, extratos, CSVs para contabilidade.' },
                        ].map((item, i) => (
                            <motion.div key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="group bg-white border border-slate-200 rounded-[1.75rem] p-6 hover:border-emerald-500/40 hover:shadow-lg transition-all">
                                <div style={{ width: 44, height: 44, borderRadius: '1.25rem', backgroundColor: `${primaryColor}/10`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', marginLeft: 'auto', marginRight: 'auto', transition: 'all 0.3s' }} className="w-11 h-11 rounded-2xl bg-[#0e7a4d]/10 flex items-center justify-center mx-auto mb-4">
                                    <item.icone size={20} style={iconPrimary} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 text-center mb-2">{item.titulo}</h3>
                                <p className="text-slate-600 text-sm text-center leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* APP */}
            <section id="app" className="py-16 sm:py-24 bg-slate-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6">
                    <motion.div {...fadeUp} className="text-center mb-12 sm:mb-16">
                        <p style={{ color: '#6b7280', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', marginBottom: '0.75rem' }} className="text-[11px] font-black tracking-[0.3em] uppercase mb-3">Instale no seu aparelho</p>
                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Funciona offline, sincroniza quando volta</h2>
                    </motion.div>
                    <div className="grid md:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto">
                        {[
                            { icone: Smartphone, titulo: 'PWA Instalável', desc: 'Adicione à tela inicial como app nativo. Funciona offline com fila de sincronização.' },
                            { icone: Tablet, titulo: 'Responsivo Total', desc: 'Interface adaptada para celular, tablet e desktop. Touch-first no PDV.' },
                            { icone: Monitor, titulo: 'Desktop Admin', desc: 'Painel completo no navegador. Relatórios, usuários, estoque, financeiro.' },
                        ].map((item, i) => (
                            <motion.div key={i} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.08 }} className="bg-white border border-slate-200 rounded-[1.75rem] p-7 hover:border-emerald-500/40 hover:shadow-xl hover:-translate-y-1 transition-all">
                                <div style={{ width: 48, height: 48, borderRadius: '1.25rem', backgroundColor: `${primaryColor}/10`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', transition: 'all 0.3s' }} className="w-12 h-12 rounded-2xl bg-[#0e7a4d]/10 flex items-center justify-center mb-5 group-hover:bg-[#0e7a4d] transition-colors">
                                    <item.icone size={22} style={iconPrimary} className="group-hover:text-white transition-colors" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">{item.titulo}</h3>
                                <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                    <motion.div {...fadeUp} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button onClick={instalarApp} disabled={installing} style={{ ...btnPrimary, padding: '14px 24px', minHeight: 44, borderRadius: '1rem', fontWeight: 700, fontSize: '0.875rem', cursor: installing ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }} className="px-6 py-3.5 min-h-[44px] rounded-2xl bg-[#0e7a4d] hover:bg-[#0c6b44] text-white font-bold text-sm transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center gap-2 disabled:opacity-60">
                            <Download size={18} /> {installing ? 'Instalando...' : 'Instalar aplicativo'}
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* FOOTER */}
            <footer style={{ background: `linear-gradient(to top, ${primaryColor}, ${secondaryColor})`, borderTop: `4px solid ${primaryColor}` }} className="pt-10 pb-32 md:pb-10 relative overflow-hidden">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start">
                        <div className="text-center md:text-left">
                            <h3 className="font-black text-base text-white mb-2 uppercase tracking-wider">ASSPEN</h3>
                            <p className="leading-relaxed text-white/80 font-medium">Associação dos Servidores do Sistema Penal de Peixoto de Azevedo/MT</p>
                            <p className="mt-2 font-mono text-[11px] text-white/50">CNPJ: 53.100.595/0001-13</p>
                        </div>
                        <div className="flex flex-col gap-4 items-center md:items-start">
                            <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-sm">Fale Conosco</h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '0.5rem', width: '100%', maxWidth: '100%' }} className="flex items-center gap-3 text-white/80 bg-white/5 px-4 py-2 rounded-lg w-full md:w-auto">
                                <Phone size={16} /> <span className="font-bold text-sm">(66) 99999-9999</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.8)' }}>
                                <Mail size={16} /> <span className="text-sm">asspen@email.com</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 items-center md:items-start">
                            <h4 className="font-bold text-white mb-1 uppercase tracking-wider text-sm">Localização</h4>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, color: 'rgba(255,255,255,0.8)' }}>
                                <MapPin size={16} style={{ marginTop: 2 }} /> <span className="max-w-[220px] text-center md:text-left text-sm">Peixoto de Azevedo, MT</span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-10 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}></div>
                    <div className="mt-8 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase' }} className="text-[11px] text-white/50 uppercase tracking-widest font-bold">© {new Date().getFullYear()} Todos os direitos reservados.</p>
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', padding: '16px 24px', borderRadius: '1.75rem', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)' }} className="bg-white/5 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 shadow-lg">
                            <p style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }} className="text-xs font-bold text-white uppercase tracking-wider mb-1">Desenvolvido por</p>
                            <p style={{ color: primaryColor, fontSize: '0.875rem', fontWeight: 800, letterSpacing: '0.05em' }} className="text-sm font-black text-emerald-400 tracking-wide">Edevaldo de Lima Almeida</p>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.625rem', fontFamily: 'monospace', marginTop: 4 }} className="text-[10px] text-white/60 font-mono mt-1">edh333@hotmail.com</p>
                            <p style={{ color: `${primaryColor}/70`, fontSize: '0.625rem', fontFamily: 'monospace', marginTop: 2 }} className="text-[10px] text-emerald-400/70 font-mono mt-0.5">(66) 99999-9999</p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};