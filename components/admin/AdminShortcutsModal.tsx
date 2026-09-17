import React from 'react';
import { Printer, Keyboard, Home, ShoppingCart, Package, BarChart3, DollarSign, Wallet, Users, LayoutDashboard, Settings, Banknote, UserCheck, HelpCircle } from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';

interface Shortcut {
  key: string;
  label: string;
  icon: React.ReactNode;
  note?: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: 'F1', label: 'Início / Painel Geral', icon: <Home size={16}/> },
  { key: 'F2', label: 'Nova Venda (PDV)', icon: <ShoppingCart size={16}/>, note: 'Abre a tela de vendas diretamente' },
  { key: 'F3', label: 'Pedidos', icon: <LayoutDashboard size={16}/> },
  { key: 'F4', label: 'Relatórios', icon: <BarChart3 size={16}/> },
  { key: 'F5', label: 'Produtos', icon: <Package size={16}/> },
  { key: 'F6', label: 'Financeiro / Despesas', icon: <DollarSign size={16}/> },
  { key: 'F7', label: 'Carteira / Depósitos', icon: <Wallet size={16}/> },
  { key: 'F8', label: 'Usuários / Familiares', icon: <Users size={16}/> },
  { key: 'F9', label: 'Business Intelligence', icon: <BarChart3 size={16}/>, note: 'Somente mestre / admin' },
  { key: 'F10', label: 'Configurações', icon: <Settings size={16}/>, note: 'Somente mestre / admin' },
  { key: 'F11', label: 'Caixa / Gaveta', icon: <Banknote size={16}/> },
  { key: 'F12', label: 'Contas de Clientes (Fiado)', icon: <UserCheck size={16}/> },
  { key: '?', label: 'Ajuda / Atalhos', icon: <HelpCircle size={16}/>, note: 'Abre esta tela de qualquer lugar' }
];

interface AdminShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminShortcutsModal: React.FC<AdminShortcutsModalProps> = ({ isOpen, onClose }) => {

  if (!isOpen) return null;

  const handlePrint = () => {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const linhas = SHORTCUTS.map(s => `
      <tr>
        <td style="text-align:center;background:#059669;color:#ffffff;font-weight:800;border-radius:6px;padding:6px 10px;">${s.key}</td>
        <td>${s.label}</td>
        <td style="color:#64748b;">${s.note || ''}</td>
      </tr>`).join('');
    const html = `<html><head><title>Atalhos do Sistema</title><style>
        body{font-family:'Segoe UI',Arial,sans-serif;padding:40px;color:#0f172a}
        h1{font-size:22px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
        .sub{color:#64748b;font-size:13px;margin-bottom:28px}
        table{width:100%;border-collapse:collapse;margin-top:10px}
        th{padding:10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #0f172a}
        td{padding:12px 10px;font-size:14px;border-bottom:1px solid #e2e8f0;font-weight:600}
        .obs{margin-top:28px;padding:14px 18px;background:#f1f5f9;border-radius:10px;font-size:12px;color:#475569;line-height:1.7}
        .assinatura{margin-top:60px;display:flex;justify-content:space-between;font-size:13px;color:#475569}
        @media print{body{background:white!important;padding:20px!important}}
    </style></head><body>
        <h1>Mercado Fácil — Atalhos de Teclado</h1>
        <p class="sub">Emitido em: ${hoje} · Use as teclas de função para navegação rápida no painel administrativo</p>
        <table><thead><tr><th style="width:80px;">Tecla</th><th>Função</th><th>Observação</th></tr></thead><tbody>${linhas}</tbody></table>
        <div class="obs">Os atalhos funcionam em qualquer tela do painel. Se uma janela (modal) estiver aberta, o atalho é ignorado até fechá-la. Dentro de campos de texto, as teclas digitadas não disparam atalhos.</div>
        <div class="assinatura"><div>Emitido por: Administração</div><div>Imprimir e fixar próximo ao terminal</div></div>
    </body></html>`;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      title="Atalhos de Teclado"
      subtitle="Navegação global F1–F12"
      icon={<Keyboard size={20} />}
      size="lg"
      actions={
        <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border flex items-center gap-1.5" style={{ color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.2)' }}>
          <Printer size={14}/> Imprimir
        </button>
      }
    >
      <div className="p-6 space-y-2">
        {SHORTCUTS.map(s => (
          <div key={s.key} className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-black text-xs font-mono shadow-md">{s.key}</span>
              <div className="flex items-center gap-2 text-slate-700">
                <span className="opacity-60">{s.icon}</span>
                <span className="font-black text-xs uppercase tracking-tight">{s.label}</span>
              </div>
            </div>
            {s.note && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">{s.note}</span>}
          </div>
        ))}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 mt-4">
          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest leading-relaxed">
            Obs: Com uma janela aberta (venda, relatório, produto), os atalhos ficam suspensos. Dentro de campos de texto, nenhum atalho é disparado — apenas a digitação.
          </p>
        </div>
      </div>
    </ModalShell>
  );
};
