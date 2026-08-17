import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  id?: string;
  activeColor?: string;
  disabled?: boolean;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  id,
  activeColor = 'bg-[var(--accent)]',
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      {(label || description) && (
        <div
          className="min-w-0 flex-1 cursor-pointer select-none"
          onClick={() => !disabled && onChange(!checked)}
        >
          {label && (
            <span className="block text-xs font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
              {label}
            </span>
          )}
          {description && (
            <span className="block text-[9px] text-[var(--ink-dim)] mt-0.5">{description}</span>
          )}
        </div>
      )}

      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${checked ? activeColor : 'bg-slate-300 dark:bg-slate-700'}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
};
