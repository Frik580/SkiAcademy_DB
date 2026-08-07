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
    <div className={`w-full max-w-[380px] sm:max-w-[420px] mx-auto ${className}`}>
      {/* Segmented Switch matching site style */}
      <div
        className="relative flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-none theme-air:rounded-full w-full border border-[var(--border)] overflow-hidden"
        role="tablist"
        aria-label="Режим записи"
      >
        {/* Animated Sliding Thumb */}
        <motion.div
          className="absolute top-1 bottom-1 rounded-none theme-air:rounded-full bg-[var(--card-bg)] shadow-xs border border-[var(--border)]"
          initial={false}
          animate={{
            left: isGuest ? '4px' : 'calc(50% + 2px)',
            width: 'calc(50% - 6px)',
          }}
          transition={{ type: 'spring', stiffness: 450, damping: 35 }}
        />

        {/* Option 1: Guest */}
        <button
          type="button"
          onClick={() => onChange('guest')}
          className={`relative z-10 flex-1 min-w-0 py-1.5 px-2 text-center text-[10px] sm:text-xs font-mono uppercase tracking-wider theme-air:font-sans theme-air:normal-case theme-air:text-xs font-medium transition-colors duration-200 flex items-center justify-center cursor-pointer ${
            isGuest
              ? 'text-[var(--ink)] font-bold'
              : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
          role="tab"
          aria-selected={isGuest}
        >
          <span className="text-center block break-words leading-tight w-full">{guestLabel}</span>
        </button>

        {/* Option 2: Auth */}
        <button
          type="button"
          onClick={() => onChange('auth')}
          className={`relative z-10 flex-1 min-w-0 py-1.5 px-2 text-center text-[10px] sm:text-xs font-mono uppercase tracking-wider theme-air:font-sans theme-air:normal-case theme-air:text-xs font-medium transition-colors duration-200 flex items-center justify-center cursor-pointer ${
            !isGuest
              ? 'text-[var(--ink)] font-bold'
              : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
          }`}
          role="tab"
          aria-selected={!isGuest}
        >
          <span className="text-center block break-words leading-tight w-full">{authLabel}</span>
        </button>
      </div>
    </div>
  );
};
