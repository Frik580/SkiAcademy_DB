import React from 'react';
import { ArrowLeft, Calendar, Home, LayoutGrid, LucideIcon, Settings, TrendingUp, Users } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../../../lib/LanguageContext';
import { StudentCabinetTab } from './studentCabinetUtils';

export const STUDENT_TABS: {
  id: StudentCabinetTab;
  labelKey: TranslationKey;
  icon: LucideIcon;
}[] = [
  { id: 'home', labelKey: 'scNavHome', icon: Home },
  { id: 'development', labelKey: 'scNavDevelopment', icon: TrendingUp },
  { id: 'calendar', labelKey: 'scNavCalendar', icon: Calendar },
  { id: 'courses', labelKey: 'scNavCourses', icon: LayoutGrid },
  { id: 'instructors', labelKey: 'scNavInstructors', icon: Users },
  { id: 'settings', labelKey: 'scNavSettings', icon: Settings },
];

export const STUDENT_TAB_BAR_HEIGHT = '3.25rem';

export const StudentPanelBackLink: React.FC<{
  onClick: () => void;
  className?: string;
}> = ({ onClick, className = '' }) => {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] transition-colors ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {t('scNavHome')}
    </button>
  );
};

interface StudentCabinetTabBarProps {
  activeTab: StudentCabinetTab;
  onSelect: (tab: StudentCabinetTab) => void;
}

export const StudentCabinetTabBar: React.FC<StudentCabinetTabBarProps> = ({
  activeTab,
  onSelect,
}) => {
  const { t } = useLanguage();

  return (
    <nav className="sc-tab-bar fixed inset-x-0 bottom-0 z-30" aria-label={t('scNavHome')}>
      <div className="sc-tab-bar-inner mx-auto flex max-w-2xl items-stretch justify-around px-1 overflow-x-auto no-scrollbar">
        {STUDENT_TABS.map(({ id, labelKey, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={active ? 'page' : undefined}
              className={`group flex min-w-[48px] sm:min-w-0 flex-1 shrink-0 sm:shrink flex-col items-center justify-center gap-[2px] px-0.5 py-1 transition-[color,transform] duration-200 ease-out active:scale-[0.96] active:opacity-80 ${
                active ? 'text-[var(--accent)]' : 'text-[var(--ink-dim)]'
              }`}
            >
              <Icon
                className={`h-[20px] w-[20px] sm:h-[22px] sm:w-[22px] shrink-0 transition-all duration-200 ${
                  active
                    ? 'opacity-100'
                    : 'opacity-[0.72] group-hover:opacity-100 group-hover:text-[var(--ink)]'
                }`}
                strokeWidth={active ? 2.25 : 1.75}
                aria-hidden
              />
              <span
                className={`text-[8.5px] xs:text-[9.5px] sm:text-[10px] leading-[1.1] tracking-[-0.02em] text-center whitespace-normal break-words max-w-full ${
                  active ? 'font-semibold' : 'font-medium'
                }`}
              >
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export const ScDivider: React.FC = () => (
  <div className="py-2" aria-hidden>
    <div className="h-px w-full bg-[var(--border-subtle)]" />
  </div>
);

export const ScSectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-sm font-medium text-[var(--ink-dim)] tracking-wide">{children}</h2>
);

export const ScProgressBar: React.FC<{
  percent: number;
  className?: string;
  block?: boolean;
  variant?: 'default' | 'block' | 'apple';
  showLabel?: boolean;
}> = ({ percent, className = '', block = false, variant, showLabel = false }) => {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  const resolvedVariant = variant ?? (block ? 'block' : 'default');

  if (resolvedVariant === 'block') {
    const filled = Math.round((clamped / 100) * 20);
    const empty = 20 - filled;
    return (
      <div className={`font-mono text-sm tracking-tight text-[var(--ink)] ${className}`}>
        {'█'.repeat(filled)}
        <span className="text-[var(--border)]">{'░'.repeat(empty)}</span>
        <span className="ml-2 text-[var(--ink-dim)] text-xs">{clamped}%</span>
      </div>
    );
  }

  if (resolvedVariant === 'apple') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <div
          className="relative flex-1 h-2.5 rounded-full overflow-hidden bg-[var(--border-subtle)]"
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${clamped}%` }}
          />
        </div>
        {showLabel && (
          <span className="text-[11px] font-semibold tabular-nums text-[var(--ink-dim)] shrink-0 min-w-[2rem] text-right">
            {clamped}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`h-1.5 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[var(--accent)] transition-all duration-700"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

export const ScTextButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { arrow?: boolean }
> = ({ children, arrow, className = '', ...props }) => (
  <button
    type="button"
    className={`text-sm font-medium text-[var(--ink)] hover:text-[var(--accent)] transition inline-flex items-center gap-1 ${className}`}
    {...props}
  >
    {children}
    {arrow && <span aria-hidden>→</span>}
  </button>
);

export const ScStatGrid: React.FC<{
  items: { label: string; value: string | number }[];
}> = ({ items }) => (
  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
    {items.map((item) => (
      <div key={item.label}>
        <dt className="text-xs text-[var(--ink-dim)]">{item.label}</dt>
        <dd className="text-2xl font-serif font-light text-[var(--ink)] mt-0.5">{item.value}</dd>
      </div>
    ))}
  </dl>
);
