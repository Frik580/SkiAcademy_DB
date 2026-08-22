import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BOOKING_APPLE_POPOVER_CLASS,
  BOOKING_APPLE_TRIGGER_CLASS,
} from './bookingAppleFieldStyles';

export interface BookingAppleSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface BookingAppleSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BookingAppleSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-label'?: string;
}

const triggerClass = BOOKING_APPLE_TRIGGER_CLASS;

export const BookingAppleSelect: React.FC<BookingAppleSelectProps> = ({
  value,
  onChange,
  options,
  disabled = false,
  placeholder = '—',
  id,
  'aria-label': ariaLabel,
}) => {
  const autoId = useId();
  const listboxId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label ?? placeholder;

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

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={listboxId}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen((open) => !open)}
        className={triggerClass}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--ink-dim)] opacity-70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.ul
            role="listbox"
            aria-labelledby={listboxId}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={`${BOOKING_APPLE_POPOVER_CLASS} mt-1.5 max-h-52 w-full overflow-auto p-1`}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      option.disabled
                        ? 'cursor-not-allowed opacity-40'
                        : isSelected
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'text-[var(--ink)] hover:bg-[rgba(120,120,128,0.12)] dark:hover:bg-[rgba(120,120,128,0.22)]'
                    }`}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};
