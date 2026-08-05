import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, GraduationCap, Home, LucideIcon, User, UserRound } from 'lucide-react';
import { useLanguage, type TranslationKey } from '../../../lib/LanguageContext';
import { resolveStudentBottomNavTab, StudentCabinetTab } from './studentCabinetUtils';

export const STUDENT_BOTTOM_TABS: {
  id: StudentCabinetTab;
  labelKey: TranslationKey;
  icon: LucideIcon;
}[] = [
  { id: 'home', labelKey: 'scNavHome', icon: Home },
  { id: 'training', labelKey: 'scNavTraining', icon: GraduationCap },
  { id: 'coach', labelKey: 'scNavCoach', icon: UserRound },
  { id: 'settings', labelKey: 'scNavProfile', icon: User },
];

export const STUDENT_TAB_BAR_HEIGHT = '3.25rem';

export const StudentPanelBackLink: React.FC<{
  onClick: () => void;
  className?: string;
  labelKey?: TranslationKey;
  label?: string;
}> = ({ onClick, className = '', labelKey = 'scNavHome', label }) => {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] transition-colors ${className}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label ?? t(labelKey)}
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
    <nav
      data-student-tab-bar
      className="fixed inset-x-0 bottom-3 sm:bottom-5 z-40 px-3 sm:px-6 pointer-events-none flex justify-center"
      aria-label={t('scNavHome')}
    >
      <div className="pointer-events-auto w-full max-w-2xl mx-auto rounded-full bg-[color-mix(in_srgb,var(--card-bg)_78%,transparent)] backdrop-blur-2xl backdrop-saturate-150 border border-[color-mix(in_srgb,var(--ink)_10%,transparent)] shadow-[0_12px_36px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.3)] p-1.5 flex items-center justify-around relative gap-1">
        {STUDENT_BOTTOM_TABS.map(({ id, labelKey, icon: Icon }) => {
          const active = resolveStudentBottomNavTab(activeTab) === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={active ? 'page' : undefined}
              className={`relative z-10 group flex min-w-[44px] sm:min-w-0 flex-1 shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-2 sm:py-1.5 transition-all duration-200 ease-out active:scale-95 cursor-pointer ${
                active ? 'text-[var(--accent)]' : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="sc-tab-active-pill"
                  className="absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] border border-[var(--accent)]/30 shadow-xs"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              )}
              <Icon
                className={`h-5 w-5 shrink-0 transition-all duration-200 relative z-10 group-hover:-translate-y-0.5 ${
                  active
                    ? 'scale-105 opacity-100 text-[var(--accent)]'
                    : 'opacity-70 group-hover:opacity-100'
                }`}
                strokeWidth={active ? 2.2 : 1.8}
                aria-hidden
              />
              <span className="hidden sm:block text-[10px] leading-tight tracking-tight text-center truncate max-w-[85px] relative z-10 font-medium">
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

/** Muted Apple-style tints for student cabinet sections */
export type ScTint = 'indigo' | 'accent' | 'amber' | 'sky' | 'green' | 'purple' | 'orange';

const SC_TINT_CARD: Record<ScTint, string> = {
  indigo: 'border-[#5E5CE6]/22 bg-[#5E5CE6]/10',
  accent: 'border-[var(--accent)]/22 bg-[var(--accent-muted)]/45',
  amber: 'border-[#FFD60A]/22 bg-[#FFD60A]/10',
  sky: 'border-[#64D2FF]/22 bg-[#64D2FF]/10',
  green: 'border-[#30D158]/22 bg-[#30D158]/10',
  purple: 'border-[#BF5AF2]/22 bg-[#BF5AF2]/10',
  orange: 'border-[#FF9F0A]/22 bg-[#FF9F0A]/10',
};

const SC_TINT_VALUE: Record<ScTint, string> = {
  indigo: 'text-[#9B99FF]',
  accent: 'text-[var(--accent)]',
  amber: 'text-[#FFD60A]',
  sky: 'text-[#64D2FF]',
  green: 'text-[#30D158]',
  purple: 'text-[#BF5AF2]',
  orange: 'text-[#FF9F0A]',
};

export const ScTintCard: React.FC<{
  tint: ScTint;
  className?: string;
  children: React.ReactNode;
}> = ({ tint, className = '', children }) => (
  <div className={`rounded-xl border ${SC_TINT_CARD[tint]} ${className}`}>{children}</div>
);

export const ScSectionTitle: React.FC<{
  children: React.ReactNode;
  tint?: ScTint;
}> = ({ children, tint }) => (
  <h2
    className={`text-sm font-medium tracking-wide ${
      tint ? SC_TINT_VALUE[tint] : 'text-[var(--ink-dim)]'
    }`}
  >
    {children}
  </h2>
);

export const ScProgressBar: React.FC<{
  percent: number;
  className?: string;
  block?: boolean;
  variant?: 'default' | 'block' | 'apple';
  showLabel?: boolean;
  /** Optional fill color for apple variant (CSS color) */
  fillColor?: string;
}> = ({ percent, className = '', block = false, variant, showLabel = false, fillColor }) => {
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
            className="absolute inset-y-0 left-0 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{
              width: `${clamped}%`,
              backgroundColor: fillColor ?? 'var(--accent)',
            }}
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
  items: { label: string; value: string | number; tint?: ScTint }[];
}> = ({ items }) => (
  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {items.map((item) => {
      const tint = item.tint ?? 'accent';
      return (
        <div key={item.label} className={`rounded-xl border px-3 py-3 ${SC_TINT_CARD[tint]}`}>
          <dt className="text-[10px] uppercase tracking-wider text-[var(--ink-dim)]">
            {item.label}
          </dt>
          <dd className={`text-2xl font-serif font-light mt-1 tabular-nums ${SC_TINT_VALUE[tint]}`}>
            {item.value}
          </dd>
        </div>
      );
    })}
  </dl>
);
