import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronUp, LucideIcon, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../../../../app/providers/LanguageContext';

interface AdminCollapsibleSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  forceOpenToken?: string;
  headerActions?: React.ReactNode;
  badge?: string | number;
  children: React.ReactNode;
  className?: string;
}

export const AdminCollapsibleSection: React.FC<AdminCollapsibleSectionProps> = ({
  id,
  title,
  subtitle,
  icon: Icon,
  defaultOpen = true,
  forceOpen = false,
  forceOpenToken,
  headerActions,
  badge,
  children,
  className = '',
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(`admin_section_open_${id}`);
      return saved !== null ? JSON.parse(saved) : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    if (forceOpen) setIsOpen(true);
  }, [forceOpen, forceOpenToken]);

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`admin_section_open_${id}`, JSON.stringify(next));
      } catch {
        // ignore localStorage errors
      }
      return next;
    });
  };

  return (
    <div
      className={`border border-[var(--border)] bg-transparent space-y-0 transition-colors duration-300 w-full min-w-0 overflow-hidden ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 border-b border-[var(--border)] bg-black/5 dark:bg-white/5 select-none gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={toggleOpen}>
          {Icon && (
            <div className="p-2 border border-[var(--border)] bg-[var(--bg)] text-[var(--ink)] shrink-0">
              <Icon className="w-4.5 h-4.5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-lg font-light text-[var(--ink)] truncate">{title}</h3>
              {badge !== undefined && (
                <span className="text-[9px] font-mono px-2 py-0.5 border border-[var(--border)] bg-[var(--bg)] text-[var(--ink-dim)] uppercase tracking-widest font-bold">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
          <button
            type="button"
            onClick={toggleOpen}
            className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink-dim)] hover:text-[var(--ink)] bg-[var(--bg)] transition cursor-pointer flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2.5"
            title={isOpen ? t('hideTable') : t('showTable')}
          >
            {isOpen ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('hide')}</span>
                <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('show')}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
              </>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
