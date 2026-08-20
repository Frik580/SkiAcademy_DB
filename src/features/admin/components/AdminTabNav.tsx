import React from 'react';
import { useLanguage } from '../../../app/providers/LanguageContext';
import type { AdminTabId } from '../adminNavigation';
import { ADMIN_TAB_IDS, ADMIN_TAB_LABEL_KEYS } from '../adminNavigation';

interface AdminTabNavProps {
  activeTab: AdminTabId;
  onChange: (tab: AdminTabId) => void;
}

/** Sticky horizontal chips for admin top-level tabs (scrollable on mobile). */
export const AdminTabNav: React.FC<AdminTabNavProps> = ({ activeTab, onChange }) => {
  const { t } = useLanguage();

  return (
    <nav
      aria-label={t('adminTabsNavLabel')}
      className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[var(--bg)]/95 backdrop-blur-sm border-b border-[var(--border)]"
    >
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {ADMIN_TAB_IDS.map((tabId) => {
          const isActive = tabId === activeTab;
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => onChange(tabId)}
              aria-current={isActive ? 'page' : undefined}
              className={`shrink-0 px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest transition cursor-pointer ${
                isActive
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]'
                  : 'border-[var(--border)] text-[var(--ink-dim)] hover:border-[var(--ink)] hover:text-[var(--ink)] bg-transparent'
              }`}
            >
              {t(ADMIN_TAB_LABEL_KEYS[tabId])}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
