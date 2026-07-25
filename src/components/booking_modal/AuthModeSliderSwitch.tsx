import React from 'react';
import { motion } from 'motion/react';

interface AuthModeSliderSwitchProps {
  unauthTab: 'guest' | 'auth';
  onChange: (tab: 'guest' | 'auth') => void;
  guestLabel: string;
  authLabel: string;
  className?: string;
}

export const AuthModeSliderSwitch: React.FC<AuthModeSliderSwitchProps> = ({
  unauthTab,
  onChange,
  guestLabel,
  authLabel,
  className = '',
}) => {
  const isGuest = unauthTab === 'guest';

  return (
    <div className={className}>
      {/* Interactive Segmented Slider Switch */}
      <div
        onClick={() => onChange(isGuest ? 'auth' : 'guest')}
        className="relative flex items-center bg-slate-200/90 dark:bg-slate-900/90 p-1.5 rounded-full border border-[var(--border)] cursor-pointer select-none shadow-inner group transition-all duration-200 hover:border-sky-500/50"
        role="switch"
        aria-checked={!isGuest}
        aria-label="Переключатель режима бронирования"
      >
        {/* Animated Sliding Thumb */}
        <motion.div
          className="absolute top-1 bottom-1 rounded-full bg-[var(--card-bg)] shadow-md border border-[var(--border)] ring-1 ring-black/5 dark:ring-white/10"
          initial={false}
          animate={{
            left: isGuest ? '4px' : 'calc(50% + 2px)',
            width: 'calc(50% - 6px)',
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />

        {/* Option 1: Guest (Без регистрации) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange('guest');
          }}
          className={`relative z-10 flex-1 py-2 px-3 text-center font-mono text-[11px] font-bold uppercase tracking-wider transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer rounded-full ${isGuest ? 'text-[var(--ink)]' : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'}`}
        >
          <span className="text-sm">📝</span>
          <span className="truncate">{guestLabel}</span>
        </button>

        {/* Option 2: Auth (Войти / Зарегистрироваться) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange('auth');
          }}
          className={`relative z-10 flex-1 py-2 px-3 text-center font-mono text-[11px] font-bold uppercase tracking-wider transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer rounded-full ${!isGuest ? 'text-[var(--ink)]' : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'}`}
        >
          <span className="text-sm">🔐</span>
          <span className="truncate">{authLabel}</span>
        </button>
      </div>
    </div>
  );
};
