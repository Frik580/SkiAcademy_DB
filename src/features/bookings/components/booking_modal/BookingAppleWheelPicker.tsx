import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import {
  BookingAppleWheelColumn,
  WHEEL_EXPAND_OFFSET,
  WHEEL_FIELD_HEIGHT,
  WHEEL_OPEN_HEIGHT,
} from './BookingAppleWheelColumn';

export interface BookingAppleWheelOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface BookingAppleWheelPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: BookingAppleWheelOption[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
}

export const BookingAppleWheelPicker: React.FC<BookingAppleWheelPickerProps> = ({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = '—',
  id,
  'aria-label': ariaLabel,
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const enabledOptions = options.filter((option) => !option.disabled && option.value !== '');
  const selected = enabledOptions.find((option) => option.value === value);
  const displayLabel = selected?.label ?? placeholder;
  const isInteractive = !disabled && enabledOptions.length > 0;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative h-10">
      <motion.div
        animate={{
          height: isOpen ? WHEEL_OPEN_HEIGHT : WHEEL_FIELD_HEIGHT,
          top: isOpen ? -WHEEL_EXPAND_OFFSET : 0,
        }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`absolute left-0 right-0 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--profile-bg)] ${
          isOpen
            ? 'z-40 shadow-[0_12px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)]'
            : ''
        }`}
      >
        {enabledOptions.length > 0 && (
          <motion.div
            animate={{ y: isOpen ? 0 : -WHEEL_EXPAND_OFFSET }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-0 top-0"
            style={{ height: WHEEL_OPEN_HEIGHT }}
          >
            <BookingAppleWheelColumn
              value={value}
              options={options}
              onChange={onChange}
              isOpen={isOpen}
              onPickSame={() => setIsOpen(false)}
            />
          </motion.div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-10 -translate-y-1/2 bg-[var(--card-bg)]" />

        <button
          type="button"
          id={fieldId}
          disabled={!isInteractive}
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          onClick={() => isInteractive && setIsOpen((open) => !open)}
          className={`absolute inset-0 z-20 flex items-center justify-center gap-2 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45 ${
            isOpen ? 'pointer-events-none' : ''
          }`}
        >
          <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--ink)]">
            {displayLabel}
          </span>
          <ChevronDown
            className={`absolute right-3 h-4 w-4 shrink-0 text-[var(--ink-dim)] opacity-70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      </motion.div>
    </div>
  );
};
