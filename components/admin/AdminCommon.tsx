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
      className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors ${
        active
          ? 'bg-[#0e7a4d]/10 font-medium text-[#0e7a4d]'
          : 'text-slate-500 hover:bg-black/5 hover:text-slate-900'
      }`}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <Icon size={17} className="shrink-0" strokeWidth={active ? 2.2 : 2} />
        <span className="text-[13px] leading-tight text-left truncate">{label}</span>
      </div>
      {badge ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0e7a4d] text-[10px] font-bold text-white ml-2">
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
            <p className="text-xs font-semibold mb-1 text-white/85">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-white">{value}</p>
        </div>
    </div>
);
