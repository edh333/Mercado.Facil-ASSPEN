import React from 'react';
import { useApp } from '../context/StoreContext';
import { Store, ShieldCheck, LogOut, MonitorX } from 'lucide-react';
import { OnlineStatusIndicator } from './OnlineStatusIndicator';

/**
 * Tela exibida quando o usuário logado NÃO pertence ao app aberto.
 * Cada aplicação desktop/PWA tem público exclusivo:
 *  - App Usuário  → somente usuários comuns (familiares);
 *  - App Admin    → somente administradores.
 * Um administrador que abre o App Usuário (ou um usuário que abre o App Admin)
 * é direcionado aqui, com orientação clara e botão para sair da conta.
 */
export const WrongAppScreen: React.FC<{ appAberto: 'usuario' | 'admin' }> = ({ appAberto }) => {
  const { logout, currentUser } = useApp();
  const ehAdmin = appAberto === 'admin';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }}></div>
      <OnlineStatusIndicator />

      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 sm:p-10 text-center shadow-2xl">
        <div className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl ${ehAdmin ? 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-indigo-500/30' : 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30'}`}>
          {ehAdmin ? <ShieldCheck size={30} /> : <Store size={30} />}
        </div>

        <p className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
          App {ehAdmin ? 'Admin' : 'Usuário'}
        </p>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-white">
          Este app é destinado a {ehAdmin ? 'administradores' : 'usuários'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {ehAdmin
            ? 'Você está no painel de gestão, que só permite entrada de contas de administrador. Use o App Usuário para compras, ou entre com uma conta administrativa.'
            : 'Você está no aplicativo de compras dos usuários, que só permite entrada de contas de usuário. Baixe o App Admin e entre com sua conta de administrador.'}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white/[0.04] border border-white/10 px-4 py-3">
          <MonitorX size={16} className="text-slate-500 shrink-0" />
          <p className="text-[11px] font-bold text-slate-400 leading-snug">
            Conta atual: <span className="text-slate-200">{currentUser?.name || '—'}</span>
          </p>
        </div>

        <button
          onClick={logout}
          className="mt-7 w-full py-3.5 rounded-2xl bg-white text-slate-900 font-bold text-sm hover:bg-emerald-50 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg"
        >
          <LogOut size={18} /> Sair e trocar de conta
        </button>

        {!ehAdmin && (
          <p className="mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
            O App Admin não fica disponível nesta tela — é baixado por administradores logados.
          </p>
        )}
      </div>
    </div>
  );
};