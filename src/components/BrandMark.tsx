import React from 'react';

interface BrandMarkProps {
  collapsed?: boolean;
  lightText?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ collapsed = false, lightText = false }) => {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-lg bg-[#0F172A] dark:bg-emerald-600 border border-slate-800 dark:border-emerald-500 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" aria-hidden="true">
          <path
            d="M4 6.5C4 5.12 5.12 4 6.5 4H13.5C15.985 4 18 6.015 18 8.5C18 10.12 17.14 11.54 15.85 12.33C17.46 13.07 18.5 14.69 18.5 16.5C18.5 19.04 16.44 21 13.9 21H6.5C5.12 21 4 19.88 4 18.5V6.5Z"
            stroke="#10B981"
            strokeWidth="2"
            className="dark:stroke-white"
          />
          <path d="M8 9.5H13.2M8 15.5H13.6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      {!collapsed && (
        <span
          className={`font-display text-base font-bold tracking-tight whitespace-nowrap truncate ${
            lightText ? 'text-white' : 'text-slate-900 dark:text-white'
          }`}
        >
          BS Management
        </span>
      )}
    </div>
  );
};
