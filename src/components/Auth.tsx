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
  migratePreExistingProfile
} from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { UserProfile } from '../types';
import { 
  LogIn, 
  UserPlus, 
  Mail, 
  Lock, 
  Phone, 
  User as UserIcon 
} from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage } from '../lib/LanguageContext';

interface AuthProps {
  onSuccess: (profile: UserProfile) => void;
}

const PRESET_SEEDS = ['Felix', 'Aneka', 'Jack', 'Buster', 'Bella', 'Luna'];

const ADMIN_EMAILS = ['admin@alpineglide.com', 'gerasimchuk.arseniy@gmail.com'];
const isAdminEmail = (emailStr?: string | null) => {
  if (!emailStr) return false;
  return ADMIN_EMAILS.includes(emailStr.toLowerCase());
};

export const Auth: React.FC<AuthProps> = ({ onSuccess }) => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
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
          setError(language === 'en' ? 'Display name is required' : 'Имя пользователя обязательно');
          setIsLoading(false);
          return;
        }

        const nameRegex = /^[a-zA-Zа-яА-ЯёЁ\s\-'\u00C0-\u017F]+$/;
        if (!nameRegex.test(displayName.trim())) {
          setError(
            language === 'en'
              ? 'Name must contain only English or Russian letters, spaces, and hyphens.'
              : 'Имя должно содержать только английские или русские буквы, пробелы и дефисы.'
          );
          setIsLoading(false);
          return;
        }

        // Register new user
        let user;
        try {
          const credentials = await createUserWithEmailAndPassword(auth, email, password);
          user = credentials.user;
        } catch (authErr) {
          throw authErr;
        }

        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migratePreExistingProfile(user.uid, email, displayName);
        } catch (err) {
          console.warn("Could not check/migrate pre-existing profile", err);
        }

        if (!finalProfile) {
          finalProfile = {
            uid: user.uid,
            email: user.email || email,
            displayName,
            role: isAdminEmail(user.email || email) ? 'admin' : 'user',
            avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(avatarSeed)}`,
            balanceUSD: 250, // Starter credits
            isClientActive: true
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
          addNotification('success', language === 'en' ? 'Welcome to Carve Academy!' : 'Добро пожаловать в Академию карвинга!', language === 'en' ? `Registered successfully. Enjoy your $250 starting credits!` : `Регистрация успешна! Получите стартовые $250 на счет!`);
        } else {
          addNotification('success', language === 'en' ? 'Welcome Back!' : 'С возвращением!', language === 'en' ? `Found and linked your pre-existing profile under name "${displayName}" with balance $${finalProfile.balanceUSD}.` : `Найден существующий профиль, привязан под именем "${displayName}" с балансом $${finalProfile.balanceUSD}.`);
        }

        onSuccess(finalProfile);
      } else {
        // Sign in existing user
        let user;
        try {
          const credentials = await signInWithEmailAndPassword(auth, email, password);
          user = credentials.user;
        } catch (authErr) {
          throw authErr;
        }

        // Check for and migrate pre-existing profile first to support self-healing
        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migratePreExistingProfile(user.uid, user.email || email);
        } catch (mErr) {
          console.warn("Could not check/migrate pre-existing profile during sign-in", mErr);
        }

        if (finalProfile) {
          addNotification('success', language === 'en' ? 'Welcome Back!' : 'С возвращением!', language === 'en' ? `Found and linked your pre-existing profile with balance $${finalProfile.balanceUSD}.` : `Найден ваш существующий профиль с балансом $${finalProfile.balanceUSD} и успешно объединен!`);
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
            addNotification('success', language === 'en' ? 'Logged in' : 'Вход выполнен', language === 'en' ? `Welcome back, ${profile.displayName}!` : `С возвращением, ${profile.displayName}!`);
            onSuccess(profile);
          } else {
            const seed = (user.displayName || user.uid).replace(/\s+/g, '_').toLowerCase();
            const fallbackProfile: UserProfile = {
              uid: user.uid,
              email: user.email || email,
              displayName: user.displayName || 'Alpine Glider',
              role: isAdminEmail(user.email || email) ? 'admin' : 'user',
              avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`,
              balanceUSD: 250,
              isClientActive: true
            };
            try {
              await setDoc(doc(db, 'users', user.uid), fallbackProfile);
            } catch (dbErr) {
              handleFirestoreError(dbErr, OperationType.WRITE, `users/${user.uid}`);
            }
            addNotification('info', language === 'en' ? 'Profile Setup' : 'Настройка профиля', language === 'en' ? 'Created a new profile for you.' : 'Мы создали новый профиль для вас.');
            onSuccess(fallbackProfile);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      const errCode = err.code || '';
      const errMessage = err.message || '';

      const isEmailAlreadyInUse = errCode === 'auth/email-already-in-use' || errMessage.includes('auth/email-already-in-use');
      const isWeakPassword = errCode === 'auth/weak-password' || errMessage.includes('auth/weak-password');
      const isInvalidCredential = errCode === 'auth/invalid-credential' || 
                                  errCode === 'auth/wrong-password' || 
                                  errCode === 'auth/user-not-found' ||
                                  errMessage.includes('auth/invalid-credential') ||
                                  errMessage.includes('auth/wrong-password') ||
                                  errMessage.includes('auth/user-not-found');
      const isOperationNotAllowed = errCode === 'auth/operation-not-allowed' || errMessage.includes('auth/operation-not-allowed');
      const isNetworkError = errCode === 'auth/network-request-failed' || errMessage.includes('auth/network-request-failed');

      let errMsg = language === 'en' ? 'Authentication failed. Please verify your credentials.' : 'Ошибка авторизации. Проверьте введенные данные.';
      
      if (isEmailAlreadyInUse) {
        errMsg = language === 'en' 
          ? 'This email is already registered. If an administrator created your account, please log in using the "Sign In" tab. Any pre-existing records will be automatically linked.' 
          : 'Этот email уже зарегистрирован. Если администратор создал ваш профиль, пожалуйста, войдите во вкладке «Вход». Все ваши данные будут автоматически привязаны.';
      } else if (isWeakPassword) {
        errMsg = language === 'en' ? 'Password must be at least 6 characters.' : 'Пароль должен состоять минимум из 6 символов.';
      } else if (isInvalidCredential) {
        errMsg = language === 'en' ? 'Incorrect email or password.' : 'Неверный адрес почты или пароль.';
      } else if (isOperationNotAllowed) {
        errMsg = language === 'en' ? 'Email/Password sign-in is disabled. Please contact your administrator.' : 'Вход по почте/паролю отключен в настройках Firebase. Воспользуйтесь демо-аккаунтами или входом через Google.';
      } else if (isNetworkError) {
        errMsg = language === 'en' 
          ? 'A network error occurred (auth/network-request-failed). This is usually caused by ad-blocking extensions (like uBlock Origin, AdBlock Plus), Brave Shields, or a corporate VPN/firewall blocking requests to Google Firebase Auth servers (identitytoolkit.googleapis.com). Please try disabling your adblocker/shields for this site, check your connection, and try again.' 
          : 'Произошла ошибка сети (auth/network-request-failed). Обычно это вызвано расширениями для блокировки рекламы (например, uBlock Origin, AdBlock), настройками Brave Shields или корпоративным VPN/файрволом, блокирующими запросы к серверам авторизации Google Firebase (identitytoolkit.googleapis.com). Пожалуйста, попробуйте отключить блокировщик рекламы/Brave Shields для этого сайта, проверьте подключение и повторите попытку.';
      } else {
        // Fallback to include details from the original error if any
        errMsg = language === 'en' 
          ? `Authentication error: ${errMessage || 'Please verify your credentials and try again.'}`
          : `Ошибка авторизации: ${errMessage || 'Проверьте введенные данные и попробуйте еще раз.'}`;
      }

      setError(errMsg);
      addNotification('error', language === 'en' ? 'Auth Issue' : 'Ошибка авторизации', errMsg);
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
        addNotification('success', language === 'en' ? 'Logged In' : 'Вход выполнен', language === 'en' ? `Welcome back, ${profile.displayName}!` : `С возвращением, ${profile.displayName}!`);
        onSuccess(profile);
      } else {
        let finalProfile: UserProfile | null = null;
        try {
          finalProfile = await migratePreExistingProfile(user.uid, user.email || '', user.displayName || undefined);
        } catch (err) {
          console.warn("Could not check/migrate pre-existing profile on Google login", err);
        }

        if (!finalProfile) {
          const seed = (user.displayName || user.uid).replace(/\s+/g, '_').toLowerCase();
          finalProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'Alpine Glider',
            role: isAdminEmail(user.email) ? 'admin' : 'user',
            avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`,
            balanceUSD: 250,
            isClientActive: true
          };

          try {
            await setDoc(doc(db, 'users', user.uid), finalProfile);
          } catch (dbErr) {
            handleFirestoreError(dbErr, OperationType.WRITE, `users/${user.uid}`);
          }
          addNotification('success', language === 'en' ? 'Welcome!' : 'Добро пожаловать!', language === 'en' ? `Google account linked. Enjoy your $250 starting credits!` : `Аккаунт Google привязан. Получите $250 на счет!`);
        } else {
          const actualName = user.displayName || finalProfile.displayName;
          addNotification('success', language === 'en' ? 'Welcome Back!' : 'С возвращением!', language === 'en' ? `Found your pre-existing profile with balance $${finalProfile.balanceUSD} linked to name "${actualName}".` : `Найден ваш существующий профиль с балансом $${finalProfile.balanceUSD}, привязанный к имени "${actualName}".`);
        }
        onSuccess(finalProfile);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        const popupMsg = language === 'en'
          ? 'Google sign-in popup was blocked by your browser. Please allow popups for this site, or open the app in a new tab (top-right icon in the preview) to sign in.'
          : 'Всплывающее окно входа Google заблокировано вашим браузером. Пожалуйста, разрешите всплывающие окна для этого сайта или откройте приложение в новой вкладке (кнопка в правом верхнем углу превью), чтобы войти.';
        setError(popupMsg);
        addNotification('error', language === 'en' ? 'Popup Blocked' : 'Окно заблокировано', popupMsg);
      } else if (err.code === 'auth/network-request-failed') {
        const netMsg = language === 'en'
          ? 'A network error occurred (auth/network-request-failed). This is usually caused by ad-blocking extensions (like uBlock Origin, AdBlock Plus), Brave Shields, or a corporate VPN/firewall blocking requests to Google Firebase Auth servers (identitytoolkit.googleapis.com). Please try disabling your adblocker/shields for this site, check your connection, and try again.'
          : 'Произошла ошибка сети (auth/network-request-failed). Обычно это вызвано расширениями для блокировки рекламы (например, uBlock Origin, AdBlock), настройками Brave Shields или корпоративным VPN/файрволом, блокирующими запросы к серверам авторизации Google Firebase (identitytoolkit.googleapis.com). Пожалуйста, попробуйте отключить блокировщик рекламы/Brave Shields для этого сайта, проверьте подключение и повторите попытку.';
        setError(netMsg);
        addNotification('error', language === 'en' ? 'Network Error' : 'Ошибка сети', netMsg);
      } else if (err.code !== 'auth/popup-closed-by-user') {
        setError(language === 'en' ? 'Google sign-in was interrupted.' : 'Вход через Google был прерван.');
        addNotification('error', 'Google Login Interrupted', err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email) {
      setError(language === 'en' ? 'Please enter your email address.' : 'Пожалуйста, введите адрес электронной почты.');
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      addNotification(
        'success',
        language === 'en' ? 'Reset Email Sent' : 'Ссылка отправлена',
        language === 'en'
          ? `If an account exists for ${email}, a password reset link has been sent.`
          : `Если аккаунт с адресом ${email} существует, ссылка для сброса пароля была отправлена.`
      );
      setIsForgotPassword(false);
    } catch (err: any) {
      console.error("Password reset error:", err);
      const errorMsg = err.code === 'auth/user-not-found'
        ? (language === 'en' ? 'User with this email was not found.' : 'Пользователь с такой почтой не найден.')
        : (language === 'en' ? `Error: ${err.message}` : `Ошибка: ${err.message}`);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="flex flex-col bg-transparent border border-[var(--border)] animate-fade-in">
      {/* Form Side */}
      <div className="p-6 md:p-8 flex flex-col justify-center bg-transparent">
        <div className="max-w-md w-full mx-auto space-y-6">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-serif font-light text-[var(--ink)] tracking-tight">
              {isForgotPassword 
                ? (language === 'en' ? 'Reset Password' : 'Сброс пароля')
                : (isSignUp ? t('signUpTitle') : t('welcomeTitle'))}
            </h2>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {isForgotPassword 
                ? (language === 'en' ? 'Enter your email address to receive a recovery link.' : 'Введите адрес вашей электронной почты для получения ссылки.')
                : (isSignUp ? t('signUpSub') : t('welcomeSub'))}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-950/20 border border-red-900/40 text-[10px] font-mono text-red-400 rounded-none uppercase tracking-wider leading-normal">
              {error}
            </div>
          )}

          <form onSubmit={isForgotPassword ? handlePasswordReset : handleSubmit} className="space-y-4">
            {isForgotPassword ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">{t('emailAddress')}</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-none border border-[var(--border)] text-xs font-mono bg-black/15 text-[var(--ink)] placeholder:text-[var(--ink-dim)]/30 focus:outline-none focus:border-[var(--ink)] transition"
                    />
                    <Mail className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-[var(--ink)] hover:bg-[var(--ink)]/90 text-[var(--bg)] rounded-none text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition duration-300 disabled:opacity-50 cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  {language === 'en' ? 'Send Recovery Link' : 'Отправить ссылку для восстановления'}
                </button>
              </>
            ) : (
              <>
                {isSignUp && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">{t('fullName')}</label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder={language === 'en' ? 'e.g. Alex Carter' : 'например, Александр Смирнов'}
                          className="w-full pl-10 pr-4 py-2.5 rounded-none border border-[var(--border)] text-xs font-mono bg-black/15 text-[var(--ink)] placeholder:text-[var(--ink-dim)]/30 focus:outline-none focus:border-[var(--ink)] transition"
                        />
                        <UserIcon className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      </div>
                      <p className="text-[8px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1">
                        {language === 'en' 
                          ? 'English and Russian characters are fully supported.' 
                          : 'Поддерживаются символы как на русском, так и на английском языке.'}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">{t('phoneOptional')}</label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+1 (555) 000-0000"
                          className="w-full pl-10 pr-4 py-2.5 rounded-none border border-[var(--border)] text-xs font-mono bg-black/15 text-[var(--ink)] placeholder:text-[var(--ink-dim)]/30 focus:outline-none focus:border-[var(--ink)] transition"
                        />
                        <Phone className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    {/* Avatar Selection Block */}
                    <div className="space-y-2 pt-3 border-t border-[var(--border)]">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
                          {language === 'en' ? 'Choose your Avatar' : 'Выберите аватар'}
                        </label>
                        <button
                          type="button"
                          onClick={handleRandomizeAvatar}
                          className="text-[10px] font-mono font-bold text-[var(--ink)] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-0 outline-none"
                        >
                          🎲 {language === 'en' ? 'Randomize' : 'Случайный'}
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
                              className={`relative aspect-square rounded-none p-1 bg-black/10 border transition hover:scale-105 cursor-pointer ${
                                isSelected 
                                  ? 'border-[var(--ink)] bg-black/25' 
                                  : 'border-[var(--border)] hover:border-[var(--ink)]'
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
                          placeholder={language === 'en' ? "Or enter nickname for custom seed..." : "Или введите ник для создания..."}
                          className="w-full pl-8 pr-4 py-1.5 rounded-none border border-[var(--border)] text-[10px] font-mono bg-black/15 text-[var(--ink)] placeholder:text-[var(--ink-dim)]/30 focus:outline-none focus:border-[var(--ink)] transition"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-dim)] pointer-events-none">✨</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">{t('emailAddress')}</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-none border border-[var(--border)] text-xs font-mono bg-black/15 text-[var(--ink)] placeholder:text-[var(--ink-dim)]/30 focus:outline-none focus:border-[var(--ink)] transition"
                    />
                    <Mail className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">{t('password')}</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError('');
                      }}
                      className="text-[10px] font-mono font-bold text-[var(--ink-dim)] hover:text-[var(--ink)] hover:underline bg-transparent border-0 p-0 outline-none cursor-pointer"
                    >
                      {language === 'en' ? 'Forgot password?' : 'Забыли пароль?'}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2.5 rounded-none border border-[var(--border)] text-xs font-mono bg-black/15 text-[var(--ink)] placeholder:text-[var(--ink-dim)]/30 focus:outline-none focus:border-[var(--ink)] transition"
                    />
                    <Lock className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-[var(--ink)] hover:bg-[var(--ink)]/90 text-[var(--bg)] rounded-none text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition duration-300 disabled:opacity-50 cursor-pointer"
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
                <span className="text-[9px] font-mono font-bold text-[var(--ink-dim)] uppercase tracking-widest">{t('orContinueWith')}</span>
                <div className="h-[1px] bg-[var(--border)] flex-1" />
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-2.5 border border-[var(--border)] hover:border-[var(--ink)] hover:bg-black/10 rounded-none text-[10px] font-mono uppercase tracking-widest font-bold text-[var(--ink)] flex items-center justify-center gap-2 transition duration-300 disabled:opacity-50 cursor-pointer"
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
                {language === 'en' ? 'Back to Login' : 'Назад к входу'}
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

