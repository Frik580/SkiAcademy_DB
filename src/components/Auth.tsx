import React, { useState } from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithPopup,
  doc,
  setDoc,
  getDoc,
  handleFirestoreError,
  OperationType,
  migratePreExistingProfile,
} from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { UserProfile } from '../types';
import { LogIn, UserPlus, Mail, Lock, Phone, User as UserIcon } from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage } from '../lib/LanguageContext';
import { logger } from '../lib/logger';

interface AuthProps {
  onSuccess: (profile: UserProfile) => void;
}

const PRESET_SEEDS = ['Felix', 'Aneka', 'Jack', 'Buster', 'Bella', 'Luna'];

export const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
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
        const credentials = await createUserWithEmailAndPassword(auth, email, password);
        const user = credentials.user;

        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migratePreExistingProfile(user.uid, email, displayName);
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
            balanceUSD: 250, // Starter credits
            isClientActive: true,
            level: 1,
            hasCompletedOnboarding: false,
          };
          if (phoneNumber) {
            finalProfile.phoneNumber = phoneNumber;
          }

          const userPath = `users/${user.uid}`;
          try {
            await setDoc(doc(db, 'users', user.uid), finalProfile);
          } catch (dbErr) {
            handleFirestoreError(dbErr, OperationType.WRITE, userPath);
          }
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
        const credentials = await signInWithEmailAndPassword(auth, email, password);
        const user = credentials.user;

        // Check for and migrate pre-existing profile first to support self-healing
        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migratePreExistingProfile(user.uid, user.email || email);
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
          const userRef = doc(db, 'users', user.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch (dbErr) {
            handleFirestoreError(dbErr, OperationType.GET, `users/${user.uid}`);
          }

          if (userSnap && userSnap.exists()) {
            const profile = userSnap.data() as UserProfile;
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
              balanceUSD: 250,
              isClientActive: true,
              level: 1,
            };
            try {
              await setDoc(doc(db, 'users', user.uid), fallbackProfile);
            } catch (dbErr) {
              handleFirestoreError(dbErr, OperationType.WRITE, `users/${user.uid}`);
            }
            addNotification('info', t('authProfileSetup'), t('authProfileCreated'));
            onSuccess(fallbackProfile);
          }
        }
      }
    } catch (err: any) {
      logger.error(err);
      const errCode = err.code || '';
      const errMessage = err.message || '';

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
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userRef = doc(db, 'users', user.uid);
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.GET, `users/${user.uid}`);
      }

      if (userSnap && userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        addNotification(
          'success',
          t('authLoggedIn'),
          `${t('authWelcomeBackName')} ${profile.displayName}!`
        );
        onSuccess(profile);
      } else {
        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migratePreExistingProfile(
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
            balanceUSD: 250,
            isClientActive: true,
            level: 1,
            hasCompletedOnboarding: false,
          };

          try {
            await setDoc(doc(db, 'users', user.uid), finalProfile);
          } catch (dbErr) {
            handleFirestoreError(dbErr, OperationType.WRITE, `users/${user.uid}`);
          }
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
    } catch (err: any) {
      logger.error(err);
      if (err.code === 'auth/popup-blocked') {
        const popupMsg = t('authPopupBlockedDesc');
        setError(popupMsg);
        addNotification('error', t('authPopupBlocked'), popupMsg);
      } else if (err.code === 'auth/network-request-failed') {
        const netMsg = t('authNetworkError');
        setError(netMsg);
        addNotification('error', t('authNetworkErrorTitle'), netMsg);
      } else if (err.code !== 'auth/popup-closed-by-user') {
        setError(t('authGoogleInterrupted'));
        addNotification('error', t('authGoogleInterruptedTitle'), err.message);
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
      await sendPasswordResetEmail(auth, email);
      addNotification(
        'success',
        t('authResetEmailSent'),
        `${t('authResetEmailPrefix')} ${email}, ${t('authResetEmailSuffix')}`
      );
      setIsForgotPassword(false);
    } catch (err: any) {
      logger.error('Password reset error:', err);
      const errorMsg =
        err.code === 'auth/user-not-found'
          ? t('authUserNotFound')
          : `${t('authErrorLabel')} ${err.message}`;
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col bg-transparent animate-fade-in">
      <div className="p-6 md:p-8 flex flex-col justify-center bg-transparent">
        <div className="max-w-md w-full mx-auto space-y-6">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-serif font-light text-[var(--ink)] tracking-tight theme-air:text-3xl">
              {isForgotPassword
                ? t('authResetPassword')
                : isSignUp
                  ? t('signUpTitle')
                  : t('welcomeTitle')}
            </h2>
            <p className="ui-section-eyebrow mt-2 leading-relaxed">
              {isForgotPassword
                ? t('authResetPasswordSub')
                : isSignUp
                  ? t('signUpSub')
                  : t('welcomeSub')}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/20 border border-red-900/40 text-[10px] font-mono text-red-400 uppercase tracking-wider leading-normal theme-air:rounded-[var(--radius-md)] theme-air:font-sans theme-air:normal-case theme-air:text-sm theme-air:border-red-500/20 theme-air:bg-red-500/10">
              {error}
            </div>
          )}

          <form
            onSubmit={isForgotPassword ? handlePasswordReset : handleSubmit}
            className="space-y-4"
          >
            {isForgotPassword ? (
              <>
                <div className="space-y-1.5">
                  <label className="ui-label">
                    {t('emailAddress')}
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="ui-field focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                    />
                    <Mail className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  {t('authSendRecoveryLink')}
                </button>
              </>
            ) : (
              <>
                {isSignUp && (
                  <>
                    <div className="space-y-1.5">
                      <label className="ui-label">
                        {t('fullName')}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder={t('authNamePlaceholder')}
                          className="ui-field focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                        />
                        <UserIcon className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      </div>
                      <p className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1">
                        {t('authNameHint')}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="ui-label">
                        {t('phoneOptional')}
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          className="ui-field focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                        />
                        <Phone className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    {/* Avatar Selection Block */}
                    <div className="space-y-2 pt-3 ui-divider-t">
                      <div className="flex justify-between items-center">
                        <label className="ui-label">
                          {t('authChooseAvatar')}
                        </label>
                        <button
                          type="button"
                          onClick={handleRandomizeAvatar}
                          className="text-[10px] font-mono font-bold text-[var(--ink)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
                        >
                          🎲 {t('authRandomize')}
                        </button>
                      </div>

                      {/* Avatar Previews Grid */}
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

                      {/* Custom Seed input */}
                      <div className="relative mt-2">
                        <input
                          type="text"
                          value={avatarSeed}
                          onChange={(e) => setAvatarSeed(e.target.value)}
                          placeholder={t('authAvatarSeedPlaceholder')}
                          className="ui-field-plain pl-8 focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-dim)] pointer-events-none">
                          ✨
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <label className="ui-label">
                    {t('emailAddress')}
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="ui-field focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                    />
                    <Mail className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="ui-label">
                      {t('password')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError('');
                      }}
                      className="text-[10px] font-mono font-bold text-[var(--ink-dim)] hover:text-[var(--ink)] hover:underline bg-transparent border-0 p-0 outline-none cursor-pointer"
                    >
                      {t('authForgotPassword')}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="ui-field focus:outline-none focus:border-[var(--ink)] theme-air:focus:border-[var(--accent)]"
                    />
                    <Lock className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
                >
                  {isSignUp ? (
                    <>
                      <UserPlus className="w-4 h-4" />
                      {t('signUpBtn')}
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      {t('signInBtn')}
                    </>
                  )}
                </button>
              </>
            )}
          </form>

          {!isForgotPassword && (
            <>
              {/* Social Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="h-[1px] bg-[var(--border)] flex-1" />
                <span className="text-[9px] font-mono font-bold text-[var(--ink-dim)] uppercase tracking-widest">
                  {t('orContinueWith')}
                </span>
                <div className="h-[1px] bg-[var(--border)] flex-1" />
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="btn-secondary w-full py-2.5 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.529-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.245-3.125C18.465 2.1 15.62 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.977 0-.738-.078-1.3-.177-1.785H12.24z" />
                </svg>
                {t('googleSignIn')}
              </button>
            </>
          )}

          <div className="text-center pt-2">
            {isForgotPassword ? (
              <button
                onClick={() => {
                  setIsForgotPassword(false);
                  setError('');
                }}
                className="text-[10px] font-mono uppercase tracking-widest font-bold text-[var(--ink)] hover:underline transition cursor-pointer"
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
                className="text-[10px] font-mono uppercase tracking-widest font-bold text-[var(--ink)] hover:underline transition cursor-pointer"
              >
                {isSignUp ? t('haveAccount') : t('noAccount')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
