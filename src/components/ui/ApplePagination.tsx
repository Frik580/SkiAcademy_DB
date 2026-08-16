import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';

export interface ApplePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
  /** Custom label for item units e.g. "lessons", "clients", "items" */
  itemLabel?: string;
  className?: string;
  /** Layout variant: 'floating' pill bar or 'inline' compact bar */
  variant?: 'floating' | 'inline' | 'card';
  showSummary?: boolean;
}

export const ApplePagination: React.FC<ApplePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  itemLabel,
  className = '',
  variant = 'card',
  showSummary = true,
}) => {
  const { language } = useLanguage();

  if (totalPages <= 1) return null;

  // Generate page numbers with smart ellipsis windowing
  const getPageNumbers = (): (number | 'dots-start' | 'dots-end')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'dots-start' | 'dots-end')[] = [];

    if (currentPage <= 4) {
      // Near beginning: 1 2 3 4 5 ... totalPages
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('dots-end');
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 3) {
      // Near end: 1 ... totalPages-4 totalPages-3 totalPages-2 totalPages-1 totalPages
      pages.push(1);
      pages.push('dots-start');
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      // Middle: 1 ... currentPage-1 currentPage currentPage+1 ... totalPages
      pages.push(1);
      pages.push('dots-start');
      pages.push(currentPage - 1);
      pages.push(currentPage);
      pages.push(currentPage + 1);
      pages.push('dots-end');
      pages.push(totalPages);
    }

    return pages;
  };

  const pages = getPageNumbers();

  // Item range calculations
  const startItem = totalItems && itemsPerPage ? (currentPage - 1) * itemsPerPage + 1 : undefined;
  const endItem =
    totalItems && itemsPerPage ? Math.min(currentPage * itemsPerPage, totalItems) : undefined;

  const defaultUnit = language === 'ru' ? 'записей' : 'items';
  const unitText = itemLabel || defaultUnit;

  const summaryText =
    startItem !== undefined && endItem !== undefined && totalItems !== undefined
      ? language === 'ru'
        ? `Показано ${startItem}–${endItem} из ${totalItems} ${unitText}`
        : `Showing ${startItem}–${endItem} of ${totalItems} ${unitText}`
      : language === 'ru'
        ? `Страница ${currentPage} из ${totalPages}`
        : `Page ${currentPage} of ${totalPages}`;

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${
        variant === 'floating'
          ? 'py-2 px-3 rounded-2xl bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border border-black/[0.08] dark:border-white/[0.12] shadow-sm'
          : variant === 'card'
            ? 'pt-4 border-t border-[var(--border-subtle)] mt-4'
            : ''
      } ${className}`}
    >
      {/* Left: Summary pill badge */}
      {showSummary && (
        <div className="text-xs font-medium text-[var(--ink-dim)] tracking-tight px-1 select-none flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500/80 animate-pulse" />
          <span>{summaryText}</span>
        </div>
      )}

      {/* Right / Center: Apple-style segmented pill bar */}
      <div className="flex items-center gap-1 p-1 rounded-full bg-slate-100/80 dark:bg-neutral-800/80 border border-black/5 dark:border-white/10 shadow-xs backdrop-blur-xs select-none">
        {/* Previous Button */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--ink)] hover:bg-white dark:hover:bg-neutral-700 hover:shadow-xs transition-all cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          title={language === 'ru' ? 'Предыдущая страница' : 'Previous page'}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>

        {/* Page items */}
        <div className="flex items-center gap-1 px-0.5">
          {pages.map((item, idx) => {
            if (item === 'dots-start' || item === 'dots-end') {
              return (
                <div
                  key={`dots-${item}-${idx}`}
                  className="w-7 h-7 flex items-center justify-center text-[var(--ink-dim)]"
                >
                  <MoreHorizontal className="w-3.5 h-3.5 opacity-60" />
                </div>
              );
            }

            const pageNum = item as number;
            const isActive = pageNum === currentPage;

            return (
              <motion.button
                key={pageNum}
                type="button"
                whileHover={{ scale: isActive ? 1.02 : 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => onPageChange(pageNum)}
                className={`relative w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? 'text-[var(--bg)] font-semibold shadow-xs'
                    : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-white/60 dark:hover:bg-neutral-700/60'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="applePaginationActiveBadge"
                    className="absolute inset-0 rounded-full bg-[var(--ink)] shadow-xs"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10 tabular-nums">{pageNum}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Next Button */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--ink)] hover:bg-white dark:hover:bg-neutral-700 hover:shadow-xs transition-all cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          title={language === 'ru' ? 'Следующая страница' : 'Next page'}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  );
};
