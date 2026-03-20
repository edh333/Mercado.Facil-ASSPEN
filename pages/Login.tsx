import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/StoreContext';
import { Lock, User, Phone, CheckCircle, Upload, Eye, EyeOff, Shield, ArrowLeft, Loader2, Settings, UserCheck, Briefcase, AlertTriangle, AlertCircle, XCircle, KeyRound, Download } from 'lucide-react';
import { THEME_COLORS } from '../constants';
import { ThemeOption } from '../types';
import { validateCPF } from '../utils';
import { User as UserType } from '../types';

export const Login: React.FC = () => {
    const { loginAdmin, loginFamiliar, registerUser, resetUserPassword, showNotification, settings } = useApp();
    const [activeTab, setActiveTab] = useState<'login' | 'register' | 'admin' | 'recovery'>('login');

    // Controle granular de loading
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    const [showPassword, setShowPassword] = useState(false);

    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [registerConfirmPassword, setRegisterConfirmPassword] = useState(''); // Estado para confirmar senha no cadastro

    // States para Recuperação de Senha
    const [recoveryStep, setRecoveryStep] = useState<1 | 2>(1);
    const [recoveryUser, setRecoveryUser] = useState<UserType | null>(null);
    const [revealedPassword, setRevealedPassword] = useState('');
    const [showRevealedPassword, setShowRevealedPassword] = useState(false);

    const [recoveryPrisonerCpf, setRecoveryPrisonerCpf] = useState('');
    const [recoveryUserCpf, setRecoveryUserCpf] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');

    // Estado para o termo de responsabilidade legal
    const [legalTermAccepted, setLegalTermAccepted] = useState(false);

    // Estados para feedback visual no formulário
    const [formError, setFormError] = useState<string | null>(null);
    const [formSuccess, setFormSuccess] = useState<string | null>(null);

    // unitId padrão '1' (CDP Peixoto)
    const [regData, setRegData] = useState({
        name: '', phone: '', prisonerName: '', prisonerCpf: '', kinship: '', kinshipOther: '', unitId: '1'
    });
    const [fileObject, setFileObject] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Obtém as cores do tema
    const theme = THEME_COLORS[settings.theme || ThemeOption.POLICE_MT];

    const isAdmin = activeTab === 'admin';
    const isRegister = activeTab === 'register';
    const isRecovery = activeTab === 'recovery';

    useEffect(() => {
        // Garantir limpeza total ao alternar abas ou quando o componente for montado
        setCpf('');
        setPassword('');
        setRegisterConfirmPassword('');
        setAdminEmail('');
        setRegData({ name: '', phone: '', prisonerName: '', prisonerCpf: '', kinship: '', kinshipOther: '', unitId: '1' });
        setFileObject(null);
        setLegalTermAccepted(false);
        setFormError(null);
        setFormSuccess(null);

        // Reset recovery fields
        setRecoveryPrisonerCpf('');
        setRecoveryUserCpf('');
        setNewPassword('');
        setConfirmNewPassword('');
        setLoadingMessage('');
    }, [activeTab]);

    // Efeito Adicional: Garantir que ao montar (após deslogar), a aba padrão seja 'login' (Área da Família)
    useEffect(() => {
        setActiveTab('login');
        setCpf('');
        setPassword('');
        setAdminEmail('');
    }, []);

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
                // 1. Limpeza dos dados para validação
                const cleanUserCpf = cpf.replace(/\D/g, '');
                const cleanPrisonerCpf = regData.prisonerCpf.replace(/\D/g, '');

                // 2. Validação Estrita de CPF
                if (!validateCPF(cleanUserCpf)) {
                    throw new Error("O CPF informado para o usuário é INVÁLIDO. Verifique se os números estão corretos.");
                }
                if (!validateCPF(cleanPrisonerCpf)) {
                    throw new Error("O CPF informado para o interno é INVÁLIDO (Ex: 000.000.000-00 não é aceito).");
                }

                // NEW: Inmate Pre-registration Check
                const isPreRegistered = preRegisteredInmates.some(inmate => inmate.cpf.replace(/\D/g, '') === cleanPrisonerCpf);
                if (!isPreRegistered && preRegisteredInmates.length > 0) {
                    throw new Error("Este interno não consta em nossa lista de pré-cadastro. Por favor, verifique o CPF ou entre em contato com a assistência.");
                }

                // 3. Validação dos Campos e Documento
                if (!fileObject || !regData.unitId) {
                    throw new Error("Preencha todos os campos e anexe a foto do documento.");
                }

                // 4. Validação do Termo Legal
                if (!legalTermAccepted) {
                    throw new Error("Você precisa marcar a caixa confirmando que as informações e documentos são verdadeiros.");
                }

                // 5. Validação de Senha no Cadastro (Qualquer senha aceita)
                if (!password) {
                    throw new Error("Defina uma senha.");
                }
                if (password !== registerConfirmPassword) {
                    throw new Error("As senhas digitadas não coincidem.");
                }

                // UX: Mensagem de processamento de imagem
                setLoadingMessage('Otimizando imagem...');

                // Pequeno delay para a UI atualizar antes do processo pesado
                await new Promise(r => setTimeout(r, 100));

                setLoadingMessage('Enviando dados...');

                await registerUser({
                    id: '',
                    cpf: cleanUserCpf,
                    name: regData.name.toUpperCase(),
                    password: password, // Usa a senha escolhida pelo usuário
                    phone: regData.phone,
                    role: 'FAMILIAR',
                    approved: false,
                    unitId: regData.unitId,
                    prisonerName: regData.prisonerName.toUpperCase(),
                    prisonerCpf: cleanPrisonerCpf,
                    kinship: regData.kinship === 'Outros' ? regData.kinshipOther : regData.kinship
                } as any, fileObject);

                // Sucesso Visual Fixo
                setLoadingMessage('Concluído!');
                setFormSuccess("Cadastro enviado para análise! Aguarde a liberação do administrador.");
                showNotification('Cadastro realizado com sucesso!', 'success');

                // Aguarda um pouco para ler a mensagem antes de mudar a aba
                setTimeout(() => {
                    setActiveTab('login');
                    setFormSuccess(null);
                }, 3000);

            } else if (isRecovery) {
                if (recoveryStep === 1) {
                    setLoadingMessage('Validando identidade...');
                    const user = await (useApp as any)().validateRecovery(recoveryUserCpf, recoveryPrisonerCpf);
                    setRecoveryUser(user);
                    setRevealedPassword(user.password || '');
                    setRecoveryStep(2);
                    showNotification("Dados validados com sucesso!", "success");
                } else {
                    if (newPassword) {
                        setLoadingMessage('Atualizando senha...');
                        if (newPassword.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
                        if (newPassword !== confirmNewPassword) throw new Error("As senhas não coincidem.");
                        await resetUserPassword(recoveryUserCpf, recoveryPrisonerCpf, newPassword);
                    }

                    setFormSuccess(newPassword ? "Senha alterada com sucesso!" : "Acesso liberado.");
                    setTimeout(() => {
                        setActiveTab('login');
                        setFormSuccess(null);
                        setRecoveryStep(1);
                        setRecoveryUser(null);
                    }, 2500);
                }
            } else {
                setLoadingMessage('Entrando...');
                await loginFamiliar(cpf, password);
            }
        } catch (error: any) {
            // Erro Visual Fixo
            setFormError(error.message);
            showNotification(error.message, "error");
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    const bgStyle = settings?.loginBgType === 'image' && settings?.loginBgUrl
        ? { backgroundImage: `url(${settings.loginBgUrl})`, backgroundSize: 'cover', backgroundBackgroundAttachment: 'fixed', backgroundPosition: 'center' }
        : settings?.loginBgType === 'color'
            ? { backgroundColor: settings.backgroundColor || '#cbd5e1' }
            : { backgroundColor: '#cbd5e1' };

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-4 font-sans text-slate-900 relative transition-all duration-700"
            style={bgStyle}
        >

            {/* Container Principal Centralizado */}
            <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden relative">

                {/* Cabeçalho do Cartão */}
                <div className={`${theme.primary} p-8 pb-10 text-center relative`}>
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] bg-[length:20px_20px]"></div>

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="bg-white/10 p-3 rounded-2xl mb-3 backdrop-blur-sm shadow-inner ring-1 ring-white/20">
                            <Shield size={32} className="text-white" />
                        </div>
                        <h2 className="text-white text-xs font-bold tracking-[0.2em] uppercase opacity-90 mb-1 drop-shadow-md">
                            PORTAL DA FAMÍLIA
                        </h2>
                        <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md">
                            {isAdmin ? 'Acesso Administrativo' : isRecovery ? 'Nova Senha' : (settings?.systemName || 'MERCADO FÁCIL')}
                        </h1>
                    </div>
                </div>

                {/* Corpo do Formulário */}
                <div className="px-8 py-6 -mt-6 bg-white rounded-t-3xl relative z-20">

                    {!isAdmin && !isRecovery && (
                        <div className="flex border-b border-slate-300 mb-6">
                            <button
                                onClick={() => setActiveTab('login')}
                                className={`flex-1 pb-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'login' ? `${theme.text.replace('text-white', 'text-slate-900')} border-slate-900` : 'text-slate-600 border-transparent hover:text-slate-800'}`}
                            >
                                Entrar
                            </button>
                            <button
                                onClick={() => setActiveTab('register')}
                                className={`flex-1 pb-3 text-sm font-bold transition-colors border-b-2 ${activeTab === 'register' ? `${theme.text.replace('text-white', 'text-slate-900')} border-slate-900` : 'text-slate-600 border-transparent hover:text-slate-800'}`}
                            >
                                Criar Conta
                            </button>
                        </div>
                    )}

                    {isRecovery && (
                        <div className="text-center mb-6">
                            <div className="bg-blue-50 p-4 rounded-xl mb-4 border border-blue-100">
                                <p className="text-slate-800 text-xs font-bold mb-1">Redefinição de Segurança</p>
                                <p className="text-slate-600 text-[10px]">Informe seus dados e o CPF do interno vinculado para validar sua identidade.</p>
                            </div>
                        </div>
                    )}

                    {isAdmin && (
                        <div className="text-center mb-6">
                            <p className="text-slate-700 text-sm font-bold">Informe o e-mail e senha para gerenciar o sistema.</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">

                        {isRegister && (
                            <div className="space-y-3 animate-fadeIn">
                                <SimpleInput icon={User} label="Nome Completo" value={regData.name} onChange={(e: any) => setRegData({ ...regData, name: e.target.value })} />
                                <div className="grid grid-cols-2 gap-3">
                                    <SimpleInput icon={Phone} label="Telefone" value={regData.phone} onChange={(e: any) => setRegData({ ...regData, phone: e.target.value })} />
                                    <SimpleInput icon={UserCheck} label="Seu CPF" value={cpf} onChange={(e: any) => setCpf(e.target.value)} />
                                </div>

                                <div className="pt-2">
                                    <p className="text-xs font-bold text-slate-700 uppercase mb-2">Dados do Interno</p>
                                    <div className="space-y-3">
                                        <select className="w-full p-3 bg-slate-50 border border-slate-400 rounded-lg text-sm text-slate-900 font-bold outline-none focus:border-slate-600" value={regData.kinship} onChange={e => setRegData({ ...regData, kinship: e.target.value })} required>
                                            <option value="" disabled>Parentesco com o Interno</option>
                                            <option value="Mãe">Mãe</option>
                                            <option value="Pai">Pai</option>
                                            <option value="Esposa">Esposa</option>
                                            <option value="Outros">Outros</option>
                                        </select>
                                        <SimpleInput icon={Briefcase} label="Nome do Preso" value={regData.prisonerName} onChange={(e: any) => setRegData({ ...regData, prisonerName: e.target.value })} />
                                        <SimpleInput icon={UserCheck} label="CPF do Preso" value={regData.prisonerCpf} onChange={(e: any) => setRegData({ ...regData, prisonerCpf: e.target.value })} />
                                    </div>
                                </div>

                                {/* Upload de Documento */}
                                <div onClick={() => fileInputRef.current?.click()} className={`cursor-pointer border-2 border-dashed p-4 rounded-lg flex items-center justify-center gap-2 transition-colors ${fileObject ? 'border-green-600 bg-green-100' : 'border-slate-400 hover:border-slate-600 bg-slate-50'}`}>
                                    {fileObject ? <CheckCircle size={20} className="text-green-700" /> : <Upload size={20} className="text-slate-600" />}
                                    <span className={`text-xs font-bold ${fileObject ? 'text-green-800' : 'text-slate-700'}`}>{fileObject ? "Documento Anexado" : "Anexar Foto RG/CNH"}</span>
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={e => e.target.files && setFileObject(e.target.files[0])} />
                                </div>

                                {/* ALERTA LEGAL E CHECKBOX */}
                                <div className={`border rounded-lg p-3 transition-colors ${!legalTermAccepted && formError ? 'bg-red-50 border-red-300 animate-pulse' : 'bg-orange-50 border-orange-200'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`${!legalTermAccepted && formError ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'} p-1.5 rounded-full mt-0.5`}>
                                            <AlertTriangle size={16} />
                                        </div>
                                        <div>
                                            <p className={`text-[10px] font-bold mb-2 uppercase tracking-wide ${!legalTermAccepted && formError ? 'text-red-800' : 'text-orange-800'}`}>
                                                Aviso Legal Importante
                                            </p>
                                            <label className="flex items-start gap-2 cursor-pointer group">
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        className={`peer h-4 w-4 cursor-pointer appearance-none rounded border bg-white focus:ring-2 ${!legalTermAccepted && formError ? 'border-red-400 focus:ring-red-200' : 'border-orange-400 checked:border-orange-600 checked:bg-orange-600 focus:ring-orange-200'}`}
                                                        checked={legalTermAccepted}
                                                        onChange={e => setLegalTermAccepted(e.target.checked)}
                                                    />
                                                    <CheckCircle className={`pointer-events-none absolute left-0 top-0 h-4 w-4 opacity-0 peer-checked:opacity-100 ${!legalTermAccepted && formError ? 'text-red-600' : 'text-white'}`} size={12} />
                                                </div>
                                                <span className={`text-[10px] leading-tight font-medium select-none ${!legalTermAccepted && formError ? 'text-red-900' : 'text-orange-900'}`}>
                                                    Declaro estar ciente de que enviar <strong>documento falso</strong> é crime (Art. 299 e 304 do CP) e estou sujeito às penalidades da lei vigente.
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Campos de Recuperação */}
                        {isRecovery && (
                            <div className="space-y-4 animate-fadeIn">
                                {recoveryStep === 1 ? (
                                    <>
                                        <SimpleInput icon={UserCheck} label="Seu CPF (Familiar)" value={recoveryUserCpf} onChange={(e: any) => setRecoveryUserCpf(e.target.value)} />
                                        <SimpleInput icon={Briefcase} label="CPF do Preso Vinculado" value={recoveryPrisonerCpf} onChange={(e: any) => setRecoveryPrisonerCpf(e.target.value)} />
                                    </>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Sua Senha Atual</p>
                                            <div className="relative">
                                                <input
                                                    readOnly
                                                    type={showRevealedPassword ? "text" : "password"}
                                                    value={revealedPassword}
                                                    className="w-full bg-white border border-slate-300 rounded-lg py-2 px-3 text-sm font-mono font-bold text-slate-900 pr-10 outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowRevealedPassword(!showRevealedPassword)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                                >
                                                    {showRevealedPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-slate-500 mt-2 italic">Se deseja manter esta senha, basta clicar em "Manter e Voltar".</p>
                                        </div>

                                        <div className="pt-2">
                                            <p className="text-xs font-bold text-slate-700 uppercase mb-3 flex items-center gap-2">
                                                <KeyRound size={14} className="text-slate-500" /> Definir Nova Senha (Opcional)
                                            </p>
                                            <div className="space-y-3">
                                                <SimpleInput icon={Lock} label="Nova Senha" value={newPassword} onChange={(e: any) => setNewPassword(e.target.value)} type="password" />
                                                <SimpleInput icon={CheckCircle} label="Confirmar Nova Senha" value={confirmNewPassword} onChange={(e: any) => setConfirmNewPassword(e.target.value)} type="password" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Campos de Login */}
                        {!isRegister && !isAdmin && !isRecovery && (
                            <div className="animate-fadeIn">
                                <SimpleInput icon={UserCheck} label="Informe seu CPF" value={cpf} onChange={(e: any) => setCpf(e.target.value)} />
                            </div>
                        )}

                        {/* Campo de Email Admin */}
                        {isAdmin && (
                            <div className="animate-fadeIn mb-3">
                                <SimpleInput icon={User} label="E-mail do Administrador" value={adminEmail} onChange={(e: any) => setAdminEmail(e.target.value)} type="email" />
                            </div>
                        )}

                        {/* MENSAGEM DE ERRO FIXA NO FORMULÁRIO */}
                        {formError && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r animate-fadeIn flex items-start gap-3">
                                <XCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                                <div>
                                    <p className="text-xs font-bold text-red-800 uppercase mb-1">Erro</p>
                                    <p className="text-xs text-red-700">{formError}</p>
                                </div>
                            </div>
                        )}

                        {/* MENSAGEM DE SUCESSO FIXA NO FORMULÁRIO */}
                        {formSuccess && (
                            <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded-r animate-fadeIn flex items-start gap-3">
                                <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5" size={18} />
                                <div>
                                    <p className="text-xs font-bold text-green-800 uppercase mb-1">Sucesso!</p>
                                    <p className="text-xs text-green-700">{formSuccess}</p>
                                </div>
                            </div>
                        )}

                        {/* Campo de Senha (Login, Admin e Cadastro) */}
                        {(!isRecovery) && (
                            <div className="relative group">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full pl-10 pr-10 py-3.5 bg-slate-50 border border-slate-400 rounded-lg focus:bg-white focus:border-slate-600 focus:ring-2 focus:ring-slate-300 outline-none transition-all text-sm font-bold text-slate-900 placeholder:text-slate-600"
                                    placeholder={isAdmin ? "Senha do Administrador" : (isRegister ? "Crie sua Senha" : "Sua Senha")}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required={!isAdmin}
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        )}

                        {/* Campo Confirmar Senha (Apenas Cadastro) */}
                        {isRegister && (
                            <div className="relative group animate-fadeIn mt-2">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-400 rounded-lg focus:bg-white focus:border-slate-600 focus:ring-2 focus:ring-slate-300 outline-none transition-all text-sm font-bold text-slate-900 placeholder:text-slate-600"
                                    placeholder="Confirme sua Senha"
                                    value={registerConfirmPassword}
                                    onChange={e => setRegisterConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>
                        )}

                        {/* Botão Principal */}
                        <button
                            disabled={isLoading}
                            className={`w-full py-4 rounded-xl font-bold text-sm text-white uppercase tracking-wide shadow-lg hover:shadow-xl transform active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${isAdmin ? 'bg-slate-900 hover:bg-black' : `${theme.primary} hover:opacity-90`}`}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    <span>{loadingMessage || 'Aguarde...'}</span>
                                </>
                            ) : (
                                isAdmin ? 'Acessar Painel' : (isRegister ? 'Finalizar Cadastro' : (isRecovery ? (recoveryStep === 1 ? 'Verificar Identidade' : (newPassword ? 'Salvar Nova Senha' : 'Manter e Voltar')) : 'Entrar'))
                            )}
                        </button>

                        {/* Link Esqueci Minha Senha */}
                        {!isRecovery && !isRegister && !isAdmin && (
                            <div className="text-center pt-2">
                                <button type="button" onClick={() => setActiveTab('recovery')} className="text-xs font-bold text-slate-500 hover:text-slate-800 hover:underline">
                                    Esqueceu a senha?
                                </button>
                            </div>
                        )}

                    </form>

                    {/* Área de Alternância (Admin / Voltar) */}
                    <div className="mt-8 pt-4 border-t border-slate-300 text-center">
                        {(isAdmin || isRecovery) ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTab('login');
                                    setRecoveryStep(1);
                                    setRecoveryUser(null);
                                }}
                                className="text-xs font-bold text-slate-700 hover:text-black flex items-center justify-center gap-2 mx-auto transition-colors"
                            >
                                <ArrowLeft size={16} /> Voltar para Área da Família
                            </button>
                        ) : (
                            !isRegister && (
                                <button type="button" onClick={() => setActiveTab('admin')} className="text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors flex items-center justify-center gap-2 mx-auto">
                                    <Settings size={16} /> Área Administrativa
                                </button>
                            )
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-8 text-center px-4">
                <p className="text-xs text-slate-700 font-bold">
                    &copy; {new Date().getFullYear()} Portal da Família
                </p>
                <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wide font-semibold">TODOS OS DIREITOS RESERVADOS.</p>
                <p className="text-[10px] text-slate-500 mt-2 font-mono">
                    Dev: Edevaldo de Lima Almeida
                </p>
            </div>
        </div>
    );
};

// Input Simplificado
const SimpleInput = ({ icon: Icon, label, value, onChange, type = "text" }: any) => (
    <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
        <input
            type={type}
            className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-400 rounded-lg focus:bg-white focus:border-slate-600 focus:ring-2 focus:ring-slate-300 outline-none transition-all text-sm font-bold text-slate-900 placeholder:text-slate-600"
            placeholder={label}
            value={value}
            onChange={onChange}
            required
        />
    </div>
);