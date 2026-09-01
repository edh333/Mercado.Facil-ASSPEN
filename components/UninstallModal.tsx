import React, { useMemo } from 'react';
import { X, Trash2, Smartphone, Monitor, CloudOff } from 'lucide-react';

interface UninstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UninstallModal: React.FC<UninstallModalProps> = ({ isOpen, onClose }) => {
  const platform = useMemo(() => {
    const ua = navigator.userAgent;
    const isElectron = !!(window as any).electronAPI;
    if (isElectron) return 'desktop_app';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'browser';
  }, []);

  if (!isOpen) return null;

  const steps: Record<string, { icon: React.ReactNode; title: string; lines: string[] }> = {
    desktop_app: {
      icon: <Monitor size={20} />,
      title: 'App de Computador (Instalado)',
      lines: [
        'Abra o Painel de Controle do Windows → "Programas" → "Programas e Recursos".',
        'Localize "Mercado Fácil PDV" na lista.',
        'Clique em "Desinstalar" e confirme a remoção.',
        'Os dados continuam seguros na nuvem — o sistema web continua funcionando em qualquer navegador.'
      ]
    },
    android: {
      icon: <Smartphone size={20} />,
      title: 'Celular Android',
      lines: [
        'Opção rápida: toque e segure o ícone do Mercado Fácil na tela inicial → toque em "Desinstalar" (ou arraste para "Remover").',
        'No navegador Chrome: menu ⋮ (três pontos) → "Desinstalar Mercado Fácil" → confirmar.',
        'Isso apenas remove o atalho/app do aparelho — sua conta e saldo continuam seguros na nuvem.'
      ]
    },
    ios: {
      icon: <Smartphone size={20} />,
      title: 'iPhone / iPad',
      lines: [
        'Toque e segure o ícone do Mercado Fácil na tela inicial.',
        'Toque em "Remover App" → "Remover" para apagar o aplicativo.',
        'Isso apenas remove o atalho/app do aparelho — sua conta e saldo continuam seguros na nuvem.'
      ]
    },
    browser: {
      icon: <Monitor size={20} />,
      title: 'Navegador (Computador)',
      lines: [
        'Se instalou o atalho no navegador: menu ⋮ (três pontos) do Chrome/Edge → "Desinstalar Mercado Fácil" → confirmar.',
        'Se abriu pelo navegador sem instalar, basta fechar a aba — não há nada para desinstalar.',
        'Se baixou o instalador do Windows (setup.exe): desinstale em Painel de Controle → Programas e Recursos.'
      ]
    }
  };

  const info = steps[platform];

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 animate-fadeIn" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="bg-[var(--bg-card)] w-full max-w-md rounded-lg shadow-2xl flex flex-col max-h-[90vh] border border-[var(--border-color)] animate-slideUp" style={{ overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="w-full flex items-center justify-between shrink-0 px-5 py-4" style={{ backgroundColor: '#0f172a', color: '#ffffff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
          <div className="flex items-center gap-3">
            <Trash2 size={20} className="text-red-400"/>
            <span className="font-black text-sm uppercase tracking-tight text-white">Desinstalar Aplicativo</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg transition-all active:scale-90" style={{ color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.15)' }} title="Fechar">
            <X size={22}/>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-500 shrink-0">{info.icon}</div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">{info.title}</p>
              <p className="text-[11px] font-bold text-[var(--text-main)] leading-relaxed">
                Siga os passos abaixo para remover o aplicativo deste aparelho.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {info.lines.map((line, i) => (
              <div key={i} className="flex items-start gap-3 p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-main)]/30">
                <span className="w-6 h-6 shrink-0 rounded-lg bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center font-black text-[10px]">{i + 1}</span>
                <p className="text-[11px] font-bold text-[var(--text-main)] leading-relaxed">{line}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <CloudOff size={18} className="text-emerald-500 shrink-0 mt-0.5"/>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-relaxed">
              Desinstalar não apaga nenhum dado. Conta, pedidos e saldo continuam seguros na nuvem.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
