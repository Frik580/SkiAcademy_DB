import React from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  CalendarPlus,
  ChevronRight,
  CircleUser,
  GraduationCap,
  Home,
  LucideIcon,
  MessagesSquare,
} from 'lucide-react';
import { useLanguage, type TranslationKey } from '../../../../app/providers/LanguageContext';
import { resolveStudentBottomNavTab, StudentCabinetTab } from './studentCabinetUtils';

export const STUDENT_BOTTOM_TABS: {
  id: StudentCabinetTab;
  labelKey: TranslationKey;
  icon: LucideIcon;
}[] = [
  { id: 'home', labelKey: 'scNavHome', icon: Home },
  { id: 'training', labelKey: 'scNavTraining', icon: GraduationCap },
  { id: 'coach', labelKey: 'scNavCoach', icon: MessagesSquare },
  { id: 'settings', labelKey: 'scNavProfile', icon: CircleUser },
];

export const STUDENT_BOTTOM_LEFT_TABS = STUDENT_BOTTOM_TABS.slice(0, 2);
export const STUDENT_BOTTOM_RIGHT_TABS = STUDENT_BOTTOM_TABS.slice(2);

/** Inner tab row height for Elevated Action Rail (labels always visible). */
export const STUDENT_TAB_BAR_HEIGHT = '4rem';
export const STUDENT_TAB_BAR_FOOTER_PADDING = '1.25rem';

/** Высота футера ЛК: меню по центру + safe-area снизу */
export const studentCabinetFooterHeight = `calc(${STUDENT_TAB_BAR_HEIGHT} + 2 * ${STUDENT_TAB_BAR_FOOTER_PADDING} + env(safe-area-inset-bottom, 0px))`;

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
  onOpenBooking?: () => void;
  instructorPickerOpen?: boolean;
}

export const StudentCabinetTabBar: React.FC<StudentCabinetTabBarProps> = ({
  activeTab,
  onSelect,
  onOpenBooking,
  instructorPickerOpen = false,
}) => {
  const { t } = useLanguage();

  const renderTab = ({
    id,
    labelKey,
    icon: Icon,
  }: {
    id: StudentCabinetTab;
    labelKey: TranslationKey;
    icon: LucideIcon;
  }) => {
    const active = !instructorPickerOpen && resolveStudentBottomNavTab(activeTab) === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => onSelect(id)}
        aria-current={active ? 'page' : undefined}
        className={`relative z-10 group flex min-w-[44px] flex-1 shrink-0 flex-col items-center justify-center gap-1 px-1.5 h-full transition-all duration-200 ease-out active:scale-95 cursor-pointer ${
          active ? 'text-[var(--accent)]' : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
        }`}
      >
        {active && (
          <motion.div
            layoutId="sc-tab-active-rail"
            className="absolute top-0 left-1/2 z-10 h-[3px] w-8 -translate-x-1/2 rounded-b-md bg-[var(--accent)]"
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
          />
        )}
        <Icon
          className={`h-5 w-5 shrink-0 transition-opacity duration-200 relative z-10 ${
            active ? 'opacity-100 text-[var(--accent)]' : 'opacity-55 group-hover:opacity-90'
          }`}
          strokeWidth={active ? 2.25 : 1.65}
          aria-hidden
        />
        <span
          className={`text-[10px] leading-none tracking-tight text-center truncate max-w-[4.5rem] relative z-10 ${
            active ? 'font-semibold' : 'font-medium'
          }`}
        >
          {t(labelKey)}
        </span>
      </button>
    );
  };

  const bar = (
    <nav
      data-student-tab-bar="true"
      className="fixed inset-x-0 bottom-0 z-30 pointer-events-none flex flex-col touch-pan-y"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label={t('scNavHome')}
    >
      <div
        className="flex flex-1 items-center justify-center px-3 sm:px-6 pointer-events-none"
        style={{
          minHeight: `calc(${STUDENT_TAB_BAR_HEIGHT} + 2 * ${STUDENT_TAB_BAR_FOOTER_PADDING})`,
        }}
      >
        <div className="pointer-events-auto w-full max-w-md sm:max-w-lg mx-auto flex items-center gap-4 relative">
          <div
            className="relative flex items-center justify-between flex-1 min-w-0 overflow-hidden rounded-full px-2 bg-[color-mix(in_srgb,var(--card-bg)_70%,transparent)] backdrop-blur-xl backdrop-saturate-150 border border-[color-mix(in_srgb,var(--ink)_7%,transparent)] shadow-[0_12px_36px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.3)]"
            style={{ height: STUDENT_TAB_BAR_HEIGHT }}
            role="presentation"
          >
            {STUDENT_BOTTOM_TABS.map(renderTab)}
          </div>

          {onOpenBooking && (
            <button
              type="button"
              onClick={onOpenBooking}
              aria-label={t('bookNow')}
              title={t('bookNow')}
              className={`relative z-20 group shrink-0 flex items-center justify-center cursor-pointer transition-all duration-200 ease-out active:scale-90 hover:scale-105 ${
                instructorPickerOpen ? 'scale-105' : ''
              }`}
            >
              <div
                className={`relative flex items-center justify-center size-[3.75rem] rounded-full bg-gradient-to-br from-[#34C759] to-[#28CD41] dark:from-[#30D158] dark:to-[#24B248] text-white transition-all ${
                  instructorPickerOpen
                    ? 'border-2 border-white ring-2 ring-[#30D158] ring-offset-2 ring-offset-black/20 shadow-[0_8px_28px_rgba(48,209,88,0.7)]'
                    : 'shadow-[0_8px_20px_rgba(52,199,89,0.38),0_3px_10px_rgba(0,0,0,0.14),inset_0_1.5px_1.5px_rgba(255,255,255,0.45)] hover:shadow-[0_10px_24px_rgba(48,209,88,0.5),0_4px_12px_rgba(0,0,0,0.18),inset_0_1.5px_1.5px_rgba(255,255,255,0.55)]'
                }`}
              >
                <CalendarPlus className="size-6 shrink-0 stroke-[2.2]" aria-hidden />
              </div>
            </button>
          )}
        </div>
      </div>
    </nav>
  );

  if (typeof document === 'undefined') return bar;

  return createPortal(bar, document.body);
};

