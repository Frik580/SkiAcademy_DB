import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { UserProfile } from '../../types';
import { LogOut, Bell, Sun, Moon, Menu, X, Settings, ChevronDown } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../app/providers/LanguageContext';
import { useCurrency } from '../../app/providers/CurrencyContext';
import { isInstructorWorkspaceUser, getDefaultWorkspacePath } from '../../lib/workspaceRoutes';
import { Logo } from './Logo';
import { LanguageSwitch } from './LanguageSwitch';
import { useEffectiveBalance, useWalletStore } from '../../features/wallet';
import {
  CabinetParticipantAvatarSwitcher,
  useNavbarParticipantSwitcher,
} from '../../features/student-cabinet/navbar';

interface NavbarProps {
  userProfile: UserProfile | null;
  onOpenNotifications: () => void;
  onSignOut: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignInClick?: () => void;
  unreadNotificationCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  userProfile,
  onOpenNotifications,
  onSignOut,
  theme,
  onToggleTheme,
  onSignInClick,
  unreadNotificationCount = 0,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const { formatPrice } = useCurrency();
  const effectiveBalance = useEffectiveBalance();
  const balanceLoaded = useWalletStore(
    (state) => state.canonicalWalletAccountId === userProfile?.uid && state.canonicalWalletLoaded
  );
  const balanceError = useWalletStore(
    (state) => state.canonicalWalletAccountId === userProfile?.uid && state.canonicalWalletError
  );
  const participantSwitcher = useNavbarParticipantSwitcher({
    accountId: userProfile?.uid,
    legacySelfAvatarUrl: userProfile?.avatarUrl,
  });
  const location = useLocation();
  const isHomeView = location.pathname === '/';
  const homeTopRef = useRef<HTMLDivElement>(null);
  const [isAtHomeTop, setIsAtHomeTop] = useState(true);
  const navigate = useNavigate();
  const isAdminView = location.pathname === '/admin';
  const isCabinetView =
    location.pathname === '/cabinet' || location.pathname.startsWith('/cabinet/');
  const isInstructorView = location.pathname === '/instructor';
  const showInstructorNav = !!userProfile && isInstructorWorkspaceUser(userProfile);
  const showClientNav = showInstructorNav || userProfile?.role === 'admin';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const hasUnreadNotifications = unreadNotificationCount > 0;
  const badgeLabel = unreadNotificationCount > 9 ? '9+' : unreadNotificationCount.toString();
  const notificationButtonTitle = hasUnreadNotifications
    ? `${t('newNotifications')} (${unreadNotificationCount})`
    : t('notifications');
  const formattedBalance = balanceLoaded ? formatPrice(effectiveBalance) : '—';
  const balanceStatus = balanceError
    ? t('walletBalanceLoadError')
    : balanceLoaded
      ? undefined
      : t('loading');
  const workspaceItems = [
    ...(showClientNav
      ? [{ to: '/cabinet', label: t('clientCabinet'), active: isCabinetView }]
      : []),
    ...(showInstructorNav
      ? [{ to: '/instructor', label: t('instructorWorkspaceTab'), active: isInstructorView }]
      : []),
  ];
  const activeWorkspaceLabel =
    workspaceItems.find((item) => item.active)?.label ?? workspaceItems[0]?.label;

