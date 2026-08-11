import React from 'react';

interface NavItemProps {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

export const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, active, onClick, badge }) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all mb-0.5 relative group ${
        active
          ? 'bg-slate-200 text-slate-900 font-bold shadow-sm'
          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {active && <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-emerald-500"></div>}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon size={18} className="shrink-0" strokeWidth={active ? 2.5 : 2} />
        <span className="text-[12px] font-semibold tracking-wide leading-tight text-left">{label}</span>
      </div>
      {badge ? (
          <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow ml-2 shrink-0">
              {badge}
          </span>
      ) : null}
    </button>
  );
};

interface StatCardProps {
    title: string;
    value: string | number;
    icon: any;
    color: string;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, color }) => (
    <div className="p-6 rounded-lg shadow-sm border border-slate-700 bg-gradient-to-br from-[#0f172a] to-[#1e293b] flex items-center hover:shadow-md transition-all relative overflow-hidden group">
        <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-white mr-5 shadow-md group-hover:scale-105 transition-transform ${color}`}>
            <Icon size={26} />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wider mb-1 text-white/80">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
        </div>
    </div>
);
