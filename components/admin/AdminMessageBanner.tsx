import React, { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';

/**
 * Aviso do administrador principal para os demais administradores.
 *
 * Regras de exibição:
 *  - a mensagem vive em `settings/general.adminMessage` (só o principal grava);
 *  - aparece por 10s ao ENTRAR no sistema (uma vez por sessão do app) e some;
 *  - permanece ativa enquanto o principal não a remover (adminMessage === '').
 *
 * Como o app admin é uma SPA, "entrar no sistema" = montar o painel. A chave de
 * sessão inclui `adminMessageUpdatedAt/By`, então publicar uma NOVA mensagem
 * reexibe o aviso mesmo dentro da mesma sessão, sem repetir a antiga.
 */
export const AdminMessageBanner: React.FC<{ message?: string; updatedAt?: string }> = ({ message, updatedAt }) => {
  const texto = String(message || '').trim();
  const chaveSessao = `mf-admin-msg-vista-${updatedAt || texto.slice(0, 32)}`;

  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!texto) { setVisivel(false); return; }
    // Já exibida nesta sessão (mesma mensagem)? Não repete.
    let jaVista = false;
    try { jaVista = sessionStorage.getItem(chaveSessao) === 'true'; } catch { jaVista = false; }
    setVisivel(!jaVista);
    if (jaVista) return;

    try { sessionStorage.setItem(chaveSessao, 'true'); } catch { /* storage indisponível */ }
    const timer = setTimeout(() => setVisivel(false), 10_000);
    return () => clearTimeout(timer);
  }, [texto, chaveSessao]);

  if (!visivel || !texto) return null;

  return (
    <div className="sticky top-0 z-[60] w-full bg-sky-600 border-b-2 border-sky-700 px-3 py-2.5 flex items-start gap-3 animate-slide-down shadow-lg">
      <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0 mt-0.5">
        <Megaphone size={16} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-sky-100 uppercase tracking-widest">Aviso do administrador</p>
        <p className="text-sm text-white font-medium leading-snug whitespace-pre-wrap break-words">{texto}</p>
      </div>
      <button
        onClick={() => setVisivel(false)}
        className="p-1.5 rounded-lg text-sky-100/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        title="Fechar aviso"
        aria-label="Fechar aviso do administrador"
      >
        <X size={16} />
      </button>
    </div>
  );
};
