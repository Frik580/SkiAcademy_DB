import React, { useLayoutEffect, useRef, useState } from 'react';
import { UserProfile } from '../types';
import { LogOut, Bell, Sun, Moon, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/LanguageContext';
import { useCurrency } from '../lib/CurrencyContext';
import { getUserLevelBadgeClass } from '../lib/courseLevelStyles';
import { isInstructorWorkspaceUser, getDefaultWorkspacePath } from '../lib/workspaceRoutes';
import { Logo } from './Logo';
import { useAuthStore, selectEffectiveBalance } from '../store/authStore';

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
  const effectiveBalance = useAuthStore(selectEffectiveBalance);
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminView = location.pathname === '/admin';
  const isCabinetView =
    location.pathname === '/cabinet' || location.pathname.startsWith('/cabinet/');
  const isInstructorView = location.pathname === '/instructor';
  const showInstructorNav = !!userProfile && isInstructorWorkspaceUser(userProfile);
  const showClientNav = showInstructorNav || userProfile?.role === 'admin';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hasUnreadNotifications = unreadNotificationCount > 0;
  const badgeLabel = unreadNotificationCount > 9 ? '9+' : unreadNotificationCount.toString();
  const notificationButtonTitle = hasUnreadNotifications
    ? `${t('newNotifications')} (${unreadNotificationCount})`
    : t('notifications');

  const headerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const syncNavbarHeight = () => {
      document.documentElement.style.setProperty('--app-navbar-height', `${el.offsetHeight}px`);
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
    <header
      ref={headerRef}
      className="ui-navbar sticky top-0 z-40 px-4 sm:px-6 py-3 transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        <Link
          to={
            userProfile && userProfile.role !== 'admin' ? getDefaultWorkspacePath(userProfile) : '/'
          }
          className="flex items-center select-none shrink-0"
        >
          <Logo theme={theme} className="h-8 sm:h-9 md:h-10" />
        </Link>

        <div className="hidden lg:flex items-center gap-1.5 xl:gap-3 font-mono text-xs tracking-wider">
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

          <button
            onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
            className="ui-icon-btn px-2.5 sm:px-3 font-mono text-[10px] theme-air:font-sans theme-air:text-xs xl:theme-air:text-sm theme-air:normal-case shrink-0"
            title={t('switchLanguage')}
          >
            {language === 'en' ? 'EN' : 'RU'}
          </button>

          {!userProfile && onSignInClick && (
            <button
              onClick={onSignInClick}
              className="px-3 xl:px-4 py-1.5 xl:py-2 btn-primary whitespace-nowrap"
            >
              {t('signInBtn')}
            </button>
          )}

          {userProfile && (
            <>
              {showClientNav && (
                <Link
                  to="/cabinet"
                  className={`px-3 xl:px-4 py-1.5 xl:py-2 transition text-[10px] font-mono uppercase tracking-widest theme-air:font-sans theme-air:normal-case theme-air:text-xs xl:theme-air:text-sm theme-air:tracking-normal rounded-none theme-air:rounded-full no-underline whitespace-nowrap ${
                    isCabinetView
                      ? 'bg-[var(--accent-muted)] text-[var(--accent)] theme-air:bg-[var(--accent-muted)]'
                      : 'bg-transparent border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] theme-air:border-none theme-air:bg-[var(--profile-bg)]'
                  }`}
                >
                  {t('clientCabinet')}
                </Link>
              )}

              {showInstructorNav && (
                <Link
                  to="/instructor"
                  className={`px-3 xl:px-4 py-1.5 xl:py-2 transition text-[10px] font-mono uppercase tracking-widest theme-air:font-sans theme-air:normal-case theme-air:text-xs xl:theme-air:text-sm theme-air:tracking-normal rounded-none theme-air:rounded-full no-underline whitespace-nowrap ${
                    isInstructorView
                      ? 'bg-[var(--accent-muted)] text-[var(--accent)] theme-air:bg-[var(--accent-muted)]'
                      : 'bg-transparent border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] theme-air:border-none theme-air:bg-[var(--profile-bg)]'
                  }`}
                >
                  {t('instructorWorkspaceTab')}
                </Link>
              )}

              {userProfile.role === 'admin' && (
                <button
                  onClick={() => navigate(isAdminView ? '/' : '/admin')}
                  className={`px-3 xl:px-4 py-1.5 xl:py-2 transition cursor-pointer text-[10px] font-mono uppercase tracking-widest theme-air:font-sans theme-air:normal-case theme-air:text-xs xl:theme-air:text-sm theme-air:tracking-normal rounded-none theme-air:rounded-full whitespace-nowrap ${
                    isAdminView
                      ? 'bg-amber-500 border border-amber-500 text-white hover:bg-amber-600 theme-air:border-none'
                      : 'bg-transparent border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] theme-air:border-none theme-air:bg-[var(--profile-bg)]'
                  }`}
                >
                  {isAdminView ? t('browseSlopes') : t('manageResort')}
                </button>
              )}

              <div className="flex items-center gap-1.5 xl:gap-2 select-none text-[11px] text-[var(--ink)] font-mono theme-air:font-sans theme-air:text-xs xl:theme-air:text-sm px-1 xl:px-2 whitespace-nowrap">
                <span className="text-[var(--ink-dim)] uppercase hidden xl:inline theme-air:normal-case">
                  {t('balance')}:
                </span>
                <span className="font-bold">{formatPrice(effectiveBalance)}</span>
              </div>

              <button
                onClick={onOpenNotifications}
                title={notificationButtonTitle}
                aria-label={notificationButtonTitle}
                className={`ui-icon-btn relative shrink-0 ${
                  hasUnreadNotifications
                    ? 'text-[var(--accent)] bg-[var(--accent)]/10 theme-air:bg-[var(--accent-muted)]'
                    : ''
                }`}
              >
                <Bell className={`w-4 h-4 ${hasUnreadNotifications ? 'animate-pulse' : ''}`} />
                {hasUnreadNotifications && (
                  <>
                    <span className="absolute -top-0.5 -right-0.5 min-w-[0.95rem] h-[0.95rem] px-0.5 bg-rose-500 text-white text-[9px] font-bold leading-none rounded-full ring-1 ring-[var(--bg)] flex items-center justify-center">
                      {badgeLabel}
                    </span>
                    <span className="absolute -top-0.5 -right-0.5 min-w-[0.95rem] h-[0.95rem] bg-rose-500 rounded-full animate-ping opacity-60" />
                  </>
                )}
              </button>

              <div className="flex items-center gap-2 xl:gap-3 pl-1 shrink-0">
                <div className="ui-avatar w-8 h-8 shrink-0">
                  <img
                    src={userProfile.avatarUrl}
                    alt={userProfile.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="hidden sm:flex items-center gap-2 text-left leading-none">
                  <span className="hidden 2xl:inline text-[10px] font-bold text-[var(--ink)] theme-air:text-sm theme-air:font-normal">
                    {userProfile.displayName.split(' ')[0]}
                  </span>
                  {!userProfile.hideProgressTracking && (
                    <span
                      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none ${getUserLevelBadgeClass(userProfile.level || 1)}`}
                    >
                      LEVEL {userProfile.level || 1}
                    </span>
                  )}
                </div>

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
            <div className="flex items-center gap-2 min-w-0">
              <div className="ui-avatar w-8 h-8 shrink-0">
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-bold text-[var(--ink)] truncate theme-air:text-sm theme-air:font-normal">
                  {userProfile.displayName.split(' ')[0]}
                </span>
                {!userProfile.hideProgressTracking && (
                  <span
                    className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none shrink-0 ${getUserLevelBadgeClass(userProfile.level || 1)}`}
                  >
                    LEVEL {userProfile.level || 1}
                  </span>
                )}
              </div>
            </div>
          )}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="ui-icon-btn text-[var(--ink)] shrink-0"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden absolute top-full left-0 w-full bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border-subtle)] p-6 sm:p-8 flex flex-col gap-5 sm:gap-6 shadow-xl z-50 max-h-[calc(100dvh-var(--app-navbar-height,60px))] overflow-y-auto"
            >
              {userProfile && (
                <>
                  {showClientNav && (
                    <Link
                      to="/cabinet"
                      onClick={() => setIsMenuOpen(false)}
                      className={`w-full px-4 py-3 transition text-xs font-mono uppercase tracking-widest rounded-none theme-air:rounded-full theme-air:font-sans theme-air:normal-case no-underline text-center ${
                        isCabinetView
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'bg-[var(--profile-bg)] border border-[var(--border)] text-[var(--ink)] theme-air:border-none'
                      }`}
                    >
                      {t('clientCabinet')}
                    </Link>
                  )}

                  {showInstructorNav && (
                    <Link
                      to="/instructor"
                      onClick={() => setIsMenuOpen(false)}
                      className={`w-full px-4 py-3 transition text-xs font-mono uppercase tracking-widest rounded-none theme-air:rounded-full theme-air:font-sans theme-air:normal-case no-underline text-center ${
                        isInstructorView
                          ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                          : 'bg-[var(--profile-bg)] border border-[var(--border)] text-[var(--ink)] theme-air:border-none'
                      }`}
                    >
                      {t('instructorWorkspaceTab')}
                    </Link>
                  )}

                  {userProfile.role === 'admin' && (
                    <button
                      onClick={() => {
                        navigate(isAdminView ? '/' : '/admin');
                        setIsMenuOpen(false);
                      }}
                      className={`w-full px-4 py-3 transition cursor-pointer text-xs font-mono uppercase tracking-widest rounded-none theme-air:rounded-full theme-air:font-sans theme-air:normal-case ${
                        isAdminView
                          ? 'bg-amber-500 border border-amber-500 text-white'
                          : 'bg-[var(--profile-bg)] border border-[var(--border)] text-[var(--ink)] theme-air:border-none'
                      }`}
                    >
                      {isAdminView ? t('browseSlopes') : t('manageResort')}
                    </button>
                  )}

                  <div className="flex items-center justify-between gap-2 text-sm text-[var(--ink)]">
                    <span className="text-[var(--ink-dim)]">{t('balance')}:</span>
                    <span className="font-bold">{formatPrice(effectiveBalance)}</span>
                  </div>

                  <button
                    onClick={() => {
                      onOpenNotifications();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex justify-between items-center text-sm text-[var(--ink)]"
                  >
                    <span className="flex items-center gap-2">
                      {t('notifications')}
                      {hasUnreadNotifications && (
                        <span className="min-w-[1.1rem] h-[1.1rem] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
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

              <div className="flex items-center justify-between text-sm text-[var(--ink)]">
                <span>{t(theme === 'light' ? 'lightTheme' : 'darkTheme')}</span>
                <button onClick={onToggleTheme} className="ui-icon-btn">
                  {theme === 'light' ? (
                    <Moon className="w-4 h-4" />
                  ) : (
                    <Sun className="w-4 h-4 text-amber-400" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between text-sm text-[var(--ink)]">
                <span>{t('languageLabel')}</span>
                <button
                  onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
                  className="ui-icon-btn px-3 text-xs"
                >
                  {language === 'en' ? 'EN' : 'RU'}
                </button>
              </div>
              {!userProfile && onSignInClick && (
                <button
                  onClick={() => {
                    onSignInClick();
                    setIsMenuOpen(false);
                  }}
                  className="w-full max-w-xs mx-auto mt-2 px-4 py-3 btn-primary text-sm text-center"
                >
                  {t('signInBtn')}
                </button>
              )}
              {userProfile && (
                <button
                  onClick={() => {
                    onSignOut();
                    setIsMenuOpen(false);
                  }}
                  className="w-full mt-2 px-4 py-3 text-rose-500 hover:bg-rose-500/10 transition cursor-pointer text-sm theme-air:rounded-full"
                >
                  {t('signOut')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};
