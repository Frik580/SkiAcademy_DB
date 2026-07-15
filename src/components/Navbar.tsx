import React from 'react';
import { UserProfile } from '../types';
import { LogOut, Plus, Bell, Sun, Moon, Mountain } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

interface NavbarProps {
  userProfile: UserProfile | null;
  onOpenTopUp: () => void;
  onOpenNotifications: () => void;
  onToggleAdminView: () => void;
  isAdminView: boolean;
  onSignOut: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  userProfile,
  onOpenTopUp,
  onOpenNotifications,
  onToggleAdminView,
  isAdminView,
  onSignOut,
  theme,
  onToggleTheme
}) => {
  const { t, language, setLanguage } = useLanguage();

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg)] border-b border-[var(--border)] px-6 py-4 transition-colors duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand logo */}
        <div className="flex items-center gap-2 select-none">
          <Mountain className="w-5 h-5 text-sky-600 dark:text-sky-400 stroke-[2.5]" />
          <div className="flex items-baseline">
            <h1 className="font-sans font-extrabold tracking-tight text-[var(--ink)] text-lg leading-none uppercase">
              CARVE
            </h1>
            <span className="font-serif italic font-light text-[var(--ink)] text-xl ml-1 leading-none lowercase">
              Academy
            </span>
          </div>
        </div>

        {/* Global actions + User state details */}
        <div className="flex items-center gap-3 md:gap-6 font-mono text-xs tracking-wider">
          {/* Theme Switch Button */}
          <button
            onClick={onToggleTheme}
            className="p-1 border border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)] transition cursor-pointer"
            title={theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}
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
            title={language === 'en' ? 'Переключить на русский' : 'Switch to English'}
          >
            [{language.toUpperCase()}]
          </button>

          {userProfile && (
            <>
              {/* Admin Toggle button */}
              {userProfile.role === 'admin' && (
                <button
                  onClick={onToggleAdminView}
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
                <span className="text-[var(--ink-dim)] uppercase hidden sm:inline">{t('balance')}:</span>
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
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full ring-1 ring-[var(--bg)] animate-pulse" />
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
      </div>
    </header>
  );
};
