import React, { useState, useCallback, useEffect } from 'react';
import { Download, Monitor, Smartphone, ShieldCheck, UserRound, Loader2, Package, AlertCircle, CheckCircle2, Globe } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useApp } from '../context/StoreContext';
import { usePWAInstall } from './PWAInstallProvider';
import { ModalShell } from './ui/ModalShell';

interface AppInfo {
  chave: string;
  nome: string;
  descricao: string;
  disponivel: boolean;
  url: string;
  motivo?: string;
}

const BAIAO_MENSAGEM = (nome: string) =>
  `O instalador "${nome}" está sendo baixado. Após concluir, execute o arquivo para instalar o app no computador.`;

/** Botão discreto que abre o modal de download do app (setup.exe / PWA). */
export const AppDownloadButton: React.FC<{
  variant?: 'icon' | 'full';
  label?: string;
  className?: string;
}> = ({ variant = 'icon', label, className = '' }) => {
  const [open, setOpen] = useState(false);

  if (variant === 'full') {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-slate-900/20 hover:brightness-125 active:scale-95 transition-all whitespace-nowrap ${className}`}
        >
          <Download size={16} />
          {label || 'Baixar App'}
        </button>
        {open && <AppDownloadModal onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Baixar App (setup.exe)"
        className={`w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-tr from-slate-800 to-slate-950 text-white rounded-2xl flex items-center justify-center hover:brightness-125 active:scale-90 transition-all shadow-lg shadow-slate-900/30 ${className}`}
      >
        <Download size={18} />
      </button>
      {open && <AppDownloadModal onClose={() => setOpen(false)} />}
    </>
  );
};

/** Modal de download — mostra as versões conforme o papel logado. */
export const AppDownloadModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser } = useApp();
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [apps, setApps] = useState<AppInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState('');

  const ehAdmin = currentUser?.role === 'ADMIN';
  const logado = !!currentUser;

  const carregar = useCallback(async () => {
    if (apps || !logado) return;
    setLoading(true);
    setErro('');
    try {
      const fn = httpsCallable(getFunctions(), 'obterLinkDownloadApp');
      const res = await fn({});
      const data = res.data as any;
      if (data?.ok) {
        setApps(data.apps || []);
      } else {
        setErro('Não foi possível carregar as versões disponíveis.');
      }
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar as versões do app.');
    } finally {
      setLoading(false);
    }
  }, [apps, logado]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const baixar = (app: AppInfo) => {
    if (!app.url) return;
    setBaixando(app.chave);
    window.open(app.url, '_blank', 'noopener');
    setTimeout(() => setBaixando(''), 2000);
  };

  const CardApp = ({ app, admin }: { app: AppInfo; admin?: boolean }) => (
    <div className={`relative overflow-hidden rounded-2xl border-2 p-5 transition-all ${app.disponivel ? 'border-slate-200 bg-white hover:border-emerald-400 hover:shadow-xl' : 'border-dashed border-slate-300 bg-slate-50'}`}>
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-20 ${admin ? 'bg-indigo-500' : 'bg-emerald-500'}`}></div>
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-lg ${admin ? 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/30' : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30'}`}>
          {admin ? <ShieldCheck size={26} /> : <UserRound size={26} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-black text-sm text-slate-900 uppercase tracking-tight">{app.nome}</h4>
            {admin && (
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-wider">Somente Admin</span>
            )}
          </div>
          <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">{app.descricao}</p>
          {app.disponivel ? (
            <button
              onClick={() => baixar(app)}
              disabled={baixando === app.chave}
              className="mt-4 w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all disabled:opacity-60"
            >
              {baixando === app.chave ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Baixar Instalador (Setup.exe)
            </button>
          ) : (
            <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[9px] font-black text-amber-700 uppercase tracking-wide leading-relaxed">
                Aguardando publicação da versão desktop. O administrador deve gerar e publicar o instalador.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Baixar App"
      subtitle="Instale o Mercado Fácil no seu computador ou celular"
      icon={<Package size={22} />}
      size="md"
      bodyClassName="p-6 space-y-5"
    >
      {/* Versão PWA — celular e navegador */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-blue-400/20 rounded-full blur-2xl"></div>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Smartphone size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-black text-sm text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <Globe size={14} className="text-blue-600" /> Versão Web (Celular / Navegador)
            </h4>
            <p className="text-[10px] font-bold text-slate-600 mt-1 leading-relaxed">
              Funciona em qualquer aparelho sem instalação. Ideal para uso diário no celular — instale como um app na tela inicial.
            </p>
            {isInstalled ? (
              <div className="mt-4 flex items-center gap-2 bg-emerald-100 border border-emerald-300 rounded-xl px-3 py-2.5 text-emerald-700">
                <CheckCircle2 size={15} /> <span className="text-[10px] font-black uppercase tracking-wide">App já instalado neste aparelho</span>
              </div>
            ) : (
              <button
                onClick={() => install(ehAdmin ? 'admin' : 'user')}
                className="mt-4 w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-blue-500/25"
              >
                <Download size={15} /> {isInstallable ? 'Instalar no Celular / Navegador' : 'Ver instruções de instalação'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Versão Desktop */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200"></div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-full text-[9px] font-black uppercase tracking-widest">
          <Monitor size={13} /> Versão Desktop (Windows)
        </div>
        <div className="flex-1 h-px bg-slate-200"></div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 size={28} className="animate-spin text-emerald-500" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando versões disponíveis...</p>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <p className="text-[10px] font-black uppercase tracking-wide leading-relaxed">{erro}</p>
        </div>
      )}

      {!logado && !loading && !erro && (
        <div className="flex items-start gap-2 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-slate-600">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <p className="text-[10px] font-black uppercase tracking-wide leading-relaxed">
            Entre no sistema para baixar o instalador para Windows. A versão da internet (acima) funciona sem instalação.
          </p>
        </div>
      )}

      {logado && !loading && apps && apps.length > 0 && (
        <div className="space-y-4">
          {apps.map(app => (
            <CardApp key={app.chave} app={app} admin={app.chave === 'admin'} />
          ))}
        </div>
      )}

      {logado && !loading && apps && apps.length === 0 && (
        <div className="flex items-start gap-2 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-slate-600">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <p className="text-[10px] font-black uppercase tracking-wide leading-relaxed">
            Nenhuma versão desktop publicada ainda. Use a versão Web acima ou fale com o administrador.
          </p>
        </div>
      )}

      <p className="text-[9px] text-slate-400 font-bold text-center uppercase tracking-widest">
        Baixe e execute o arquivo no computador • Você sempre recebe a versão mais recente publicada
      </p>
    </ModalShell>
  );
};
