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
      className={`relative w-full flex items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-200 ${
        active
          ? 'bg-gradient-to-r from-emerald-500/15 to-emerald-500/[0.04] font-semibold text-emerald-300'
          : 'text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-emerald-400"></span>
      )}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <Icon size={17} className={`shrink-0 ${active ? 'text-emerald-400' : ''}`} strokeWidth={active ? 2.2 : 2} />
        <span className="text-[13px] leading-tight text-left truncate">{label}</span>
      </div>
      {badge ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white ml-2 shadow-lg shadow-emerald-500/40">
              {badge}
          </span>
      ) : null}
    </button>
  );
};
