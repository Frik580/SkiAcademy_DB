import React, { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { UserProfile } from '../../../types';
import { useNotifications } from '../../../features/notifications';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { logger } from '../../../shared';
import {
  getUserProfileService,
  migrateExistingProfileService,
  requestPasswordResetService,
  saveUserProfileService,
  signInWithEmailService,
  signInWithGoogleService,
  signUpWithEmailService,
} from '../../../features/auth/authService';
import { useSettingsStore } from '../../../features/settings/settingsStore';

interface AuthProps {
  onSuccess: (profile: UserProfile) => void;
  variant?: 'default' | 'sidebar';
}

const PRESET_SEEDS = ['Felix', 'Aneka', 'Jack', 'Buster', 'Bella', 'Luna'];

export const Auth: React.FC<AuthProps> = ({ onSuccess, variant = 'default' }) => {
  const { addNotification } = useNotifications();
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarSeed, setAvatarSeed] = useState('Felix');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  const handleRandomizeAvatar = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let randSeed = '';
    for (let i = 0; i < 6; i++) {
      randSeed += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    randSeed = randSeed.charAt(0).toUpperCase() + randSeed.slice(1);
    setAvatarSeed(randSeed);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!displayName) {
          setError(t('authDisplayNameRequired'));
          setIsLoading(false);
          return;
        }

        const nameRegex = /^[a-zA-Zа-яА-ЯёЁ\s\-'\u00C0-\u017F]+$/;
        if (!nameRegex.test(displayName.trim())) {
          setError(t('authNameCharactersOnly'));
          setIsLoading(false);
          return;
        }

        // Register new user
        const user = await signUpWithEmailService(email, password);

        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migrateExistingProfileService(user.uid, email, displayName);
        } catch (err) {
          logger.warn('Could not check/migrate pre-existing profile', err);
        }

        if (!finalProfile) {
          finalProfile = {
            uid: user.uid,
            email: user.email || email,
            displayName,
            role: 'user',
            avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(avatarSeed)}`,
            balanceUSD: useSettingsStore.getState().starterCreditUsd,
            isClientActive: true,
            level: 1,
          };
          if (phoneNumber) {
            finalProfile.phoneNumber = phoneNumber;
          }

          await saveUserProfileService(finalProfile);
          addNotification('success', t('authWelcomeAcademy'), t('authRegisteredCredits'));
        } else {
          addNotification(
            'success',
            t('authWelcomeBack'),
            `${t('authLinkedProfileName')} "${displayName}" ${t('authWithBalance')} $${finalProfile.balanceUSD}.`
          );
        }

        onSuccess(finalProfile);
      } else {
        // Sign in existing user
        const user = await signInWithEmailService(email, password);

        // Check for and migrate pre-existing profile first to support self-healing
        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migrateExistingProfileService(user.uid, user.email || email);
        } catch (mErr) {
          logger.warn('Could not check/migrate pre-existing profile during sign-in', mErr);
        }

        if (finalProfile) {
          addNotification(
            'success',
            t('authWelcomeBack'),
            `${t('authLinkedProfileBalance')} $${finalProfile.balanceUSD} ${t('authMergedSuffix')}`
          );
          onSuccess(finalProfile);
        } else {
          const profile = await getUserProfileService(user.uid);
          if (profile) {
            addNotification(
              'success',
              t('authLoggedIn'),
              `${t('authWelcomeBackName')} ${profile.displayName}!`
            );
            onSuccess(profile);
          } else {
            const seed = (user.displayName || user.uid).replace(/\s+/g, '_').toLowerCase();
            const fallbackProfile: UserProfile = {
              uid: user.uid,
              email: user.email || email,
              displayName: user.displayName || 'Alpine Glider',
              role: 'user',
              avatarUrl:
                user.photoURL ||
                `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`,
              balanceUSD: useSettingsStore.getState().starterCreditUsd,
              isClientActive: true,
              level: 1,
            };
            await saveUserProfileService(fallbackProfile);
            addNotification('info', t('authProfileSetup'), t('authProfileCreated'));
            onSuccess(fallbackProfile);
          }
        }
      }
    } catch (err: unknown) {
      logger.error(err);
      const errCode = err instanceof FirebaseError ? err.code : '';
      const errMessage = err instanceof Error ? err.message : '';

      const isEmailAlreadyInUse =
        errCode === 'auth/email-already-in-use' || errMessage.includes('auth/email-already-in-use');
      const isWeakPassword =
        errCode === 'auth/weak-password' || errMessage.includes('auth/weak-password');
      const isInvalidCredential =
        errCode === 'auth/invalid-credential' ||
        errCode === 'auth/wrong-password' ||
        errCode === 'auth/user-not-found' ||
        errMessage.includes('auth/invalid-credential') ||
        errMessage.includes('auth/wrong-password') ||
        errMessage.includes('auth/user-not-found');
      const isOperationNotAllowed =
        errCode === 'auth/operation-not-allowed' ||
        errMessage.includes('auth/operation-not-allowed');
      const isNetworkError =
        errCode === 'auth/network-request-failed' ||
        errMessage.includes('auth/network-request-failed');

      let errMsg = t('authFailed');

      if (isEmailAlreadyInUse) {
        errMsg = t('authEmailInUse');
      } else if (isWeakPassword) {
        errMsg = t('authWeakPassword');
      } else if (isInvalidCredential) {
        errMsg = t('authInvalidCredential');
      } else if (isOperationNotAllowed) {
        errMsg = t('authOperationNotAllowed');
      } else if (isNetworkError) {
        errMsg = t('authNetworkError');
      } else {
        // Fallback to include details from the original error if any
        errMsg = `${t('authErrorPrefix')} ${errMessage || t('authVerifyCredentials')}`;
      }

      setError(errMsg);
      addNotification('error', t('authIssue'), errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const user = await signInWithGoogleService();

      const profile = await getUserProfileService(user.uid);
      if (profile) {
        addNotification(
          'success',
          t('authLoggedIn'),
          `${t('authWelcomeBackName')} ${profile.displayName}!`
        );
        onSuccess(profile);
      } else {
        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migrateExistingProfileService(
            user.uid,
            user.email || '',
            user.displayName || undefined
          );
        } catch (err) {
          logger.warn('Could not check/migrate pre-existing profile on Google login', err);
        }

        if (!finalProfile) {
          const seed = (user.displayName || user.uid).replace(/\s+/g, '_').toLowerCase();
          finalProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Alpine Glider',
            role: 'user',
            avatarUrl:
              user.photoURL ||
              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`,
            balanceUSD: useSettingsStore.getState().starterCreditUsd,
            isClientActive: true,
            level: 1,
          };

          await saveUserProfileService(finalProfile);
          addNotification('success', t('authWelcomeAcademy'), t('authGoogleLinkedCredits'));
        } else {
          const actualName = user.displayName || finalProfile.displayName;
          addNotification(
            'success',
            t('authWelcomeBack'),
            `${t('authGoogleProfileFound')} $${finalProfile.balanceUSD}, ${t('authLinkedToName')} "${actualName}".`
          );
        }
        onSuccess(finalProfile);
      }
    } catch (err: unknown) {
      logger.error(err);
      const errorCode = err instanceof FirebaseError ? err.code : '';
      const errorMessage = err instanceof Error ? err.message : t('authGoogleInterrupted');
      if (errorCode === 'auth/popup-blocked') {
        const popupMsg = t('authPopupBlockedDesc');
        setError(popupMsg);
        addNotification('error', t('authPopupBlocked'), popupMsg);
      } else if (errorCode === 'auth/network-request-failed') {
        const netMsg = t('authNetworkError');
        setError(netMsg);
        addNotification('error', t('authNetworkErrorTitle'), netMsg);
      } else if (errorCode !== 'auth/popup-closed-by-user') {
        setError(t('authGoogleInterrupted'));
        addNotification('error', t('authGoogleInterruptedTitle'), errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError(t('authEnterEmail'));
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordResetService(email);
      addNotification(
        'success',
        t('authResetEmailSent'),
        `${t('authResetEmailPrefix')} ${email}, ${t('authResetEmailSuffix')}`
      );
      setIsForgotPassword(false);
    } catch (err: unknown) {
      logger.error('Password reset error:', err);
      const errorCode = err instanceof FirebaseError ? err.code : '';
      const errorMessage = err instanceof Error ? err.message : '';
      const errorMsg =
        errorCode === 'auth/user-not-found'
          ? t('authUserNotFound')
          : `${t('authErrorLabel')} ${errorMessage}`;
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const isSidebar = variant === 'sidebar';
  const fieldClass =
    'ui-field-plain focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]';
  const sectionGap = isSidebar ? 'space-y-8' : 'space-y-6';
  const formGap = isSidebar ? 'space-y-5' : 'space-y-4';

  return (
    <div className={`flex flex-col bg-transparent animate-fade-in ${sectionGap}`}>
      <div className={isSidebar ? 'space-y-3' : 'space-y-2'}>
        <h2
          className={`font-serif font-light text-[var(--ink)] tracking-tight ${
            isSidebar ? 'text-3xl' : 'text-2xl theme-air:text-3xl'
          } ${isSidebar ? '' : 'text-center md:text-left'}`}
        >
          {isForgotPassword
            ? t('authResetPassword')
            : isSignUp
              ? t('signUpTitle')
              : t('welcomeTitle')}
        </h2>
        {!isForgotPassword && !isSignUp && (
          <div className={`space-y-1 ${isSidebar ? '' : 'text-center md:text-left'}`}>
            <p className="text-sm text-[var(--ink-dim)] leading-relaxed">{t('welcomeSub')}</p>
            <p className="text-sm text-[var(--ink-dim)] leading-relaxed">{t('welcomeSub2')}</p>
          </div>
        )}
        {!isForgotPassword && isSignUp && (
          <p
            className={`text-sm text-[var(--ink-dim)] leading-relaxed ${
              isSidebar ? '' : 'text-center md:text-left'
            }`}
          >
            {t('signUpSub')}
          </p>
        )}
        {isForgotPassword && (
          <p
            className={`text-sm text-[var(--ink-dim)] leading-relaxed ${
              isSidebar ? '' : 'text-center md:text-left'
            }`}
          >
            {t('authResetPasswordSub')}
          </p>
        )}
      </div>

      {!isForgotPassword && !isSignUp && (
        <div className="h-px bg-[var(--border)]" aria-hidden="true" />
      )}

      {error && (
        <div className="p-3 bg-red-950/20 border border-red-900/40 text-[10px] font-mono text-red-400 uppercase tracking-wider leading-normal theme-air:rounded-[var(--radius-md)] theme-air:font-sans theme-air:normal-case theme-air:text-sm theme-air:border-red-500/20 theme-air:bg-red-500/10">
          {error}
        </div>
      )}

      <form onSubmit={isForgotPassword ? handlePasswordReset : handleSubmit} className={formGap}>
        {isForgotPassword ? (
          <>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailAddress')}
              aria-label={t('emailAddress')}
              className={fieldClass}
            />

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5">
              {t('authSendRecoveryLink')}
            </button>
          </>
        ) : (
          <>
            {isSignUp && (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3 items-end">
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('fullName')}
                    aria-label={t('fullName')}
                    className={fieldClass}
                  />

                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder={t('phoneOptional')}
                    aria-label={t('phoneOptional')}
                    className={fieldClass}
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[var(--ink-dim)]">{t('authChooseAvatar')}</span>
                    <button
                      type="button"
                      onClick={handleRandomizeAvatar}
                      className="text-xs text-[var(--ink)] hover:underline cursor-pointer bg-transparent border-0 outline-none"
                    >
                      🎲 {t('authRandomize')}
                    </button>
                  </div>

                  <div className="grid grid-cols-6 gap-1.5">
                    {PRESET_SEEDS.map((seed) => {
                      const isSelected = avatarSeed === seed;
                      const url = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
                      return (
                        <button
                          key={seed}
                          type="button"
                          onClick={() => setAvatarSeed(seed)}
                          className={`relative aspect-square p-1 bg-black/10 border transition hover:scale-105 cursor-pointer theme-air:rounded-full theme-air:border-none theme-air:bg-[var(--profile-bg)] ${
                            isSelected
                              ? 'border-[var(--ink)] bg-black/25 theme-air:ring-2 theme-air:ring-[var(--accent)]'
                              : 'border-[var(--border)] hover:border-[var(--ink)] theme-air:hover:bg-[var(--accent-muted)]'
                          }`}
                        >
                          <img
                            src={url}
                            alt={seed}
                            className="w-full h-full object-contain filter grayscale"
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={avatarSeed}
                    onChange={(e) => setAvatarSeed(e.target.value)}
                    placeholder={t('authAvatarSeedPlaceholder')}
                    aria-label={t('authAvatarSeedPlaceholder')}
                    className={fieldClass}
                  />
                </div>
              </>
            )}

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailAddress')}
              aria-label={t('emailAddress')}
              className={fieldClass}
            />

            <div className="space-y-2">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('password')}
                aria-label={t('password')}
                className={fieldClass}
              />
              {!isSignUp && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError('');
                    }}
                    className="text-xs text-[var(--ink-dim)] hover:text-[var(--ink)] hover:underline bg-transparent border-0 p-0 outline-none cursor-pointer"
                  >
                    {t('authForgotPassword')}
                  </button>
                </div>
              )}
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5">
              {isSignUp ? t('signUpBtn') : t('signInBtn')}
            </button>
          </>
        )}
      </form>

      {!isForgotPassword && (
        <>
          <div className="h-px bg-[var(--border)]" aria-hidden="true" />

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.245-3.125C18.465 2.1 15.62 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.977 0-.738-.078-1.3-.177-1.785H12.24z" />
            </svg>
            {t('googleSignIn')}
          </button>
        </>
      )}

      <div className="text-center">
        {isForgotPassword ? (
          <button
            onClick={() => {
              setIsForgotPassword(false);
              setError('');
            }}
            className="text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] hover:underline transition cursor-pointer bg-transparent border-0"
          >
            {t('authBackToLogin')}
          </button>
        ) : (
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setIsForgotPassword(false);
              setError('');
            }}
            className="text-sm text-[var(--ink-dim)] hover:text-[var(--ink)] hover:underline transition cursor-pointer bg-transparent border-0"
          >
            {isSignUp ? t('haveAccount') : t('noAccount')}
          </button>
        )}
      </div>
    </div>
  );
};
