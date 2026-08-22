import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type BookingAppleWheelOption } from './BookingAppleWheelPicker';

export const WHEEL_ITEM_HEIGHT = 40;
export const WHEEL_VISIBLE_ROWS = 3;
export const WHEEL_OPEN_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ROWS;
export const WHEEL_FIELD_HEIGHT = 40;
export const WHEEL_EXPAND_OFFSET = (WHEEL_OPEN_HEIGHT - WHEEL_FIELD_HEIGHT) / 2;
export const WHEEL_PADDING = WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_ROWS / 2);
export const WHEEL_SCROLL_SETTLE_MS = 40;

function getWheelItemLabelClass(distance: number): string {
  if (distance < 0.35) {
    return 'truncate text-sm font-semibold text-[var(--ink)]';
  }
  return 'truncate text-[11px] font-normal text-[var(--ink-dim)] opacity-80';
}

function getWheelItemLabelStyle(index: number, scrollOffset: number): React.CSSProperties {
  const distance = Math.abs(index - scrollOffset);
  const t = Math.min(distance, 1);
  return {
    fontSize: `${14 - t * 3}px`,
    fontWeight: t < 0.35 ? 600 : 400,
    opacity: 1 - t * 0.2,
    color: t < 0.35 ? 'var(--ink)' : 'var(--ink-dim)',
  };
}

interface BookingAppleWheelColumnProps {
  value: string;
  options: BookingAppleWheelOption[];
  onChange: (value: string) => void;
  isOpen: boolean;
  onPickSame?: () => void;
}

export const BookingAppleWheelColumn: React.FC<BookingAppleWheelColumnProps> = ({
  value,
  options,
  onChange,
  isOpen,
  onPickSame,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const isUserScrollingRef = useRef(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  const enabledOptions = options.filter((option) => !option.disabled && option.value !== '');

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'auto') => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(index, enabledOptions.length - 1));
      el.scrollTo({ top: clamped * WHEEL_ITEM_HEIGHT, behavior });
    },
    [enabledOptions.length]
  );

  const getClampedIndex = useCallback(
    (scrollTop: number) => {
      const index = Math.round(scrollTop / WHEEL_ITEM_HEIGHT);
      return Math.max(0, Math.min(index, enabledOptions.length - 1));
    },
    [enabledOptions.length]
  );

  const updateValueFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || enabledOptions.length === 0) return;

    setScrollOffset(el.scrollTop / WHEEL_ITEM_HEIGHT);

    const clamped = getClampedIndex(el.scrollTop);
    const next = enabledOptions[clamped];
    if (next && next.value !== value) {
      onChange(next.value);
    }
  }, [enabledOptions, getClampedIndex, onChange, value]);

  const snapToNearest = useCallback(() => {
    const el = scrollRef.current;
    if (!el || enabledOptions.length === 0) return;

    const clamped = getClampedIndex(el.scrollTop);
    setScrollOffset(clamped);

    if (el.scrollTop !== clamped * WHEEL_ITEM_HEIGHT) {
      scrollToIndex(clamped, 'smooth');
    }

    const next = enabledOptions[clamped];
    if (next && next.value !== value) {
      onChange(next.value);
    }

    isUserScrollingRef.current = false;
  }, [enabledOptions, getClampedIndex, onChange, scrollToIndex, value]);

  useEffect(() => {
    if (enabledOptions.length === 0) return;
    const selectedIndex = enabledOptions.findIndex((option) => option.value === value);
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setScrollOffset(nextIndex);
  }, [enabledOptions, value]);

  useEffect(() => {
    if (enabledOptions.length === 0 || isUserScrollingRef.current) return;
    const selectedIndex = enabledOptions.findIndex((option) => option.value === value);
    const frame = window.requestAnimationFrame(() => {
      scrollToIndex(selectedIndex >= 0 ? selectedIndex : 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [enabledOptions, isOpen, scrollToIndex, value]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isOpen) return;

    const handleScrollEnd = () => snapToNearest();

    const handleScroll = () => {
      isUserScrollingRef.current = true;

      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(() => {
          updateValueFromScroll();
          rafRef.current = null;
        });
      }

      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = window.setTimeout(() => {
        snapToNearest();
        scrollTimeoutRef.current = null;
      }, WHEEL_SCROLL_SETTLE_MS);
    };

    el.addEventListener('scrollend', handleScrollEnd);
    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      el.removeEventListener('scrollend', handleScrollEnd);
      el.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isOpen, snapToNearest, updateValueFromScroll]);

  if (enabledOptions.length === 0) {
    return <div className="h-full min-w-0" />;
  }

  return (
    <div
      ref={scrollRef}
      className={`h-full min-w-0 overflow-y-auto snap-y snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isOpen ? '' : 'pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      <div style={{ paddingTop: WHEEL_PADDING, paddingBottom: WHEEL_PADDING }}>
        {enabledOptions.map((option, index) => {
          const selectedIndex = enabledOptions.findIndex((item) => item.value === value);
          const activeOffset = isOpen ? scrollOffset : selectedIndex >= 0 ? selectedIndex : 0;
          const distance = Math.abs(index - activeOffset);

          return (
            <button
              key={option.value}
              type="button"
              tabIndex={isOpen ? 0 : -1}
              onClick={() => {
                const optionIndex = enabledOptions.findIndex((item) => item.value === option.value);
                scrollToIndex(optionIndex, 'smooth');
                setScrollOffset(optionIndex);
                if (option.value === value) {
                  onPickSame?.();
                  return;
                }
                onChange(option.value);
              }}
              className="flex w-full snap-center snap-always items-center justify-center px-1 text-center"
              style={{ height: WHEEL_ITEM_HEIGHT }}
            >
              <span
                className={
                  isOpen
                    ? 'truncate'
                    : `${getWheelItemLabelClass(distance)} transition-all duration-150`
                }
                style={isOpen ? getWheelItemLabelStyle(index, scrollOffset) : undefined}
              >
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
