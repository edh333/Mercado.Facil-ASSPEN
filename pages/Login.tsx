import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/StoreContext';
import { 
    Lock, User, Phone, CheckCircle, Upload, Eye, EyeOff, 
    ArrowLeft, Loader2, Settings, UserCheck, Briefcase, 
    XCircle, KeyRound, Sparkles, ChevronDown, Store
} from 'lucide-react';
import { validateCPF } from '../utils';
import { User as UserType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { OnlineStatusIndicator } from '../components/OnlineStatusIndicator';
import { getFunctions, httpsCallable } from 'firebase/functions';

const fnCriarPrimeiroAdmin = httpsCallable(getFunctions(), 'criarPrimeiroAdmin');

export const Login: React.FC = () => {
    const { loginAdmin, loginFamiliar, registerUser, resetUserPassword, validateRecovery, showNotification, settings, preRegisteredInmates } = useApp();
    const [activeTab, setActiveTab] = useState<'login' | 'register' | 'admin' | 'recovery'>('login');

    const urlParams = new URLSearchParams(window.location.search);
    const isUserPwa = urlParams.get('mode') === 'user';

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
                    await validateRecovery(recoveryUserCpf, recoveryPrisonerCpf);
                    setRecoveryStep(2);
                } else {
                    if (newPassword) {
                        setLoadingMessage('Salvando nova senha...');
                        if (newPassword.length < 6) throw new Error("Mínimo 6 caracteres.");
                        if (newPassword !== confirmNewPassword) throw new Error("Senhas não coincidem.");
                        await resetUserPassword(recoveryUserCpf, recoveryPrisonerCpf, newPassword);
                    }
                    setFormSuccess(newPassword ? "Senha alterada!" : "Acesso liberado.");
                    setTimeout(() => setActiveTab('login'), 2500);
                }
            } else {
                setLoadingMessage('Entrando...');
                await loginFamiliar(cpf, password);
            }
        } catch (error: any) {
            setFormError(error.message);
            showNotification(error.message, "error");
            if (isAdmin && String(error.message || '').includes('primeiro administrador')) {
                setShowFirstAdminSetup(true);
            }
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const handleFirstAdminSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (firstAdminForm.name.trim().length < 3) { setFormError("Informe o nome do administrador."); return; }
        if (!firstAdminForm.email.includes('@') || firstAdminForm.email.length < 6) { setFormError("E-mail inválido."); return; }
        if (firstAdminForm.password.length < 6) { setFormError("Senha deve ter no mínimo 6 caracteres."); return; }
        if (firstAdminForm.password !== firstAdminForm.confirm) { setFormError("Senhas não coincidem."); return; }
        setIsLoading(true);
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
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden bg-[#070d18]">
            <OnlineStatusIndicator />

            {/* ── FUNDO PROFISSIONAL ANIMADO ── */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0a1120] via-[#0f172a] to-[#052e22]"></div>
                {/* Grade sutil */}
                <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] bg-[length:26px_26px]"></div>
                {/* Halos de luz */}
                <div className="absolute top-[-18%] left-[-12%] w-[55%] h-[55%] rounded-full blur-[160px] opacity-40 animate-float" style={{ backgroundColor: '#10b981' }}></div>
                <div className="absolute bottom-[-18%] right-[-12%] w-[55%] h-[55%] rounded-full blur-[160px] opacity-30 animate-float" style={{ backgroundColor: '#0ea5e9', animationDelay: '2.5s' }}></div>
                <div className="absolute top-[38%] right-[18%] w-72 h-72 rounded-full blur-[120px] opacity-20 animate-float" style={{ backgroundColor: '#f59e0b', animationDelay: '4s' }}></div>
                {/* Imagem de fundo configurada */}
                {settings?.loginBgUrl && settings?.loginBgType === 'image' && (
                    <div
                        className="absolute inset-0 opacity-15 grayscale brightness-75"
                        style={{ backgroundImage: `url(${settings.loginBgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    ></div>
                )}
            </div>

            {/* ── MARCA SUPERIOR ── */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="relative z-10 mb-8 flex flex-col items-center text-center"
            >
                <motion.div
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-[0_18px_40px_-10px_rgba(16,185,129,0.55)] ring-4 ring-emerald-500/15 mb-4"
                >
                    <Store size={30} className="text-white" strokeWidth={2.2} />
                </motion.div>
                <p className="text-[9px] font-black text-emerald-400 tracking-[0.55em] uppercase mb-1.5">Acesso Seguro</p>
                <h1 className="text-2xl font-black text-white tracking-tight uppercase leading-none">
                    {isAdmin ? 'Painel Administrativo' : isRecovery ? 'Recuperar Acesso' : (settings?.appName || 'Mercado Fácil')}
                </h1>
                <p className="text-[11px] font-medium text-slate-400 mt-2 tracking-wide">
                    {isAdmin
                        ? 'Autentique-se para gerenciar o sistema'
                        : isRecovery
                        ? 'Informe os dados para recuperar sua senha'
                        : 'Sistema de compras com praticidade e segurança'}
                </p>
            </motion.div>

            {/* ── CARD ── */}
            <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-[440px] relative z-10"
            >
                <div className="bg-white rounded-[1.75rem] shadow-[0_40px_100px_rgba(0,0,0,0.55)] overflow-hidden border border-white/60">

                    {/* Abas */}
                    <div className="px-6 pt-6 pb-4">
                        <AnimatePresence mode="wait">
                            {!isAdmin && !isRecovery && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex bg-slate-100/80 p-1.5 rounded-2xl"
                                >
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('login')}
                                        className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 cursor-pointer ${activeTab === 'login' ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Entrar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('register')}
                                        className={`flex-1 py-3 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 cursor-pointer ${activeTab === 'register' ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        Criar Conta
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="px-6 sm:px-8 pb-8">
                        <form onSubmit={handleSubmit} className="space-y-4">

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
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 text-center">Senha de Acesso</p>
                                        <div className="space-y-3">
                                            <PremiumInput icon={Lock} label="Senha (mín. 6 caracteres)" value={password} onChange={(e: any) => setPassword(e.target.value)} type="password" />
                                            <PremiumInput icon={CheckCircle} label="Confirmar Senha" value={registerConfirmPassword} onChange={(e: any) => setRegisterConfirmPassword(e.target.value)} type="password" />
                                        </div>
                                    </div>
                                    <div className="pt-4">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 text-center">Vínculo Prisional</p>
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
                                type="button"
                                onClick={isAdmin && showFirstAdminSetup ? handleFirstAdminSubmit : handleSubmit}
                                disabled={isLoading}
                                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.25em] transition-all active:scale-[0.98] flex items-center justify-center gap-3 relative overflow-hidden group bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white hover:shadow-[0_18px_40px_rgba(16,185,129,0.4)] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer`}
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
                                    onClick={() => setActiveTab('login')}
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
                </div>

                {/* Rodapé */}
                <div className="mt-6 text-center px-4">
                    <p className="text-[10px] text-slate-500 font-medium tracking-wider uppercase leading-relaxed">
                        © 2026 {settings?.appName || 'MERCADO FÁCIL'} · TODOS OS DIREITOS RESERVADOS<br />
                        Desenvolvido por {settings?.dev_name || settings?.developerName || 'EDEVALDO DE LIMA ALMEIDA'}{settings?.dev_email || settings?.developerEmail ? ` · ${settings?.dev_email || settings?.developerEmail}` : ''}{settings?.dev_phone || settings?.developerPhone ? ` · SUPORTE: ${settings?.dev_phone || settings?.developerPhone}` : ''}
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

// Campo de texto premium — design limpo e moderno com label visível
const PremiumInput = ({ icon: Icon, label, value, onChange, type = "text", action }: any) => (
    <div>
        <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-2 ml-1">{label}</label>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white shadow-sm">
            <Icon size={17} className="text-slate-400 shrink-0" />
            <input
                type={type}
                className="flex-1 py-3.5 bg-transparent border-none outline-none text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal"
                placeholder={label}
                value={value}
                onChange={onChange}
                required
            />
            {action}
        </div>
    </div>
);

// Campo select premium
const SelectInput = ({ label, value, onChange, children, required }: any) => (
    <div>
        <label className="block text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-2 ml-1">{label}</label>
        <div className="relative rounded-2xl border border-slate-200 bg-slate-50/70 transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:bg-white shadow-sm">
            <select
                className="w-full px-4 py-3.5 bg-transparent border-none outline-none text-sm font-semibold text-slate-900 appearance-none cursor-pointer uppercase tracking-widest"
                value={value}
                onChange={onChange}
                required={required}
            >
                {children}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
    </div>
);
