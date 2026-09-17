import React, { useMemo } from 'react';
import { Trash2, Smartphone, Monitor, CloudOff } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';

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
    <ModalShell
      open={isOpen}
      onClose={onClose}
      title="Desinstalar Aplicativo"
      tone="info"
      icon={<Trash2 size={20} />}
    >
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
          <div className="p-2 rounded-xl bg-red-500/10 text-red-500 shrink-0">{info.icon}</div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">{info.title}</p>
            <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
              Siga os passos abaixo para remover o aplicativo deste aparelho.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {info.lines.map((line, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white">
              <span className="w-6 h-6 shrink-0 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-[10px]">{i + 1}</span>
              <p className="text-[11px] font-bold text-slate-700 leading-relaxed">{line}</p>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <CloudOff size={18} className="text-emerald-600 shrink-0 mt-0.5"/>
          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-relaxed">
            Desinstalar não apaga nenhum dado. Conta, pedidos e saldo continuam seguros na nuvem.
          </p>
        </div>
      </div>
    </ModalShell>
  );
};
