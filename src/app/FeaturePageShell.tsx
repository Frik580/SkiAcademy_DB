import React, { useLayoutEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FeaturePageShellProps {
  isPaddedWorkspace: boolean;
  isHomeRoute: boolean;
  isAuthenticated: boolean;
  dbStatusWarning: string | null;
  onDismissDbWarning: () => void;
  children: React.ReactNode;
}

/** Shared application frame; route content remains independent from global chrome. */
export const FeaturePageShell: React.FC<FeaturePageShellProps> = ({
  isPaddedWorkspace,
  isHomeRoute,
  isAuthenticated,
  dbStatusWarning,
  onDismissDbWarning,
  children,
}) => {
  const mainRef = useRef<HTMLElement>(null);
  const warningRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const warning = warningRef.current;
    if (!main || !isHomeRoute || !warning) return;
    const syncWarningHeight = () => {
      const style = getComputedStyle(warning);
      const margins = parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      main.style.setProperty(
        '--home-warning-height',
        `${warning.getBoundingClientRect().height + margins}px`
      );
    };
    syncWarningHeight();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncWarningHeight);
    observer?.observe(warning);
    return () => {
      observer?.disconnect();
      main.style.removeProperty('--home-warning-height');
    };
  }, [isHomeRoute, dbStatusWarning]);

  return (
    <>
      <main
        ref={mainRef}
        className={`flex-1 w-full mx-auto ${isHomeRoute ? 'home-page-shell' : ''} ${
          isPaddedWorkspace && isAuthenticated ? 'p-6 overflow-y-auto' : 'flex flex-col'
        }`}
      >
        {dbStatusWarning && (
          <div
            ref={warningRef}
            className="page-status-warning lg:col-span-3 bg-amber-950/40 border border-amber-900/60 text-amber-200 p-4 rounded-none type-caption font-medium flex items-center justify-between gap-3 animate-fade-in shrink-0 m-4"
          >
            <div className="flex min-w-0 items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="[overflow-wrap:anywhere]">{dbStatusWarning}</span>
            </div>
            <button
              onClick={onDismissDbWarning}
              className="text-amber-500 hover:text-amber-200 type-button"
            >
              ×
            </button>
          </div>
        )}

        {children}
      </main>

      <footer
        className={`ui-footer ui-site-footer border-t border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--profile-bg)]/40 ${
          isHomeRoute ? '' : 'max-[1199px]:hidden'
        }`}
      >
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 type-caption text-[var(--ink-dim)]">
            <div>© {new Date().getFullYear()} Carve Academy</div>
            <div className="flex items-center gap-4 type-caption">
              <span className="hover:text-[var(--ink)] transition-colors cursor-default">
                Ski & Snowboard Instruction
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
};
