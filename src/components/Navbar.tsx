import React, { useState } from 'react';
import { UserProfile } from '../types';
import { LogOut, Plus, Bell, Sun, Moon, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/LanguageContext';
import logoLight from '../assets/images/cropped1.png';
import logoDark from '../assets/images/cropped2.png';

interface NavbarProps {
  userProfile: UserProfile | null;
  onOpenTopUp: () => void;
  onOpenNotifications: () => void;
  onSignOut: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSignInClick?: () => void;
  unreadNotificationCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  userProfile,
  onOpenTopUp,
  onOpenNotifications,
  onSignOut,
  theme,
  onToggleTheme,
  onSignInClick,
  unreadNotificationCount = 0,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminView = location.pathname === '/admin';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const hasUnreadNotifications = unreadNotificationCount > 0;
  const badgeLabel = unreadNotificationCount > 9 ? '9+' : unreadNotificationCount.toString();
  const notificationButtonTitle = hasUnreadNotifications
    ? `${t('newNotifications')} (${unreadNotificationCount})`
    : t('notifications');

  return (
    <header className="ui-navbar sticky top-0 z-40 px-6 py-4 transition-colors duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center select-none">
          <img
            src={theme === 'light' ? logoLight : logoDark}
            alt="Carve Academy Logo"
            className="h-10 w-auto object-contain transition-opacity duration-300"
            referrerPolicy="no-referrer"
          />
        </Link>

        <div className="hidden md:flex items-center gap-2 md:gap-4 font-mono text-xs tracking-wider">
          <button
            onClick={onToggleTheme}
            className="ui-icon-btn"
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
            className="ui-icon-btn px-3 font-mono text-[10px] theme-air:font-sans theme-air:text-sm theme-air:normal-case"
            title={t('switchLanguage')}
          >
            {language === 'en' ? 'RU' : 'EN'}
          </button>

          {!userProfile && onSignInClick && (
            <button onClick={onSignInClick} className="px-4 py-2 btn-primary">
              {t('signInBtn')}
            </button>
          )}

          {userProfile && (
            <>
              {userProfile.role === 'admin' && (
                <button
                  onClick={() => navigate(isAdminView ? '/' : '/admin')}
                  className={`px-4 py-2 transition cursor-pointer text-[10px] font-mono uppercase tracking-widest theme-air:font-sans theme-air:normal-case theme-air:text-sm theme-air:tracking-normal rounded-none theme-air:rounded-full ${
                    isAdminView
                      ? 'bg-amber-500 border border-amber-500 text-white hover:bg-amber-600 theme-air:border-none'
                      : 'bg-transparent border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] theme-air:border-none theme-air:bg-[var(--profile-bg)]'
                  }`}
                >
                  {isAdminView ? t('browseSlopes') : t('manageResort')}
                </button>
              )}

              <div className="flex items-center gap-2 select-none text-[11px] text-[var(--ink)] font-mono theme-air:font-sans theme-air:text-sm px-2">
                <span className="text-[var(--ink-dim)] uppercase hidden sm:inline theme-air:normal-case">
                  {t('balance')}:
                </span>
                <span className="font-bold">${userProfile.balanceUSD.toFixed(2)}</span>
                <button
                  onClick={onOpenTopUp}
                  title={t('topUpSimulated')}
                  className="ui-icon-btn p-1"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2]" />
                </button>
              </div>

              <button
                onClick={onOpenNotifications}
                title={notificationButtonTitle}
                aria-label={notificationButtonTitle}
                className={`ui-icon-btn relative ${
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

              <div className="flex items-center gap-3 pl-1">
                <div className="ui-avatar w-8 h-8">
                  <img
                    src={userProfile.avatarUrl}
                    alt={userProfile.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="hidden lg:block text-left leading-none">
                  <span className="text-[10px] font-bold text-[var(--ink)] block theme-air:text-sm theme-air:font-normal">
                    {userProfile.displayName.split(' ')[0]}
                  </span>
                </div>

                <button
                  onClick={onSignOut}
                  title={t('signOut')}
                  className="ui-icon-btn text-[var(--ink-dim)] hover:text-rose-500"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="md:hidden flex items-center">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="ui-icon-btn text-[var(--ink)]">
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
              className="md:hidden absolute top-full left-0 w-full bg-[var(--bg)]/95 backdrop-blur-md border-b border-[var(--border-subtle)] p-8 flex flex-col gap-6"
            >
              {userProfile && (
                <>
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
                    <div className="flex items-center gap-2">
                      <span className="font-bold">${userProfile.balanceUSD.toFixed(2)}</span>
                      <button
                        onClick={() => {
                          onOpenTopUp();
                          setIsMenuOpen(false);
                        }}
                        className="ui-icon-btn"
                      >
                        <Plus className="w-4 h-4 stroke-[2]" />
                      </button>
                    </div>
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
                    <Bell className={`w-4 h-4 ${hasUnreadNotifications ? 'text-[var(--accent)]' : ''}`} />
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
                  {language === 'en' ? 'RU' : 'EN'}
                </button>
              </div>
              {!userProfile && onSignInClick && (
                <button
                  onClick={() => {
                    onSignInClick();
                    setIsMenuOpen(false);
                  }}
                  className="w-full mt-2 px-4 py-3 btn-primary text-sm text-center"
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
