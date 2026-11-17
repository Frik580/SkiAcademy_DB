import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import {
  BookingAppleWheelColumn,
  WHEEL_EXPAND_OFFSET,
  WHEEL_FIELD_HEIGHT,
  WHEEL_OPEN_HEIGHT,
} from './BookingAppleWheelColumn';
import {
  clampDateParts,
  daysInMonth,
  formatDisplayDate,
  formatYmd,
  getDateWheelYearRange,
  getMonthWheelLabels,
  parseYmd,
} from './bookingAppleCalendar';

interface BookingAppleDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  locale?: string;
  id?: string;
  'aria-label'?: string;
}

function resolveDateParts(value: string, minDate: Date | null, maxDate: Date | null, today: Date) {
  const parsed = value ? parseYmd(value) : null;
  const fallback = minDate ?? today;
  const base = parsed ?? fallback;
  return clampDateParts(base.getFullYear(), base.getMonth(), base.getDate(), minDate, maxDate);
}

export const BookingAppleDatePicker: React.FC<BookingAppleDatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  placeholder = '—',
  locale = 'en-US',
  id,
  'aria-label': ariaLabel,
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const minDate = useMemo(() => (min ? parseYmd(min) : null), [min]);
  const maxDate = useMemo(() => (max ? parseYmd(max) : null), [max]);
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const parts = useMemo(
    () => resolveDateParts(value, minDate, maxDate, today),
    [value, minDate, maxDate, today]
  );

  const { minYear, maxYear } = useMemo(
    () => ({
      ...getDateWheelYearRange(minDate, today),
      ...(maxDate ? { maxYear: maxDate.getFullYear() } : {}),
    }),
    [minDate, maxDate, today]
  );

  const monthLabels = useMemo(() => getMonthWheelLabels(locale), [locale]);

  const yearOptions = useMemo(
    () =>
      Array.from({ length: Math.max(0, maxYear - minYear + 1) }, (_, index) => {
        const year = minYear + index;
        return { value: String(year), label: String(year) };
      }),
    [maxYear, minYear]
  );

  const monthOptions = useMemo(() => {
    const startMonth = parts.year === minYear && minDate ? minDate.getMonth() : 0;
    const endMonth = maxDate && parts.year === maxYear ? maxDate.getMonth() : 11;
    return Array.from({ length: Math.max(0, endMonth - startMonth + 1) }, (_, index) => {
      const month = startMonth + index;
      return { value: String(month), label: monthLabels[month] };
    });
  }, [minDate, minYear, maxDate, maxYear, monthLabels, parts.year]);

  const dayOptions = useMemo(() => {
    const startDay =
      parts.year === minYear && parts.month === (minDate?.getMonth() ?? -1) && minDate
        ? minDate.getDate()
        : 1;
    const endDay =
      maxDate && parts.year === maxYear && parts.month === maxDate.getMonth()
        ? maxDate.getDate()
        : daysInMonth(parts.year, parts.month);
    return Array.from({ length: Math.max(0, endDay - startDay + 1) }, (_, index) => {
      const day = startDay + index;
      return { value: String(day), label: String(day) };
    });
  }, [minDate, minYear, maxDate, maxYear, parts.month, parts.year]);

  const displayLabel = value ? formatDisplayDate(value, locale) : placeholder;
  const isInteractive = !disabled && !(min && max && min > max);

  const applyDateParts = (year: number, month: number, day: number) => {
    if (!isInteractive) return;
    const next = clampDateParts(year, month, day, minDate, maxDate);
    onChange(formatYmd(new Date(next.year, next.month, next.day)));
  };

  const columnOrder = locale.startsWith('ru')
    ? (['day', 'month', 'year'] as const)
    : (['month', 'day', 'year'] as const);

  const columnGridClass =
    columnOrder[0] === 'day'
      ? 'grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1fr)]'
      : 'grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)]';

  const renderColumn = (kind: 'day' | 'month' | 'year') => {
    if (kind === 'day') {
      return (
        <BookingAppleWheelColumn
          key="day"
          value={String(parts.day)}
          options={dayOptions}
          isOpen={isOpen}
          onPickSame={() => setIsOpen(false)}
          onChange={(nextDay) => applyDateParts(parts.year, parts.month, Number(nextDay))}
        />
      );
    }
    if (kind === 'month') {
      return (
        <BookingAppleWheelColumn
          key="month"
          value={String(parts.month)}
          options={monthOptions}
          isOpen={isOpen}
          onPickSame={() => setIsOpen(false)}
          onChange={(nextMonth) => applyDateParts(parts.year, Number(nextMonth), parts.day)}
        />
      );
    }
    return (
      <BookingAppleWheelColumn
        key="year"
        value={String(parts.year)}
        options={yearOptions}
        isOpen={isOpen}
        onPickSame={() => setIsOpen(false)}
        onChange={(nextYear) => applyDateParts(Number(nextYear), parts.month, parts.day)}
      />
    );
  };

  useEffect(() => {
    if (!value) return;
    if ((min && value < min) || (max && value > max) || disabled) onChange('');
  }, [min, max, disabled, onChange, value]);

  useEffect(() => {
    if (!isInteractive) setIsOpen(false);
  }, [isInteractive]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !isOpen) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        rootRef.current
          ?.querySelector<HTMLButtonElement>('button[aria-expanded]')
          ?.focus({ preventScroll: true });
      }}
      className="relative h-10"
    >
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
        <motion.div
          animate={{ y: isOpen ? 0 : -WHEEL_EXPAND_OFFSET }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute inset-x-0 top-0 grid ${columnGridClass}`}
          style={{ height: WHEEL_OPEN_HEIGHT }}
        >
          {columnOrder.map((kind) => renderColumn(kind))}
        </motion.div>

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
          <span className="min-w-0 flex-1 truncate text-center type-compact font-medium text-[var(--ink)]">
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
