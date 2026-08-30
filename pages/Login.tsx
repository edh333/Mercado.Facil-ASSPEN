import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/StoreContext';
import { 
    Lock, User, Phone, CheckCircle, Upload, Eye, EyeOff, 
    ArrowLeft, Loader2, Settings, UserCheck, Briefcase, 
    XCircle, KeyRound, Sparkles, ChevronDown, Store,
    ShieldCheck, Wallet, ShoppingBag
} from 'lucide-react';
import { validateCPF } from '../utils';
import { User as UserType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';
import { getFunctions, httpsCallable } from 'firebase/functions';

const fnCriarPrimeiroAdmin = httpsCallable(getFunctions(), 'criarPrimeiroAdmin');

export const Login: React.FC<{ initialTab?: 'login' | 'register'; onVolver?: () => void }> = ({ initialTab = 'login', onVolver }) => {
    const { loginAdmin, loginFamiliar, registerUser, resetUserPassword, validateRecovery, showNotification, settings, preRegisteredInmates } = useApp();
    const [activeTab, setActiveTab] = useState<'login' | 'register' | 'admin' | 'recovery'>(initialTab);

    const urlParams = new URLSearchParams(window.location.search);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    const isUserPwa = urlParams.get('mode') === 'user' || (isStandalone && urlParams.get('mode') !== 'admin');

    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

    const [recoveryStep, setRecoveryStep] = useState<1 | 2>(1);

const [recoveryPrisonerCpf, setRecoveryPrisonerCpf] = useState('');
const [recoveryUserCpf, setRecoveryUserCpf] = useState('');
const [recoveryName, setRecoveryName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    const [legalTermAccepted, setLegalTermAccepted] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [formSuccess, setFormSuccess] = useState<string | null>(null);
    const [showFirstAdminSetup, setShowFirstAdminSetup] = useState(false);
    const [firstAdminForm, setFirstAdminForm] = useState({ name: '', email: '', password: '', confirm: '' });

    const [regData, setRegData] = useState({
        name: '', phone: '', prisonerName: '', prisonerCpf: '', kinship: '', kinshipOther: '', unitId: '1'
    });
    const [fileObject, setFileObject] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = activeTab === 'admin';
    const isRegister = activeTab === 'register';
    const isRecovery = activeTab === 'recovery';

    useEffect(() => {
        setCpf('');
        setPassword('');
        setRegisterConfirmPassword('');
        setAdminEmail('');
        setRegData({ name: '', phone: '', prisonerName: '', prisonerCpf: '', kinship: '', kinshipOther: '', unitId: '1' });
        setFileObject(null);
        setLegalTermAccepted(false);
        setFormError(null);
        setFormSuccess(null);
        setRecoveryPrisonerCpf('');
        setRecoveryUserCpf('');
        setRecoveryName('');
        setNewPassword('');
        setConfirmNewPassword('');
        setLoadingMessage('');
    }, [activeTab]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setFormError(null);
        setFormSuccess(null);

        try {
            // Primeiro admin setup
            if (isAdmin && showFirstAdminSetup) {
                if (firstAdminForm.name.trim().length < 3) { setFormError("Informe o nome do administrador."); setIsLoading(false); return; }
                if (!firstAdminForm.email.includes('@') || firstAdminForm.email.length < 6) { setFormError("E-mail inválido."); setIsLoading(false); return; }
                if (firstAdminForm.password.length < 6) { setFormError("Senha deve ter no mínimo 6 caracteres."); setIsLoading(false); return; }
                if (firstAdminForm.password !== firstAdminForm.confirm) { setFormError("Senhas não coincidem."); setIsLoading(false); return; }
                setLoadingMessage('Criando administrador inicial...');
                try {
                    const res: any = await fnCriarPrimeiroAdmin({
                        nome: firstAdminForm.name.trim(),
                        email: firstAdminForm.email.trim(),
                        senha: firstAdminForm.password
                    });
                    if (res?.data?.ok) {
                        setShowFirstAdminSetup(false);
                        setAdminEmail(firstAdminForm.email.trim());
                        setPassword(firstAdminForm.password);
                        setFormError(null);
                        setFormSuccess("Administrador criado! Entre com a senha definida.");
                        showNotification('Administrador inicial criado com sucesso!', 'success');
                    } else {
                        throw new Error("Falha ao criar o administrador.");
                    }
                } catch (err: any) {
                    const msg = err?.message || 'Erro ao criar o administrador inicial.';
                    setFormError(msg);
                    showNotification(msg, "error");
                } finally {
                    setIsLoading(false);
                    setLoadingMessage('');
                }
                return;
            }

            if (isAdmin) {
                setLoadingMessage('Autenticando...');
                await loginAdmin(adminEmail, password);
            } else if (isRegister) {
                const cleanUserCpf = (cpf || '').replace(/\D/g, '');
                const cleanPrisonerCpf = (regData?.prisonerCpf || '').replace(/\D/g, '');

                if (!validateCPF(cleanUserCpf)) throw new Error("CPF do usuário inválido.");
                if (!validateCPF(cleanPrisonerCpf)) throw new Error("CPF do interno inválido.");

                const isPreRegistered = preRegisteredInmates.some(inmate => (inmate?.cpf || '').replace(/\D/g, '') === cleanPrisonerCpf);
                if (!isPreRegistered && preRegisteredInmates.length > 0) {
                    throw new Error("Este interno não consta em nossa lista de pré-cadastro.");
                }

                if (!fileObject) throw new Error("Anexe a foto do documento.");
                if (!legalTermAccepted) throw new Error("Aceite o termo legal.");
                if (password.length < 6) throw new Error("Senha deve ter no mínimo 6 caracteres.");
                if (password !== registerConfirmPassword) throw new Error("Senhas não coincidem.");
                // O `required` do HTML não dispara em botão type=button: validar na mão.
                if (!(regData?.name || '').trim()) throw new Error("Informe seu nome completo.");
                if (!(regData?.phone || '').trim()) throw new Error("Informe um telefone de contato.");
                const parentescoFinal = regData.kinship === 'Outros' ? regData.kinshipOther : regData.kinship;
                if (!parentescoFinal || !String(parentescoFinal).trim()) throw new Error("Informe o grau de parentesco.");

                setLoadingMessage('Processando cadastro...');
                await registerUser({
                    id: '',
                    cpf: cleanUserCpf,
                    name: (regData?.name || '').toUpperCase(),
                    password: password,
                    phone: regData.phone,
                    role: 'FAMILIAR',
                    approved: false,
                    unitId: regData.unitId,
                    prisonerName: regData.prisonerName.toUpperCase(),
                    prisonerCpf: cleanPrisonerCpf,
                    kinship: regData.kinship === 'Outros' ? regData.kinshipOther : regData.kinship
                } as any, fileObject);

                setFormSuccess("Cadastro enviado! Aguarde liberação.");
                showNotification('Cadastro realizado!', 'success');
                setTimeout(() => setActiveTab('login'), 3000);

            } else if (isRecovery) {
                if (recoveryStep === 1) {
                    setLoadingMessage('Validando dados...');
                    await validateRecovery(recoveryUserCpf, recoveryPrisonerCpf, recoveryName);
                    setRecoveryStep(2);
                } else {
                    // Senha vazia NUNCA conclui: antes, o fluxo avançava sem chamar
                    // resetUserPassword e mostrava "Acesso liberado" mentirosamente.
                    const nova = newPassword.trim();
                    if (!nova) throw new Error("Digite a nova senha para concluir.");
                    setLoadingMessage('Salvando nova senha...');
                    if (nova.length < 6) throw new Error("Mínimo 6 caracteres.");
                    if (nova !== confirmNewPassword.trim()) throw new Error("Senhas não coincidem.");
                    await resetUserPassword(recoveryUserCpf, recoveryPrisonerCpf, nova, recoveryName);
                    setFormSuccess("Senha alterada!");
                    setTimeout(() => setActiveTab('login'), 2500);
                }
            } else {
                setLoadingMessage('Entrando...');
                await loginFamiliar(cpf, password);
            }
        } catch (error: any) {
            setFormError(error.message);
            showNotification(error.message, "error");
            if (isAdmin && String(error.message || '').toLowerCase().includes('primeiro acesso')) {
                setShowFirstAdminSetup(true);
            }
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    return (
        <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr] font-sans bg-[var(--bg-main)]">
            <OnlineStatusIndicator />

            {/* ── PAINEL DE MARCA (desktop) — gradiente idêntico ao das telas
                de impressão: identidade única slate→esmeralda em todo o sistema ── */}
            <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
                <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] bg-[length:26px_26px]"></div>
                {settings?.loginBgUrl && settings?.loginBgType === 'image' && (
                    <div
                        className="absolute inset-0 opacity-[0.07]"
                        style={{ backgroundImage: `url(${settings.loginBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    ></div>
                )}
                <div className="absolute top-[-20%] right-[-15%] w-[60%] h-[60%] rounded-full blur-[140px] opacity-25" style={{ backgroundColor: '#10b981' }}></div>

                <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="relative flex items-center gap-2.5"
                >
                    <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
                        <Store size={18} className="text-white" />
                    </div>
                    <div className="leading-tight">
                        <p className="text-lg font-bold tracking-tight text-white">{settings?.appName || 'ASSPEN'}</p>
                        <p className="text-xs text-white/70">Sistema de Gestão Penitenciária</p>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="relative"
                >
                    <h2 className="text-balance text-4xl font-bold leading-tight tracking-tight text-white">
                        {settings?.landingPageTagline || 'Aproxima você de quem você ama.'}
                    </h2>
                    <p className="mt-4 text-balance text-white/70">
                        {settings?.landingPageSubtitle || 'Compras com praticidade e segurança para familiares de pessoas privadas de liberdade, com acompanhamento completo dos pedidos.'}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.25 }}
                    className="relative space-y-3 text-sm text-white/80"
                >
                    <div className="flex items-center gap-2.5">
                        <ShieldCheck size={16} className="text-emerald-300 shrink-0" />
                        Cadastro seguro com verificação de vínculo e documento
                    </div>
                    <div className="flex items-center gap-2.5">
                        <ShoppingBag size={16} className="text-emerald-300 shrink-0" />
                        Catálogo completo com entrega na unidade
                    </div>
                    <div className="flex items-center gap-2.5">
                        <Wallet size={16} className="text-emerald-300 shrink-0" />
                        Carteira interna com depósito via PIX e extrato detalhado
                    </div>
                </motion.div>
            </div>

            {/* ── COLUNA DO FORMULÁRIO ── */}
            <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-md"
                >
                    {/* Marca (mobile/tablet) */}
                    <div className="mb-6 flex items-center gap-2.5 lg:hidden">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                            <Store size={18} />
                        </div>
                        <div className="leading-tight">
                            <p className="text-lg font-bold tracking-tight text-slate-900">{isAdmin ? 'Painel Administrativo' : (settings?.appName || 'ASSPEN')}</p>
                            <p className="text-xs text-slate-500">{isAdmin ? 'Acesso restrito' : 'Gestão Penitenciária'}</p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.06] sm:p-8">

                        {/* Abas */}
                        <AnimatePresence mode="wait">
                            {!isAdmin && !isRecovery && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex bg-slate-100 p-1 rounded-lg mb-6"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('login')}
                                        className={`flex-1 py-3.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${activeTab === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Entrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('register')}
                                        className={`flex-1 py-3.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${activeTab === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Criar Conta
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {!isAdmin && !isRecovery && (
                            <div className="mb-6">
                                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                                    {isRegister ? 'Criar sua conta' : 'Bem-vindo de volta'}
                                </h1>
                                <p className="mt-1 text-sm text-slate-500">
                                    {isRegister ? 'Preencha seus dados e o vínculo prisional' : 'Entre com seu CPF e senha para continuar'}
                                </p>
                            </div>
                        )}
                        {(isAdmin || isRecovery) && (
                            <div className="mb-6">
                                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                                    {isAdmin ? 'Painel Administrativo' : 'Recuperar Acesso'}
                                </h1>
                                <p className="mt-1 text-sm text-slate-500">
                                    {isAdmin ? 'Autentique-se para gerenciar o sistema' : 'Informe os dados para recuperar sua senha'}
                                </p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>

                            {/* Feedbacks */}
                            <AnimatePresence>
                                {formError && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-red-50 border border-red-100 border-l-4 border-l-red-500 p-3.5 rounded-xl flex gap-3 items-start overflow-hidden">
                                        <XCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                                        <p className="text-[11px] font-bold text-red-700 leading-snug">{formError}</p>
                                    </motion.div>
                                )}
                                {formSuccess && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-emerald-50 border border-emerald-100 border-l-4 border-l-emerald-500 p-3.5 rounded-xl flex gap-3 items-start overflow-hidden">
                                        <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                                        <p className="text-[11px] font-bold text-emerald-700 leading-snug">{formSuccess}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Registration Fields */}
                            {isRegister && (
                                <div className="space-y-4 animate-fadeIn">
                                    <PremiumInput icon={User} label="Nome Completo" value={regData?.name || ''} onChange={(e: any) => setRegData({ ...regData, name: e.target.value })} />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <PremiumInput icon={Phone} label="Telefone" value={regData.phone} onChange={(e: any) => setRegData({ ...regData, phone: e.target.value })} />
                                        <PremiumInput icon={UserCheck} label="Seu CPF" value={cpf} onChange={(e: any) => setCpf(e.target.value)} />
                                    </div>
                                    <div className="pt-4">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-4 text-center">Senha de Acesso</p>
                                        <div className="space-y-3">
                                            <PremiumInput icon={Lock} label="Senha (mín. 6 caracteres)" value={password} onChange={(e: any) => setPassword(e.target.value)} type="password" />
                                            <PremiumInput icon={CheckCircle} label="Confirmar Senha" value={registerConfirmPassword} onChange={(e: any) => setRegisterConfirmPassword(e.target.value)} type="password" />
                                        </div>
                                    </div>
                                    <div className="pt-4">
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em] mb-4 text-center">Vínculo Prisional</p>
                                        <div className="space-y-3">
                                            <SelectInput label="Parentesco" value={regData.kinship} onChange={(e: any) => setRegData({ ...regData, kinship: e.target.value })} required>
                                                <option value="" disabled className="text-slate-700">Selecione o parentesco</option>
                                                <option value="Mãe">Mãe</option>
                                                <option value="Pai">Pai</option>
                                                <option value="Esposa">Esposa</option>
                                                <option value="Companheira">Companheira</option>
                                                <option value="Outros">Outros</option>
                                            </SelectInput>
                                            <PremiumInput icon={Briefcase} label="Nome do Interno" value={regData.prisonerName} onChange={(e: any) => setRegData({ ...regData, prisonerName: e.target.value })} />
                                            <PremiumInput icon={UserCheck} label="CPF do Interno" value={regData.prisonerCpf} onChange={(e: any) => setRegData({ ...regData, prisonerCpf: e.target.value })} />
                                        </div>
                                    </div>

                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`group border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 relative overflow-hidden ${fileObject ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40'}`}
                                    >
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => e.target.files && setFileObject(e.target.files[0])} />
                                        {fileObject ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg"><CheckCircle size={24} /></div>
                                                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Documento Anexado</p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-slate-700">
                                                <div className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-sm">
                                                    <Upload size={22} />
                                                </div>
                                                <p className="text-[11px] font-bold uppercase tracking-widest">Anexar RG ou CNH</p>
                                            </div>
                                        )}
                                    </div>

                                    <label className="flex items-start gap-3 cursor-pointer group bg-slate-50/80 p-4 rounded-2xl border border-slate-200/70 hover:border-emerald-300 transition-colors">
                                        <div className="relative mt-0.5 shrink-0">
                                            <input
                                                type="checkbox"
                                                className="peer w-5 h-5 appearance-none border-2 border-slate-300 rounded-md checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer"
                                                checked={legalTermAccepted} onChange={e => setLegalTermAccepted(e.target.checked)}
                                            />
                                            <CheckCircle size={13} className="absolute top-1 left-1 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
                                        </div>
                                        <span className="text-[11px] font-semibold leading-relaxed text-slate-600">
                                            <span className="font-black text-slate-700">AVISO LEGAL:</span> Documento ou comprovante falso configura crime de Estelionato (Art. 171) e Falsificação (Art. 297 do CP), sujeito a processo criminal e banimento.
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Recovery Fields */}
                            {isRecovery && (
                                <div className="space-y-4 animate-fadeIn">
                                    {recoveryStep === 1 ? (
                                        <>
                                            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                <KeyRound size={18} className="text-emerald-500 shrink-0" />
                                                <p className="text-[11px] font-bold text-slate-500 leading-snug">Informe os dados para localizarmos sua senha de acesso.</p>
                                            </div>
                                            <PremiumInput icon={UserCheck} label="Seu CPF" value={recoveryUserCpf} onChange={(e: any) => setRecoveryUserCpf(e.target.value)} />
                                            <PremiumInput icon={Briefcase} label="CPF do Interno" value={recoveryPrisonerCpf} onChange={(e: any) => setRecoveryPrisonerCpf(e.target.value)} />
                                            <PremiumInput icon={User} label="Nome Completo (como no cadastro)" value={recoveryName} onChange={(e: any) => setRecoveryName(e.target.value)} />
                                        </>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="pt-3 space-y-3">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">Atualizar Credenciais</p>
                                                <PremiumInput icon={Lock} label="Nova Senha" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)} type="password" />
                                                <PremiumInput icon={CheckCircle} label="Confirmar Nova" value={confirmNewPassword} onChange={(e: any) => setConfirmNewPassword(e.target.value)} type="password" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Login/Admin Fields */}
                            {!isRegister && !isRecovery && (
                                <div className="space-y-3 animate-fadeIn">
                                    {isAdmin && showFirstAdminSetup ? (
                                        <>
                                            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-center">
                                                    Primeiro acesso detectado — crie o administrador inicial do sistema.
                                                </p>
                                            </div>
                                            <PremiumInput icon={User} label="Nome do Administrador" value={firstAdminForm.name} onChange={(e: any) => setFirstAdminForm({ ...firstAdminForm, name: e.target.value })} type="text" />
                                            <PremiumInput icon={UserCheck} label="E-mail Corporativo" value={firstAdminForm.email} onChange={(e: any) => setFirstAdminForm({ ...firstAdminForm, email: e.target.value })} type="email" />
                                            <PremiumInput icon={Lock} label="Senha (mín. 6)" value={firstAdminForm.password} onChange={(e: any) => setFirstAdminForm({ ...firstAdminForm, password: e.target.value })} type="password" />
                                            <PremiumInput icon={CheckCircle} label="Confirmar Senha" value={firstAdminForm.confirm} onChange={(e: any) => setFirstAdminForm({ ...firstAdminForm, confirm: e.target.value })} type="password" />
                                            <button
                                                type="button"
                                                onClick={() => setShowFirstAdminSetup(false)}
                                                className="text-[11px] font-bold text-slate-500 hover:text-slate-900 uppercase tracking-widest mx-auto block transition-all cursor-pointer"
                                            >
                                                Já existem administradores? Clique aqui
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            {isAdmin ? (
                                                <PremiumInput icon={User} label="E-mail Corporativo" value={adminEmail} onChange={(e: any) => setAdminEmail(e.target.value)} type="email" />
                                            ) : (
                                                <PremiumInput icon={UserCheck} label="Digite seu CPF" value={cpf} onChange={(e: any) => setCpf(e.target.value)} />
                                            )}
                                            <PremiumInput
                                                icon={Lock}
                                                label="Senha de Acesso"
                                                value={password}
                                                onChange={(e: any) => setPassword(e.target.value)}
                                                type={showPassword ? "text" : "password"}
                                                action={
                                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer" aria-label="Mostrar senha">
                                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                    </button>
                                                }
                                            />
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Main Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2 relative overflow-hidden group bg-gradient-to-r from-emerald-600 to-emerald-500 hover:brightness-110 text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer shadow-lg shadow-emerald-500/25`}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={20} />
                                        <span className="relative z-10">{loadingMessage || 'Processando...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles size={18} className="relative z-10" />
                                        <span className="relative z-10">
                                            {isAdmin && showFirstAdminSetup ? 'Criar Administrador' : isAdmin ? 'Entrar no Painel' : isRegister ? 'Confirmar Cadastro' : isRecovery ? (recoveryStep === 1 ? 'Prosseguir' : 'Salvar e Voltar') : 'Acessar Sistema'}
                                        </span>
                                    </>
                                )}
                            </button>

                            {/* Forgot Password */}
                            {!isRecovery && !isRegister && !isAdmin && (
                                <div className="text-center pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('recovery')}
                                        className="text-[11px] font-bold text-slate-500 hover:text-emerald-600 uppercase tracking-[0.15em] transition-all cursor-pointer"
                                    >
                                        Esqueci minha senha
                                    </button>
                                </div>
                            )}
                        </form>

                        {/* Footer Actions */}
                        <div className="mt-8 pt-5 border-t border-slate-100 text-center">
                            {(isAdmin || isRecovery) ? (
                                <button
                                    type="button"
                                    onClick={() => { if (onVolver) { onVolver(); } else { setActiveTab('login'); } }}
                                    className="text-[11px] font-bold text-slate-500 hover:text-slate-900 flex items-center justify-center gap-2 mx-auto transition-all uppercase tracking-widest cursor-pointer"
                                >
                                    <ArrowLeft size={16} /> Voltar ao Início
                                </button>
                            ) : (
                                !isRegister && !isUserPwa && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('admin')}
                                        className="text-[10px] font-bold text-slate-400 hover:text-slate-700 transition-all flex items-center justify-center gap-2 mx-auto uppercase tracking-[0.25em] cursor-pointer"
                                    >
                                        <Settings size={13} /> Área Administrativa
                                    </button>
                                )
                            )}
                        </div>
                    </div>

                    {/* Rodapé */}
                <div className="mt-6 text-center px-4">
                    <p className="text-[11px] text-slate-400 font-medium tracking-wide leading-relaxed">
                        © 2026 {settings?.appName || 'ASSPEN'} · Todos os direitos reservados<br />
                        Desenvolvido por {settings?.dev_name || settings?.developerName || 'Edevaldo de Lima Almeida'}{settings?.dev_email || settings?.developerEmail ? ` · ${settings?.dev_email || settings?.developerEmail}` : ''}{settings?.dev_phone || settings?.developerPhone ? ` · Suporte: ${settings?.dev_phone || settings?.developerPhone}` : ''}
                    </p>
                </div>
            </motion.div>
            </div>
        </div>
    );
};

// Campo de texto premium — design limpo e moderno com label visível + acessibilidade
const PremiumInput = ({ icon: Icon, label, value, onChange, type = "text", action, id, error, required = true }: any) => {
    const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const errorId = error ? `${inputId}-error` : undefined;
    return (
        <div>
            <label htmlFor={inputId} className="block text-xs font-semibold tracking-wide text-slate-500 mb-2 ml-1">{label}</label>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15 focus-within:bg-white">
                <Icon size={17} className="text-slate-400 shrink-0" aria-hidden="true" />
                <input
                    type={type}
                    id={inputId}
                    className="flex-1 py-3 bg-transparent border-none outline-none text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                    placeholder={label}
                    value={value}
                    onChange={onChange}
                    required={required}
                    aria-invalid={!!error}
                    aria-describedby={errorId}
                />
                {action}
            </div>
            {error && <p id={errorId} className="mt-1.5 text-[10px] font-medium text-red-600" role="alert">{error}</p>}
        </div>
    );
};

// Campo select premium — acessível
const SelectInput = ({ label, value, onChange, children, required = true, id, error }: any) => {
    const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
    const errorId = error ? `${selectId}-error` : undefined;
    return (
        <div>
            <label htmlFor={selectId} className="block text-xs font-semibold tracking-wide text-slate-500 mb-2 ml-1">{label}</label>
            <div className="relative rounded-lg border border-slate-200 bg-slate-50/70 transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/15 focus-within:bg-white">
                <select
                    id={selectId}
                    className="w-full px-3.5 py-3 bg-transparent border-none outline-none text-sm font-semibold text-slate-900 appearance-none cursor-pointer tracking-wide"
                    value={value}
                    onChange={onChange}
                    required={required}
                    aria-invalid={!!error}
                    aria-describedby={errorId}
            >
                {children}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
    </div>
);
};