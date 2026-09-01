import React from 'react';
import { NavItem } from './AdminCommon';
import {
  Users, Package, ShoppingCart, DollarSign, LogOut, Settings,
  BarChart3, Home, Shield, CreditCard, Landmark, Activity, AlertTriangle,
  BookOpen, MessageSquare, Sun, Moon, Monitor
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
  logout: () => void;
  appName: string;
  userName: string;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenSales?: () => void;
  permissions?: string[];
  isMaster?: boolean;
  isImageBg?: boolean;
  primaryColor?: string;
  userRole?: SystemRole;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab, setActiveTab, pendingOrdersCount, pendingDepositsCount, pendingUsersCount = 0, logout, appName, userName,
  isOpen, onClose, onOpenSales, permissions = [], isMaster = false, isImageBg = false, primaryColor = '#10b981',
  userRole = 'admin'
}) => {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  const { themeMode, setThemeMode } = useTheme();
  const hasPermission = (perm: string) => isMaster || permissions.includes('all') || permissions.includes(perm);
  const isSalesRestricted = userRole === 'manager';

  const renderHome = () => <NavItem icon={Home} label="Início" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />;
  const renderOrders = () => hasPermission('orders') && <NavItem icon={ShoppingCart} label="Pedidos" active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} badge={pendingOrdersCount} />;
  const renderProducts = () => hasPermission('products') && <NavItem icon={Package} label="Produtos" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />;
  const renderStockAlerts = () => hasPermission('products') && <NavItem icon={AlertTriangle} label="Alertas de Estoque" active={activeTab === 'stock_alerts'} onClick={() => setActiveTab('stock_alerts')} />;
  const renderSalesButton = () => hasPermission('sales') && (
    <button
      onClick={onOpenSales}
      className="w-full mt-2 mb-2 text-white p-3 rounded-lg flex items-center justify-center gap-2 font-semibold text-[13px] bg-[#10b981] hover:bg-[#059669] transition-all active:scale-[0.98]"
    >
      <ShoppingCart size={16}/> <span>Venda Direta (PDV)</span>
    </button>
  );

  return (
    <>
      {/* Overlay for Mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 lg:hidden z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      <aside className={`w-64 h-[100dvh] flex flex-col fixed left-0 top-0 overflow-y-auto z-50 transition-transform duration-300 ease-in-out no-scrollbar border-r border-slate-800 bg-[#0f172a] shadow-sm ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-2.5 px-5 py-5 shrink-0">
            <div className="flex size-10 items-center justify-center rounded-lg text-white bg-[#10b981]">
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
                {renderSalesButton()}
              </>
            ) : (
              <>
                {renderHome()}
                {renderOrders()}
                {renderProducts()}
                {renderStockAlerts()}

                {renderSalesButton()}

                {hasPermission('cash') && <NavItem icon={Landmark} label="Caixa / Gaveta" active={activeTab === 'cash'} onClick={() => setActiveTab('cash')} />}

                <div className="my-2 border-t border-slate-800 h-px mx-1"></div>

                {hasPermission('inmates') && <NavItem icon={Shield} label="Gestão de Internos" active={activeTab === 'inmates'} onClick={() => setActiveTab('inmates')} />}
                {hasPermission('users') && <NavItem icon={Users} label="Gestão de Familiares" active={activeTab === 'users'} onClick={() => setActiveTab('users')} badge={pendingUsersCount} />}
                {hasPermission('users') && <NavItem icon={MessageSquare} label="Comunicados" active={activeTab === 'messages'} onClick={() => setActiveTab('messages')} />}
                {hasPermission('finance') && <NavItem icon={DollarSign} label="Fluxo de Caixa" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />}
                {hasPermission('wallet') && <NavItem icon={CreditCard} label="Carteira & Créditos" active={activeTab === 'wallet'} onClick={() => setActiveTab('wallet')} badge={pendingDepositsCount} />}
                {hasPermission('finance') && userRole !== 'operator' && <NavItem icon={BookOpen} label="Contas a Pagar" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />}

                <div className="my-2 border-t border-slate-800 h-px mx-1"></div>

                {hasPermission('reports') && <NavItem icon={BarChart3} label="Relatórios" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />}
                {hasPermission('reports') && (isMaster || userRole === 'admin') && <NavItem icon={Activity} label="Dashboard BI" active={activeTab === 'bi'} onClick={() => setActiveTab('bi')} />}
                {(isMaster || userRole === 'admin') && <NavItem icon={Settings} label="Configurações" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />}
              </>
            )}
        </nav>

        <div className="mt-auto border-t border-slate-800 p-3 flex flex-col gap-2">
            {/* Dark mode toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800 border border-slate-700">
              {([
                { mode: 'light' as const, Icon: Sun, label: 'Claro' },
                { mode: 'dark' as const, Icon: Moon, label: 'Escuro' },
                { mode: 'system' as const, Icon: Monitor, label: 'Sistema' },
              ]).map(({ mode, Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setThemeMode(mode)}
                  title={label}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                    themeMode === mode
                      ? 'bg-[#10b981] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  <span className="hidden lg:inline">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2.5 px-1 py-2 rounded-lg bg-slate-800/60 border border-slate-700/60">
                <div className="flex size-9 items-center justify-center rounded-lg font-bold text-white text-sm bg-[#10b981]">
                  {userName[0]}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight text-white">{userName}</p>
                    <p className="text-xs capitalize text-slate-400">Administrador</p>
                </div>
            </div>
            <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-red-400 rounded-lg transition-colors text-[13px]">
                <LogOut size={16}/> Sair do Painel
            </button>
            <p className="mt-1 px-2 text-center text-[9px] text-slate-500">Desenvolvido por Edevaldo de Lima Almeida</p>
        </div>
      </aside>
    </>
  );
};
