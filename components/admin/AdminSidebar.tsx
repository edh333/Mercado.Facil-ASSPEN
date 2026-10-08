import React from 'react';
import { NavItem } from './AdminCommon';
import {
  Users, Package, ShoppingCart, DollarSign, LogOut, Settings,
  BarChart3, Home, Shield, CreditCard, Landmark, Activity, AlertTriangle,
  BookOpen, MessageSquare, Sun, Moon, Monitor, Wrench, Loader2, ShieldCheck
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { SystemRole } from '../PWAInstallProvider';
// AppDownloadButton moved to Settings (strategic: install is config, not navigation)

interface AdminSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingOrdersCount: number;
  pendingDepositsCount: number;
  pendingUsersCount?: number;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
  appName: string;
  userName: string;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenSales?: () => void;
  permissions?: string[];
  isMaster?: boolean;
  userRole?: SystemRole;
  canAccessTab?: (tab: string) => boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab, setActiveTab, pendingOrdersCount, pendingDepositsCount, pendingUsersCount = 0, logout, isLoggingOut, appName, userName,
  isOpen, onClose, onOpenSales, permissions = [], isMaster = false,
  userRole = 'admin',
  canAccessTab
}) => {
  const { themeMode, setThemeMode } = useTheme();
  const hasPermission = (perm: string) => isMaster || permissions.includes('all') || permissions.includes(perm);
  // Usa canAccessTab do Dashboard se disponível, senão fallback para hasPermission local
  const checkAccess = canAccessTab ?? ((tab: string) => {
    // Fallback: mapeamento simplificado para compatibilidade
    const tabPermMap: Record<string, string> = {
      'orders': 'orders', 'products': 'products', 'cash': 'cash',
      'inmates': 'inmates', 'users': 'users', 'finance': 'finance',
      'wallet': 'wallet', 'reports': 'reports', 'customers': 'finance',
      'messages': 'users', 'stock_alerts': 'products', 'bi': 'reports',
      'settings': '', 'maintenance': '', 'audit': 'finance'
    };
    const needPerm = tabPermMap[tab];
    const masterOnly = tab in tabPermMap && tabPermMap[tab] === '';
    return masterOnly ? (isMaster || userRole === 'admin') : (!needPerm || hasPermission(needPerm));
  });
  // Navegação pela sidebar também fecha o drawer mobile: trocar de aba no
  // celular deixava o menu aberto cobrindo a tela do novo conteúdo ativada.
  const go = (tab: string) => { setActiveTab(tab); if (onClose) onClose(); };
  const isSalesRestricted = userRole === 'manager' || userRole === 'operator';

  const renderHome = () => checkAccess('home') && <NavItem icon={Home} label="Início" active={activeTab === 'home'} onClick={() => go('home')} />;
  const renderOrders = () => checkAccess('orders') && <NavItem icon={ShoppingCart} label="Pedidos" active={activeTab === 'orders'} onClick={() => go('orders')} badge={pendingOrdersCount} />;
  const renderProducts = () => checkAccess('products') && <NavItem icon={Package} label="Produtos" active={activeTab === 'products'} onClick={() => go('products')} />;
  const renderStockAlerts = () => checkAccess('stock_alerts') && <NavItem icon={AlertTriangle} label="Alertas de Estoque" active={activeTab === 'stock_alerts'} onClick={() => go('stock_alerts')} />;
  const renderSalesButton = () => checkAccess('sales') && (
    <button
      onClick={onOpenSales}
      className="w-full mt-2 mb-2 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-[13px] bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25 hover:brightness-110 transition-all active:scale-[0.98]"
    >
      <ShoppingCart size={16}/> <span>Venda Direta (PDV)</span>
    </button>
  );

  return (
    <>
      {/* Overlay for Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 md:hidden z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <aside className={`w-64 h-[100dvh] flex flex-col fixed left-0 top-0 overflow-y-auto z-50 transition-transform duration-300 ease-in-out no-scrollbar border-r border-white/5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-center gap-2.5 px-5 py-5 shrink-0">
            <div className="flex size-10 items-center justify-center rounded-xl text-white bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
                <Shield size={20}/>
            </div>
            <div>
                <h1 className="text-sm font-bold tracking-tight leading-tight text-white">{appName}</h1>
                <p className="text-xs text-slate-400">Painel Administrativo</p>
            </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
            {isSalesRestricted ? (
              <>
                {renderHome()}
                {renderOrders()}
                {renderProducts()}
                {renderStockAlerts()}
                {userRole === 'operator' && checkAccess('cash') && <NavItem icon={Landmark} label="Meu Caixa" active={activeTab === 'cash'} onClick={() => go('cash')} />}
                {renderSalesButton()}
              </>
            ) : (
              <>
                {renderHome()}
                {renderOrders()}
                {renderProducts()}
                {renderStockAlerts()}

                {renderSalesButton()}

                {hasPermission('cash') && <NavItem icon={Landmark} label="Caixa / Gaveta" active={activeTab === 'cash'} onClick={() => go('cash')} />}

                <div className="my-2 border-t border-white/10 h-px mx-1"></div>

                {hasPermission('inmates') && <NavItem icon={Shield} label="Gestão de Internos" active={activeTab === 'inmates'} onClick={() => go('inmates')} />}
                {checkAccess('users') && <NavItem icon={Users} label="Gestão de Familiares" active={activeTab === 'users'} onClick={() => go('users')} badge={pendingUsersCount} />}
                {checkAccess('messages') && <NavItem icon={MessageSquare} label="Comunicados" active={activeTab === 'messages'} onClick={() => go('messages')} />}
                {checkAccess('finance') && <NavItem icon={DollarSign} label="Fluxo de Caixa" active={activeTab === 'finance'} onClick={() => go('finance')} />}
                {checkAccess('wallet') && <NavItem icon={CreditCard} label="Carteira & Créditos" active={activeTab === 'wallet'} onClick={() => go('wallet')} badge={pendingDepositsCount} />}
                {checkAccess('customers') && <NavItem icon={BookOpen} label="Contas a Pagar" active={activeTab === 'customers'} onClick={() => go('customers')} />}
                {checkAccess('audit') && <NavItem icon={ShieldCheck} label="Auditoria" active={activeTab === 'audit'} onClick={() => go('audit')} />}

                <div className="my-2 border-t border-white/10 h-px mx-1"></div>

                {checkAccess('reports') && <NavItem icon={BarChart3} label="Relatórios" active={activeTab === 'reports'} onClick={() => go('reports')} />}
                {checkAccess('bi') && (isMaster || userRole === 'admin') && <NavItem icon={Activity} label="Dashboard BI" active={activeTab === 'bi'} onClick={() => go('bi')} />}
                {checkAccess('maintenance') && <NavItem icon={Wrench} label="Manutenção" active={activeTab === 'maintenance'} onClick={() => go('maintenance')} />}
                {checkAccess('settings') && <NavItem icon={Settings} label="Configurações" active={activeTab === 'settings'} onClick={() => go('settings')} />}
              </>
            )}
        </nav>

        <div className="mt-auto border-t border-white/10 p-3 flex flex-col gap-2">
            {/* Dark mode toggle */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/5">
              {([
                { mode: 'light' as const, Icon: Sun, label: 'Claro' },
                { mode: 'dark' as const, Icon: Moon, label: 'Escuro' },
                { mode: 'system' as const, Icon: Monitor, label: 'Sistema' },
              ]).map(({ mode, Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setThemeMode(mode)}
                  title={label}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    themeMode === mode
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden md:inline">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2.5 px-1 py-2 rounded-xl bg-white/5 border border-white/5">
                <div className="flex size-9 items-center justify-center rounded-lg font-bold text-white text-sm bg-gradient-to-br from-emerald-500 to-emerald-600 ring-2 ring-emerald-500/25">
                  {userName[0]}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight text-white">{userName}</p>
                    <p className="text-xs capitalize text-slate-400">{userRole === 'operator' ? 'Operador de Caixa' : userRole === 'manager' ? 'Gerente' : 'Administrador'}</p>
                </div>
            </div>
            <button onClick={logout} disabled={isLoggingOut} className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoggingOut ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />} {isLoggingOut ? 'Saindo...' : 'Sair do Painel'}
            </button>
            <p className="mt-1 px-2 text-center text-[9px] text-slate-600">Desenvolvido por Edevaldo de Lima Almeida {new Date().getFullYear()}</p>
        </div>
      </aside>
    </>
  );
};