export const ScDivider: React.FC = () => (
  <div className="py-2" aria-hidden>
    <div className="h-px w-full bg-[var(--border-subtle)]" />
  </div>
);

/** Page-level typography aligned to cabinet Editorial List (V1). */
export const SC_PAGE_TITLE_CLASS =
  'text-4xl font-serif font-light tracking-tight text-[var(--ink)] leading-[1.15]';
export const SC_PAGE_SUBTITLE_CLASS = 'text-base text-[var(--ink-dim)]';
export const SC_SECTION_TITLE_CLASS = 'font-serif text-xl font-light tracking-tight';

export const ScPageTitle: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <h1 className={`${SC_PAGE_TITLE_CLASS} ${className}`}>{children}</h1>
);

export const ScPageHeader: React.FC<{
  title: string;
  subtitle?: string;
}> = ({ title, subtitle }) => (
  <div className="space-y-3">
    <ScPageTitle>{title}</ScPageTitle>
    {subtitle ? <p className={SC_PAGE_SUBTITLE_CLASS}>{subtitle}</p> : null}
  </div>
);

/** Consistent back-link → title spacing (Editorial List V1: ~2rem). */
export const SC_PAGE_INTRO_CLASS = 'flex flex-col gap-8';

export const ScPageIntro: React.FC<{
  onBack?: () => void;
  backLabelKey?: TranslationKey;
  backLabel?: string;
  title: string;
  subtitle?: string;
}> = ({ onBack, backLabelKey, backLabel, title, subtitle }) => (
  <div className={SC_PAGE_INTRO_CLASS}>
    {onBack ? (
      <StudentPanelBackLink onClick={onBack} labelKey={backLabelKey} label={backLabel} />
    ) : null}
    <ScPageHeader title={title} subtitle={subtitle} />
  </div>
);

/** @deprecated Prefer ScPageHeader — kept as alias for hub screens. */
export const ScEditorialHubHeader = ScPageHeader;

/** Flush editorial hub list (Stitch V1) — no outer card, soft bottom rules, circular icons. */
export type ScEditorialHubItem = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  onClick: () => void;
};

export const ScEditorialHubList: React.FC<{ items: ScEditorialHubItem[] }> = ({ items }) => (
  <div className="flex flex-col -mx-4 sm:-mx-6">
    {items.map((item) => {
      const Icon = item.icon;
      return (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          className="group w-full flex items-center gap-4 px-4 sm:px-6 py-6 min-h-12 text-left border-b border-[var(--border-subtle)] hover:bg-[var(--profile-bg)]/50 transition-colors"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--profile-bg)] text-[var(--ink)] group-hover:bg-[var(--accent-muted)] group-hover:text-[var(--accent)] transition-colors">
            <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            <span className={`block ${SC_SECTION_TITLE_CLASS} text-[var(--ink)] mb-1 truncate`}>
              {item.label}
            </span>
            <span className="block text-sm text-[var(--ink-dim)] truncate">{item.description}</span>
          </span>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-[var(--ink-dim)] group-hover:text-[var(--ink)] transition-colors"
            aria-hidden
          />
        </button>
      );
    })}
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
  <h2 className={`${SC_SECTION_TITLE_CLASS} ${tint ? SC_TINT_VALUE[tint] : 'text-[var(--ink)]'}`}>
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
