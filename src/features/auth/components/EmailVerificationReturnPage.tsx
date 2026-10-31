import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Mail } from 'lucide-react';
import { isUiLanguage, useLanguage } from '../../../app/providers/LanguageContext';
import { useAuthStore } from '../authStore';
import { useProfileStore } from '../../profile/profileStore';
import { useUiStore } from '../../shell';
import { getDefaultWorkspacePath } from '../../../lib/workspaceRoutes';
import { refreshEmailVerificationService } from '../authService';

/**
 * Firebase's hosted action handler completes verification before the user
 * visits this public return page. A URL alone is not proof of verification.
 */
export const EmailVerificationReturnPage: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();
  const [searchParams] = useSearchParams();
  const requestedLanguage = searchParams.get('lang');
  const authLoading = useAuthStore((state) => state.authLoading);
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const profile = useProfileStore((state) => state.userProfile);
  const openAuthModal = useUiStore((state) => state.setIsAuthModalOpen);
  const [status, setStatus] = useState<'checking' | 'verified' | 'pending'>('checking');

  useEffect(() => {
    if (isUiLanguage(requestedLanguage) && requestedLanguage !== language) {
      setLanguage(requestedLanguage);
    }
  }, [requestedLanguage, language, setLanguage]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      setStatus('pending');
      return;
    }
    let active = true;
    setStatus('checking');
    void refreshEmailVerificationService(firebaseUser)
      .then((verified) => {
        if (active) setStatus(verified ? 'verified' : 'pending');
      })
      .catch(() => {
        if (active) setStatus('pending');
      });
    return () => {
      active = false;
    };
  }, [authLoading, firebaseUser]);

  const checking = status === 'checking';
  const verified = status === 'verified';
  const title = checking
    ? t('authVerificationReturnChecking')
    : verified
      ? t('authVerificationReturnVerified')
      : t('authVerificationReturnPending');

  return (
    <main className="w-full flex-1 flex items-center justify-center px-4 py-12">
      <section className="ui-modal w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] px-6 py-10 text-center shadow-xl sm:px-10">
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-[var(--profile-bg)] text-[var(--ink)]">
          {verified ? (
            <CheckCircle2 size={34} aria-hidden="true" />
          ) : (
            <Mail size={34} aria-hidden="true" />
          )}
        </div>
        <h1 className="type-section-title text-[var(--ink)]">{title}</h1>
        {!checking && (
          <p className="mt-4 type-body text-[var(--ink-dim)]">
            {t(
              verified ? 'authVerificationReturnVerifiedDesc' : 'authVerificationReturnPendingDesc'
            )}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          {!profile && (
            <button
              type="button"
              className="btn-primary min-h-11 w-full px-5 py-3"
              onClick={() => openAuthModal(true)}
            >
              {t('authVerificationReturnSignIn')}
            </button>
          )}
          <Link
            to={profile ? getDefaultWorkspacePath(profile) : '/'}
            className="btn-secondary min-h-11 w-full px-5 py-3"
          >
            {t('authVerificationReturnHome')}
          </Link>
        </div>
      </section>
    </main>
  );
};
