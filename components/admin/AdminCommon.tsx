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
      className={`relative w-full flex items-center justify-between rounded-lg px-3 py-2.5 transition-all duration-150 ${
        active
          ? 'bg-emerald-500/15 font-semibold text-white'
          : 'text-slate-300/70 hover:bg-white/5 hover:text-white'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-[#10b981]"></span>
      )}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <Icon size={17} className={`shrink-0 ${active ? 'text-[#10b981]' : ''}`} strokeWidth={active ? 2.2 : 2} />
        <span className="text-[13px] leading-tight text-left truncate">{label}</span>
      </div>
      {badge ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#10b981] text-[10px] font-bold text-white ml-2">
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
    <div className="p-5 rounded-lg bg-white border border-slate-200/70 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex items-center">
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center mr-4 shrink-0 ${color}`}>
            <Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold mb-0.5 text-slate-500">{title}</p>
            <p className="text-xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
    </div>
);