  const headerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (!isHomeView || !homeTopRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsAtHomeTop(false);
      return;
    }
    setIsAtHomeTop(window.scrollY === 0);
    const observer = new IntersectionObserver(([entry]) => setIsAtHomeTop(entry.isIntersecting), {
      threshold: 1,
    });
    observer.observe(homeTopRef.current);
    return () => observer.disconnect();
  }, [isHomeView]);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const mobilePanelId = useId();
  const mobileMenuLabel = t('navigationMenu');
  const closeMobileMenu = useCallback(() => {
    const desktop = window.matchMedia?.('(min-width: 1024px)').matches;
    if (
      mobilePanelRef.current?.contains(document.activeElement) ||
      (desktop && document.activeElement === mobileTriggerRef.current)
    ) {
      const target = desktop ? logoRef.current : mobileTriggerRef.current;
      target?.focus({ preventScroll: true });
    }
    setIsMenuOpen(false);
  }, []);

  useLayoutEffect(() => {
    closeMobileMenu();
  }, [location.key, closeMobileMenu]);

  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeMobileMenu();
    };
    desktop?.addEventListener('change', onChange);
    return () => desktop?.removeEventListener('change', onChange);
  }, [closeMobileMenu]);

  useLayoutEffect(() => {
    // AnimatePresence retains the exiting panel: make its controls inactive immediately.
    const panel = mobilePanelRef.current;
    panel?.toggleAttribute('inert', !isMenuOpen);
    panel?.setAttribute('aria-hidden', String(!isMenuOpen));
  }, [isMenuOpen]);
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const [workspaceMenuLeft, setWorkspaceMenuLeft] = useState(0);

  useEffect(() => {
    setIsWorkspaceMenuOpen(false);
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!isWorkspaceMenuOpen) return;

    const syncWorkspaceMenuPosition = () => {
      const trigger = workspaceTriggerRef.current;
      if (!trigger) return;
      setWorkspaceMenuLeft(trigger.getBoundingClientRect().left);
    };

    syncWorkspaceMenuPosition();
    window.addEventListener('resize', syncWorkspaceMenuPosition);
    window.addEventListener('scroll', syncWorkspaceMenuPosition, true);

    return () => {
      window.removeEventListener('resize', syncWorkspaceMenuPosition);
      window.removeEventListener('scroll', syncWorkspaceMenuPosition, true);
    };
  }, [isWorkspaceMenuOpen]);

  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        workspaceTriggerRef.current?.contains(target) ||
        workspaceDropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsWorkspaceMenuOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isWorkspaceMenuOpen]);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const syncNavbarHeight = () => {
      // offsetHeight rounds fractional CSS pixels, leaving a gap below the sticky header.
      document.documentElement.style.setProperty(
        '--app-navbar-height',
        `${el.getBoundingClientRect().height}px`
      );
    };

    syncNavbarHeight();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncNavbarHeight) : null;
    ro?.observe(el);
    window.addEventListener('resize', syncNavbarHeight);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncNavbarHeight);
    };
  }, [isMenuOpen]);

  return (
    <>
      {isHomeView && <div ref={homeTopRef} className="home-header-sentinel" aria-hidden="true" />}
      {/* Delegate Escape from native navigation controls without making the disclosure a menu widget. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <nav
        aria-label={mobileMenuLabel}
        className={`sticky top-0 z-40 relative${isHomeView ? ' home-overlay-header shrink-0' : ''}`}
        data-transparent={isHomeView && isAtHomeTop && !isMenuOpen}
        onBlurCapture={(event) => {
          // CSS can hide the focused mobile control before the breakpoint listener runs.
          if (
            (!event.relatedTarget || event.relatedTarget.nodeType === Node.DOCUMENT_NODE) &&
            window.matchMedia?.('(min-width: 1024px)').matches &&
            (event.target === mobileTriggerRef.current ||
              mobilePanelRef.current?.contains(event.target))
          ) {
            setIsMenuOpen(false);
            // Native blur can finish after this handler; do not steal a newer focus target.
            queueMicrotask(() => {
              if (document.activeElement === document.body)
                logoRef.current?.focus({ preventScroll: true });
            });
          }
        }}
        onKeyDown={(event) => {
          if (isMenuOpen && event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            closeMobileMenu();
          }
        }}
      >
        <header
          ref={headerRef}
          className="ui-navbar px-4 sm:px-6 py-3 transition-colors duration-300"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
            <Link
              ref={logoRef}
              to={
                userProfile && userProfile.role !== 'admin'
                  ? getDefaultWorkspacePath(userProfile)
                  : '/'
              }
              className="flex items-center select-none shrink-0"
            >
              <Logo theme={theme} className="h-8 sm:h-9 md:h-10" />
            </Link>

            <div className="hidden lg:flex items-center gap-1.5 xl:gap-3 type-caption">
              {!userProfile && (
                <>
                  <button
                    onClick={onToggleTheme}
                    className="ui-icon-btn shrink-0"
                    title={t(theme === 'light' ? 'switchToDark' : 'switchToLight')}
                  >
                    {theme === 'light' ? (
                      <Moon className="w-4 h-4 text-[var(--ink)]" />
                    ) : (
                      <Sun className="w-4 h-4 text-amber-400" />
                    )}
                  </button>

                  <LanguageSwitch
                    language={language}
                    onChange={setLanguage}
                    label={t('switchLanguage')}
                  />

                  {onSignInClick && (
                    <button
                      onClick={onSignInClick}
                      className="px-3 xl:px-4 py-1.5 xl:py-2 btn-primary whitespace-nowrap"
                    >
                      {t('signInBtn')}
                    </button>
                  )}
                </>
              )}

              {userProfile && (
                <>
                  {workspaceItems.length > 0 && (
                    <button
                      ref={workspaceTriggerRef}
                      type="button"
                      onClick={() => setIsWorkspaceMenuOpen((open) => !open)}
                      aria-expanded={isWorkspaceMenuOpen}
                      aria-haspopup="menu"
                      className={`flex items-center gap-1.5 px-3 xl:px-4 py-1.5 xl:py-2 transition cursor-pointer normal-case type-nav rounded-full whitespace-nowrap shrink-0 ${
                        workspaceItems.some((item) => item.active)
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'bg-transparent border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] border-none bg-[var(--profile-bg)]'
                      }`}
                    >
                      <span>{activeWorkspaceLabel}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  )}

                  <div className="flex items-center gap-1.5 xl:gap-2 select-none text-[var(--ink)] type-caption px-1 xl:px-2 whitespace-nowrap">
                    <span className="text-[var(--ink-dim)] normal-case hidden xl:inline">
                      {t('balance')}:
                    </span>
                    <span className="font-bold" data-testid="navbar-balance" title={balanceStatus}>
                      {formattedBalance}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 xl:gap-3 pl-1 shrink-0">
                    <CabinetParticipantAvatarSwitcher
                      items={participantSwitcher.items}
                      selectedParticipantId={participantSwitcher.selectedParticipantId}
                      onSelect={participantSwitcher.selectParticipant}
                      fallbackDisplayName={userProfile.displayName}
                      fallbackAvatarUrl={userProfile.avatarUrl}
                      groupLabel={t('bookingParticipantsLabel')}
                      switchToParticipantLabel={t('switchToParticipant')}
                      showName
                    />

                    <button
                      onClick={onOpenNotifications}
                      title={notificationButtonTitle}
                      aria-label={notificationButtonTitle}
                      className={`ui-icon-btn relative shrink-0 ${
                        hasUnreadNotifications
                          ? 'text-[var(--accent)] bg-[var(--accent)]/10 bg-[var(--accent-muted)]'
                          : ''
                      }`}
                    >
                      <Bell
                        className={`w-4 h-4 ${hasUnreadNotifications ? 'animate-pulse' : ''}`}
                      />
                      {hasUnreadNotifications && (
                        <>
                          <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-0.5 bg-rose-500 text-white type-caption-sm rounded-full ring-1 ring-[var(--bg)] flex items-center justify-center">
                            {badgeLabel}
                          </span>
                          <span className="absolute -top-0.5 -right-0.5 min-w-[0.95rem] h-[0.95rem] bg-rose-500 rounded-full animate-ping opacity-60" />
                        </>
                      )}
                    </button>

                    <button
                      onClick={onToggleTheme}
                      className="ui-icon-btn shrink-0"
                      title={t(theme === 'light' ? 'switchToDark' : 'switchToLight')}
                    >
                      {theme === 'light' ? (
                        <Moon className="w-4 h-4 text-[var(--ink)]" />
                      ) : (
                        <Sun className="w-4 h-4 text-amber-400" />
                      )}
                    </button>

                    <LanguageSwitch
                      language={language}
                      onChange={setLanguage}
                      label={t('switchLanguage')}
                    />

                    {userProfile.role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => navigate(isAdminView ? '/' : '/admin')}
                        title={isAdminView ? t('browseSlopes') : t('manageResort')}
                        aria-label={isAdminView ? t('browseSlopes') : t('manageResort')}
                        className={`ui-icon-btn shrink-0 ${
                          isAdminView ? 'text-amber-500 bg-amber-500/10 bg-amber-500/15' : ''
                        }`}
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={onSignOut}
                      title={t('signOut')}
                      className="ui-icon-btn text-[var(--ink-dim)] hover:text-rose-500 shrink-0"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="lg:hidden flex items-center gap-2 sm:gap-3 min-w-0">
              {userProfile && (
                <CabinetParticipantAvatarSwitcher
                  items={participantSwitcher.items}
                  selectedParticipantId={participantSwitcher.selectedParticipantId}
                  onSelect={participantSwitcher.selectParticipant}
                  fallbackDisplayName={userProfile.displayName}
                  fallbackAvatarUrl={userProfile.avatarUrl}
                  groupLabel={t('bookingParticipantsLabel')}
                  switchToParticipantLabel={t('switchToParticipant')}
                />
              )}
              <button
                ref={mobileTriggerRef}
                type="button"
                aria-label={mobileMenuLabel}
                aria-expanded={isMenuOpen}
                aria-controls={mobilePanelId}
                onClick={() => setIsMenuOpen((open) => !open)}
                className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover:bg-[var(--accent-muted)] group-focus-visible:bg-[var(--accent-muted)]">
                  {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </span>
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {isWorkspaceMenuOpen && workspaceItems.length > 0 && (
            <m.div
              key="workspace-menu"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              style={{ top: 'var(--app-navbar-height, 60px)', left: workspaceMenuLeft }}
              className="ui-navbar-panel fixed z-50 hidden w-max lg:flex flex-col"
            >
              <div ref={workspaceDropdownRef} role="menu" className="flex flex-col py-1.5 px-1.5">
                {workspaceItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    onClick={() => setIsWorkspaceMenuOpen(false)}
                    className={`px-5 py-2.5 normal-case type-nav no-underline whitespace-nowrap transition ${
                      item.active
                        ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                        : 'text-[var(--ink)] hover:bg-[var(--profile-bg)]'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isMenuOpen && (
            <m.div
              ref={mobilePanelRef}
              id={mobilePanelId}
              role="region"
              aria-label={mobileMenuLabel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="ui-navbar-panel lg:hidden absolute top-[calc(100%+0.5rem)] left-2 right-2 min-[450px]:left-auto min-[450px]:w-[min(20rem,calc(100%-1rem))] sm:right-4 rounded-2xl p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 z-50 max-h-[calc(100dvh-var(--app-navbar-height,60px)-0.5rem)] overflow-y-auto shadow-[var(--shadow-soft)]"
            >
              {userProfile && (
                <>
                  {showClientNav && (
                    <Link
                      to="/cabinet"
                      onClick={closeMobileMenu}
                      className={`w-full min-h-11 px-4 py-2 transition type-nav rounded-full normal-case no-underline text-center flex items-center justify-center ${
                        isCabinetView
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'bg-[var(--profile-bg)] border border-[var(--border)] text-[var(--ink)] border-none'
                      }`}
                    >
                      {t('clientCabinet')}
                    </Link>
                  )}

                  {showInstructorNav && (
                    <Link
                      to="/instructor"
                      onClick={closeMobileMenu}
                      className={`w-full min-h-11 px-4 py-2 transition type-nav rounded-full normal-case no-underline text-center flex items-center justify-center ${
                        isInstructorView
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'bg-[var(--profile-bg)] border border-[var(--border)] text-[var(--ink)] border-none'
                      }`}
                    >
                      {t('instructorWorkspaceTab')}
                    </Link>
                  )}

                  {userProfile.role === 'admin' && (
                    <button
                      onClick={() => {
                        closeMobileMenu();
                        navigate(isAdminView ? '/' : '/admin');
                      }}
                      className={`w-full min-h-11 px-4 py-2 transition cursor-pointer type-nav rounded-full normal-case ${
                        isAdminView
                          ? 'bg-amber-500 border border-amber-500 text-white'
                          : 'bg-[var(--profile-bg)] border border-[var(--border)] text-[var(--ink)] border-none'
                      }`}
                    >
                      {isAdminView ? t('browseSlopes') : t('manageResort')}
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2 type-compact text-[var(--ink)]">
                    <span className="text-[var(--ink-dim)]">{t('balance')}:</span>
                    <span
                      className="font-bold"
                      data-testid="navbar-balance-mobile"
                      title={balanceStatus}
                    >
                      {formattedBalance}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      closeMobileMenu();
                      onOpenNotifications();
                    }}
                    className="w-full min-h-11 flex justify-between items-center type-nav text-[var(--ink)] cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      {t('notifications')}
                      {hasUnreadNotifications && (
                        <span className="min-w-5 h-5 px-1 bg-rose-500 text-white type-caption-sm rounded-full flex items-center justify-center">
                          {badgeLabel}
                        </span>
                      )}
                    </span>
                    <Bell
                      className={`w-4 h-4 ${hasUnreadNotifications ? 'text-[var(--accent)]' : ''}`}
                    />
                  </button>
                </>
              )}

              <div className="flex min-h-11 items-center justify-between type-compact text-[var(--ink)]">
                <span>{t(theme === 'light' ? 'lightTheme' : 'darkTheme')}</span>
                <button
                  onClick={onToggleTheme}
                  className="group flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  aria-label={t(theme === 'light' ? 'switchToDark' : 'switchToLight')}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full transition-colors group-hover:bg-[var(--accent-muted)] group-focus-visible:bg-[var(--accent-muted)]">
                    {theme === 'light' ? (
                      <Moon className="w-4 h-4" />
                    ) : (
                      <Sun className="w-4 h-4 text-amber-400" />
                    )}
                  </span>
                </button>
              </div>
              <div className="flex items-center justify-center py-1">
                <LanguageSwitch
                  language={language}
                  onChange={setLanguage}
                  label={t('switchLanguage')}
                />
              </div>
              {!userProfile && onSignInClick && (
                <button
                  onClick={() => {
                    closeMobileMenu();
                    onSignInClick();
                  }}
                  className="w-full min-h-11 mx-auto mt-1 px-4 py-2 btn-primary type-nav text-center"
                >
                  {t('signInBtn')}
                </button>
              )}
              {userProfile && (
                <button
                  onClick={() => {
                    closeMobileMenu();
                    onSignOut();
                  }}
                  className="w-full min-h-11 mt-1 px-4 py-2 text-rose-500 hover:bg-rose-500/10 transition cursor-pointer type-nav rounded-full"
                >
                  {t('signOut')}
                </button>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </nav>
    </>
  );
};
