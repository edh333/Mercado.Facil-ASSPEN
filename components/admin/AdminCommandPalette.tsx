import React from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';

/** Uma ação da Central de Atalhos (botão de acesso rápido). */
export interface AcaoAtalho {
  id: string;
  /** Cabeçalho do grupo (ex.: "Produtos", "Relatórios", "Conexões"). */
  grupo: string;
  label: string;
  icon: React.ReactNode;
  /** Tecla exibida como dica (ex.: "F2"). Não é capturada aqui. */
  key?: string;
  nota?: string;
  run: () => void;
}

interface AdminCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  acoes: AcaoAtalho[];
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * CENTRAL DE ATALHOS (paleta de comandos).
 *
 * Reúne, num único lugar e com busca, botões de acesso rápido para TODAS as
 * áreas — funções, produtos, conexões, relatórios de vendas/produtos, ferramentas
 * e o que já tinha tecla F1–F12. Aberta por Ctrl+K ou pelo botão no cabeçalho,
 * complementa (não substitui) os atalhos de teclado já existentes.
 */
export const AdminCommandPalette: React.FC<AdminCommandPaletteProps> = ({ isOpen, onClose, acoes }) => {
  const [busca, setBusca] = React.useState('');

  React.useEffect(() => { if (isOpen) setBusca(''); }, [isOpen]);

  if (!isOpen) return null;

  const termo = normalizar(busca.trim());
  const filtradas = termo
    ? acoes.filter((a) => normalizar(`${a.grupo} ${a.label} ${a.nota || ''}`).includes(termo))
    : acoes;

  // Preserva a ordem de declaração dos grupos (Map mantém a ordem de inserção).
  const grupos = new Map<string, AcaoAtalho[]>();
  for (const a of filtradas) {
    if (!grupos.has(a.grupo)) grupos.set(a.grupo, []);
    grupos.get(a.grupo)!.push(a);
  }

  const executar = (a: AcaoAtalho) => { onClose(); a.run(); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const alvo = filtradas[0];
      if (alvo) executar(alvo);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Central de Atalhos"
      subtitle="Acesso rápido a funções, produtos, relatórios e conexões"
      icon={<Search size={20} />}
      size="lg"
    >
      <div className="p-6 space-y-4">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filtrar atalhos (vendas, produtos, relatórios, conexões...)"
            aria-label="Buscar atalho"
            className="w-full pl-12 pr-4 py-4 bg-slate-100 border-2 border-slate-200 focus:border-emerald-500 focus:bg-white rounded-2xl font-bold text-sm text-slate-800 outline-none transition-all"
          />
        </div>

        {filtradas.length === 0 && (
          <p className="text-center text-xs font-black text-slate-400 uppercase tracking-widest py-10">
            Nenhum atalho encontrado
          </p>
        )}

        <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-1">
          {Array.from(grupos.entries()).map(([grupo, itens]) => (
            <div key={grupo} className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{grupo}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {itens.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => executar(a)}
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 active:scale-[0.99] transition-all text-left"
                  >
                    <span className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">{a.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[11px] font-black uppercase tracking-tight text-slate-700 truncate">{a.label}</span>
                      {a.nota && <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{a.nota}</span>}
                    </span>
                    {a.key && <kbd className="shrink-0 px-2 py-1 rounded-lg bg-brand text-white text-[10px] font-black font-mono">{a.key}</kbd>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="flex items-center justify-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest pt-1">
          <CornerDownLeft size={12} /> Enter abre o 1º resultado · Esc fecha · Ctrl+K reabre
        </p>
      </div>
    </ModalShell>
  );
};
