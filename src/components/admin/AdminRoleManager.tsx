import React, { useState } from 'react';
import { Shield, Search, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { UserProfile } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { canManageAdminRoles } from '../../lib/accessControl';

interface AdminRoleManagerProps {
  usersList: UserProfile[];
  currentUserProfile: UserProfile;
  onUpdateUserRole?: (targetUid: string, newRole: 'admin' | 'user') => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export const AdminRoleManager: React.FC<AdminRoleManagerProps> = ({
  usersList,
  currentUserProfile,
  onUpdateUserRole,
  onRequestConfirm,
}) => {
  const { t } = useLanguage();
  const { addNotification } = useNotifications();

  const [userSearchText, setUserSearchText] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);

  const canManageRoles = canManageAdminRoles(currentUserProfile);

  return (
    <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
            {t('adminRoleManagementTitle')}
          </h3>
          <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
            {t('adminRoleManagementSub')}
          </p>
        </div>
      </div>

      {!canManageRoles && (
        <div className="border border-[var(--border)] bg-black/5 dark:bg-white/5 text-[var(--ink)] p-4 text-xs font-mono flex items-start gap-2.5 rounded-none">
          <Shield className="w-4 h-4 shrink-0 mt-0.5 text-[var(--ink-dim)]" />
          <div>
            <p className="font-bold">{t('superAdminRequired')}</p>
            <p className="mt-1 text-[var(--ink-dim)] leading-relaxed">{t('superAdminRequiredDesc')}</p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 w-full min-w-0 overflow-hidden">
        <div className="lg:col-span-6 space-y-3 font-mono w-full min-w-0 overflow-hidden">
          <h4 className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
            {t('currentAdministrators')}
          </h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {usersList.filter((u) => u.role === 'admin').length === 0 ? (
              <div className="text-center py-6 border border-dashed border-[var(--border)] rounded-none text-xs text-[var(--ink-dim)]">
                {t('noAdministratorsFound')}
              </div>
            ) : (
              usersList
                .filter((u) => u.role === 'admin')
                .map((u) => (
                  <div
                    key={u.uid}
                    className="flex items-center justify-between p-3.5 border border-[var(--border)] bg-transparent transition rounded-none w-full min-w-0 overflow-hidden gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={u.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.uid}`}
                        referrerPolicy="no-referrer"
                        alt={u.displayName}
                        className="w-9 h-9 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)] shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[var(--ink)] block truncate">
                          {u.displayName || t('unnamedUser')}
                        </span>
                        <span className="text-[10px] text-[var(--ink-dim)] block leading-none mt-1 truncate">
                          {u.email}
                        </span>
                      </div>
                    </div>
                    {onUpdateUserRole && (
                      <button
                        disabled={!canManageRoles}
                        onClick={() => {
                          if (!canManageRoles) return;
                          const confirmMsg = `${t('revokeAdminConfirmPrefix')} ${u.email}?`;
                          onRequestConfirm(confirmMsg, async () => {
                            try {
                              await onUpdateUserRole(u.uid, 'user');
                            } catch {
                              // error is handled inside App.tsx
                            }
                          });
                        }}
                        className={`p-1.5 border border-transparent rounded-none transition ${!canManageRoles ? 'opacity-30 cursor-not-allowed' : 'text-rose-500 hover:border-rose-500/30 cursor-pointer'}`}
                        title={t('revokeAdmin')}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="lg:col-span-6 space-y-4 border border-[var(--border)] p-5 rounded-none bg-transparent w-full min-w-0 overflow-hidden">
          <div className="space-y-1 font-mono">
            <h4 className="text-xs font-bold text-[var(--ink)]">{t('appointNewAdmin')}</h4>
            <p className="text-[10px] text-[var(--ink-dim)]">{t('appointNewAdminSub')}</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newAdminEmail.trim() || !onUpdateUserRole || !canManageRoles) return;
              setIsPromoting(true);
              const matchedUser = usersList.find(
                (u) => u.email.toLowerCase() === newAdminEmail.trim().toLowerCase()
              );
              if (matchedUser) {
                try {
                  await onUpdateUserRole(matchedUser.uid, 'admin');
                  setNewAdminEmail('');
                } catch {
                  // Handled inside App.tsx
                }
              } else {
                addNotification('error', t('userNotFound'), t('userNotFoundDesc'));
              }
              setIsPromoting(false);
            }}
            className="flex flex-col sm:flex-row gap-2 font-mono w-full"
          >
            <input
              type="email"
              required
              disabled={!canManageRoles}
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder={t('enterUserEmail')}
              className={`flex-1 px-3 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none ${!canManageRoles ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button
              type="submit"
              disabled={isPromoting || !canManageRoles}
              className="py-2 px-3 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isPromoting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  {t('promoteBtn')}
                </>
              )}
            </button>
          </form>

          <div className="border-t border-[var(--border)] pt-3 space-y-2 font-mono">
            <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider block">
              {t('quickSearchSelect')}
            </span>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                disabled={!canManageRoles}
                value={userSearchText}
                onChange={(e) => setUserSearchText(e.target.value)}
                placeholder={t('filterNameEmail')}
                className={`w-full pl-9 pr-3 py-1.5 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none placeholder-[var(--ink-dim)] ${!canManageRoles ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>

            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {usersList
                .filter((u) => u.role !== 'admin')
                .filter((u) => {
                  if (!userSearchText) return true;
                  const search = userSearchText.toLowerCase();
                  return (
                    (u.displayName || '').toLowerCase().includes(search) ||
                    (u.email || '').toLowerCase().includes(search)
                  );
                })
                .slice(0, 10)
                .map((u) => (
                  <div
                    key={u.uid}
                    className="flex items-center justify-between p-2 hover:bg-black/5 dark:hover:bg-white/5 transition border border-transparent hover:border-[var(--border)] rounded-none w-full min-w-0 overflow-hidden gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={u.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.uid}`}
                        referrerPolicy="no-referrer"
                        alt={u.displayName}
                        className="w-7 h-7 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)] shrink-0"
                      />
                      <div className="leading-tight min-w-0">
                        <span className="text-[11px] font-bold text-[var(--ink)] block truncate">
                          {u.displayName || t('userRole')}
                        </span>
                        <span className="text-[9px] text-[var(--ink-dim)] block truncate">{u.email}</span>
                      </div>
                    </div>
                    {onUpdateUserRole && (
                      <button
                        disabled={!canManageRoles}
                        onClick={async () => {
                          if (!canManageRoles || !onUpdateUserRole) return;
                          try {
                            await onUpdateUserRole(u.uid, 'admin');
                          } catch {
                            // error is handled inside App.tsx
                          }
                        }}
                        className="px-2 py-1 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] text-[10px] font-bold rounded-none transition disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {t('makeAdmin')}
                      </button>
                    )}
                  </div>
                ))}
              {usersList.filter((u) => u.role !== 'admin').length === 0 && (
                <div className="text-center py-4 text-[10px] text-[var(--ink-dim)]">{t('noRegularUsers')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
