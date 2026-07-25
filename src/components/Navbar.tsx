import React, { useState } from 'react';
import { UserProfile } from '../types';
import { LogOut, Plus, Bell, Sun, Moon, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
}

export const Navbar: React.FC<NavbarProps> = ({
  userProfile,
  onOpenTopUp,
  onOpenNotifications,
  onSignOut,
  theme,
  onToggleTheme,
  onSignInClick,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminView = location.pathname === '/admin';
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg)] border-b border-[var(--border)] px-6 py-3 transition-colors duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand logo */}
        <Link to="/" className="flex items-center select-none">
          <img
            src={theme === 'light' ? logoLight : logoDark}
            alt="Carve Academy Logo"
            className="h-10 w-auto object-contain transition-opacity duration-300"
            referrerPolicy="no-referrer"
          />
        </Link>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-3 md:gap-6 font-mono text-xs tracking-wider">
          {/* Theme Switch Button */}
          <button
            onClick={onToggleTheme}
            className="p-1 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition cursor-pointer"
            title={t(theme === 'light' ? 'switchToDark' : 'switchToLight')}
          >
            {theme === 'light' ? (
              <Moon className="w-3.5 h-3.5 text-[var(--ink)]" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            )}
          </button>

          {/* Language Switch Button */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
            className="px-2 py-1 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition cursor-pointer font-mono text-[10px]"
            title={t('switchLanguage')}
          >
            [{language === 'en' ? 'RU' : 'EN'}]
          </button>

          {!userProfile && onSignInClick && (
            <button onClick={onSignInClick} className="px-3 py-1 btn-primary">
              {t('signInBtn')}
            </button>
          )}

          {userProfile && (
            <>
              {/* Admin Toggle button */}
              {userProfile.role === 'admin' && (
                <button
                  onClick={() => navigate(isAdminView ? '/' : '/admin')}
                  className={`px-3 py-1 border transition cursor-pointer text-[10px] font-mono uppercase tracking-widest ${
                    isAdminView
                      ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                      : 'bg-transparent border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)]'
                  }`}
                >
                  {isAdminView ? t('browseSlopes') : t('manageResort')}
                </button>
              )}

              {/* Wallet details */}
              <div className="flex items-center gap-2 select-none text-[11px] text-[var(--ink)] font-mono">
                <span className="text-[var(--ink-dim)] uppercase hidden sm:inline">
                  {t('balance')}:
                </span>
                <span className="font-bold">${userProfile.balanceUSD.toFixed(2)}</span>
                <button
                  onClick={onOpenTopUp}
                  title={t('topUpSimulated')}
                  className="p-0.5 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition cursor-pointer"
                >
                  <Plus className="w-3 h-3 stroke-[2]" />
                </button>
              </div>

              {/* Notification button */}
              <button
                onClick={onOpenNotifications}
                className="p-1 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition relative cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[var(--accent)] rounded-full ring-1 ring-[var(--bg)]" />
              </button>

              {/* Profile Avatar and Sign Out */}
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border border-[var(--border)] overflow-hidden bg-slate-900 shrink-0">
                  <img
                    src={userProfile.avatarUrl}
                    alt={userProfile.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="hidden lg:block text-left leading-none">
                  <span className="text-[10px] font-bold text-[var(--ink)] block">
                    {userProfile.displayName.split(' ')[0]}
                  </span>
                </div>

                <button
                  onClick={onSignOut}
                  title={t('signOut')}
                  className="p-1 border border-[var(--border)] hover:border-rose-500 text-[var(--ink-dim)] hover:text-rose-500 transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center">
          <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1 text-[var(--ink)]">
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="md:hidden absolute top-full left-0 w-full bg-[var(--bg)] border-b border-[var(--border)] p-6 flex flex-col gap-6"
            >
              {userProfile && (
                <>
                  {/* Admin Toggle button */}
                  {userProfile.role === 'admin' && (
                    <button
                      onClick={() => {
                        navigate(isAdminView ? '/' : '/admin');
                        setIsMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 border transition cursor-pointer text-xs font-mono uppercase tracking-widest ${
                        isAdminView
                          ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                          : 'bg-transparent border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)]'
                      }`}
                    >
                      {isAdminView ? t('browseSlopes') : t('manageResort')}
                    </button>
                  )}

                  {/* Wallet details */}
                  <div className="flex items-center justify-between gap-2 select-none text-sm text-[var(--ink)] font-mono">
                    <span className="text-[var(--ink-dim)] uppercase">{t('balance')}:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">${userProfile.balanceUSD.toFixed(2)}</span>
                      <button
                        onClick={() => {
                          onOpenTopUp();
                          setIsMenuOpen(false);
                        }}
                        title={t('topUpSimulated')}
                        className="p-1 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4 stroke-[2]" />
                      </button>
                    </div>
                  </div>

                  {/* Notification button */}
                  <button
                    onClick={() => {
                      onOpenNotifications();
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex justify-between items-center text-sm font-mono uppercase text-[var(--ink)]"
                  >
                    <span>{t('notifications')}</span>
                    <div className="relative p-1">
                      <Bell className="w-4 h-4" />
                      <span className="absolute -top-0 -right-0 w-2 h-2 bg-[var(--accent)] rounded-full ring-1 ring-[var(--bg)]" />
                    </div>
                  </button>
                </>
              )}

              {/* Theme & Language Switchers */}
              <div className="flex items-center justify-between text-sm font-mono uppercase text-[var(--ink)]">
                <span>{t(theme === 'light' ? 'lightTheme' : 'darkTheme')}</span>
                <button
                  onClick={onToggleTheme}
                  className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition cursor-pointer"
                >
                  {theme === 'light' ? (
                    <Moon className="w-4 h-4" />
                  ) : (
                    <Sun className="w-4 h-4 text-amber-400" />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between text-sm font-mono uppercase text-[var(--ink)]">
                <span>{t('languageLabel')}</span>
                <button
                  onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
                  className="px-3 py-1.5 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition cursor-pointer font-mono text-xs"
                >
                  [{language === 'en' ? 'RU' : 'EN'}]
                </button>
              </div>
              {!userProfile && onSignInClick && (
                <button
                  onClick={() => {
                    onSignInClick();
                    setIsMenuOpen(false);
                  }}
                  className="w-full mt-2 px-3 py-2.5 btn-primary text-sm text-center"
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
                  className="w-full mt-2 px-3 py-2.5 border border-rose-500/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition cursor-pointer text-sm font-mono uppercase tracking-widest"
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
