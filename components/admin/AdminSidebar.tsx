import React from 'react';
import { NavItem } from './AdminCommon';
import {
  Users, Package, ShoppingCart, DollarSign, LogOut, Settings,
  Database, BarChart3, Home, Shield, Truck, CreditCard, Landmark, Activity, AlertTriangle,
  BookOpen, Download
} from 'lucide-react';
import { usePWAInstall, SystemRole } from '../PWAInstallProvider';
import { AppDownloadButton } from '../AppDownloadModal';

interface AdminSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingOrdersCount: number;
  pendingDepositsCount: number;
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

const InstallButtonSidebar: React.FC<{ userRole?: SystemRole }> = ({ userRole }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  if (!isInstallable || isInstalled) return null;
  const isAdmin = userRole === 'admin';
  return (
    <div className="flex flex-col gap-2">
      {isAdmin && (
        <button
          onClick={() => install('user')}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-sky-500/20 hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <Download size={16} /> Instalar App (Usuário)
        </button>
      )}
      <button
        onClick={() => install(isAdmin ? 'admin' : 'user')}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.98] transition-all"
      >
        <Download size={16} /> {isAdmin ? 'Instalar Painel Admin' : 'Instalar Aplicativo'}
      </button>
    </div>
  );
};

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab, setActiveTab, pendingOrdersCount, pendingDepositsCount, logout, appName, userName,
  isOpen, onClose, onOpenSales, permissions = [], isMaster = false, isImageBg = false, primaryColor = '#10b981',
  userRole = 'admin'
}) => {
  const hasPermission = (perm: string) => isMaster || permissions.includes(perm);
  const isSalesRestricted = userRole === 'manager';

  const renderHome = () => <NavItem icon={Home} label="Início" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />;
  const renderOrders = () => hasPermission('orders') && <NavItem icon={ShoppingCart} label="Pedidos" active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} badge={pendingOrdersCount} />;
  const renderProducts = () => hasPermission('products') && <NavItem icon={Package} label="Produtos" active={activeTab === 'products'} onClick={() => setActiveTab('products')} />;
  const renderStockAlerts = () => hasPermission('products') && <NavItem icon={AlertTriangle} label="Alertas de Estoque" active={activeTab === 'stock_alerts'} onClick={() => setActiveTab('stock_alerts')} />;
  const renderSalesButton = () => hasPermission('sales') && (
    <button
      onClick={onOpenSales}
      className="w-full mt-3 mb-3 text-white p-3.5 rounded-xl flex items-center justify-center gap-2 font-bold text-xs tracking-wide shadow-md hover:brightness-110 transition-all active:scale-[0.98]"
      style={{ backgroundColor: primaryColor }}
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

      <aside className={`w-72 h-[100dvh] p-5 flex flex-col fixed left-0 top-0 overflow-y-auto z-50 transition-transform duration-300 ease-in-out no-scrollbar border-r border-slate-200 shadow-lg bg-white ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="mb-6 flex items-center gap-3 shrink-0 px-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border border-slate-200"
              style={{ backgroundColor: primaryColor, color: '#ffffff' }}>
                <Shield size={22}/>
            </div>
            <div>
                <h1 className="text-base font-bold tracking-tight leading-none text-slate-900">{appName}</h1>
                <p className="text-[10px] text-slate-700 font-black tracking-wide mt-1">PAINEL ADMINISTRATIVO</p>
            </div>
        </div>

        <nav className="flex-1 space-y-0.5">
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

                <div className="my-2 border-t border-slate-200 h-px mx-2"></div>

                {hasPermission('inmates') && <NavItem icon={Shield} label="Gestão de Internos" active={activeTab === 'inmates'} onClick={() => setActiveTab('inmates')} />}
                {hasPermission('users') && <NavItem icon={Users} label="Gestão de Familiares" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />}
                {hasPermission('finance') && <NavItem icon={DollarSign} label="Fluxo de Caixa" active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} />}
                {hasPermission('wallet') && <NavItem icon={CreditCard} label="Carteira & Créditos" active={activeTab === 'wallet'} onClick={() => setActiveTab('wallet')} badge={pendingDepositsCount} />}
                {hasPermission('finance') && userRole !== 'operator' && <NavItem icon={BookOpen} label="Contas a Pagar" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />}

                <div className="my-2 border-t border-slate-200 h-px mx-2"></div>

                {hasPermission('reports') && <NavItem icon={BarChart3} label="Relatórios" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} />}
                {hasPermission('reports') && (isMaster || userRole === 'admin') && <NavItem icon={Activity} label="Dashboard BI" active={activeTab === 'bi'} onClick={() => setActiveTab('bi')} />}
                {(isMaster || userRole === 'admin') && <NavItem icon={Settings} label="Configurações" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />}
              </>
            )}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-200 flex flex-col gap-3">
            <AppDownloadButton variant="full" label="Baixar App (Setup)" />
            <InstallButtonSidebar userRole={userRole} />
            <div className="flex items-center gap-3 px-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-sm"
                  style={{ backgroundColor: primaryColor }}>
                  {userName[0]}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 leading-tight truncate">{userName}</p>
                    <p className="text-[10px] text-slate-700 font-black mt-0.5">Administrador</p>
                </div>
            </div>
            <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl transition-all font-semibold text-sm border border-slate-200">
                <LogOut size={18}/> Sair do Painel
            </button>
        </div>
      </aside>
    </>
  );
};
