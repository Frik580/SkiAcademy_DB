import { useEffect, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import type { MultiFactorError, MultiFactorResolver, User } from 'firebase/auth';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { registerAdministratorStepUp } from '../../../lib/functions/administratorStepUp';
import {
  getSignInMfaResolver,
  reauthenticateAdministrator,
  resolveTotpSignIn,
  useAuthStore,
} from '../../auth';
import { AdminModal } from './AdminModal';

interface PendingConfirmation {
  id: number;
  user: User;
  generation: number;
  resolve: (confirmed: boolean) => void;
}

export function AdministratorStepUpHost({ administratorUid }: { administratorUid?: string }) {
  const { t } = useLanguage();
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const nextConfirmationId = useRef(0);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    const unregister = registerAdministratorStepUp((user) => {
      const { firebaseUser, authGeneration } = useAuthStore.getState();
      if (user.uid !== administratorUid || firebaseUser !== user || pendingRef.current) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        const confirmation = { id: nextConfirmationId.current++, user, generation: authGeneration, resolve };
        pendingRef.current = confirmation;
        setPending(confirmation);
      });
    });
    const unsubscribe = useAuthStore.subscribe(({ firebaseUser, authGeneration }) => {
      const confirmation = pendingRef.current;
      if (
        confirmation &&
        (firebaseUser !== confirmation.user || authGeneration !== confirmation.generation)
      ) {
        pendingRef.current = null;
        setPending(null);
        confirmation.resolve(false);
      }
    });
    return () => {
      unregister();
      unsubscribe();
      pendingRef.current?.resolve(false);
      pendingRef.current = null;
    };
  }, [administratorUid]);

  if (!pending || pending !== pendingRef.current) return null;
  function finish(confirmed: boolean) {
    if (!pending || pendingRef.current !== pending) return;
    const { firebaseUser, authGeneration } = useAuthStore.getState();
    pendingRef.current = null;
    setPending(null);
    pending.resolve(
      confirmed && firebaseUser === pending.user && authGeneration === pending.generation
    );
  }

  return (
    <AdminModal
      title={t('adminStepUpTitle')}
      onClose={() => finish(false)}
      closeLabel={t('cancel')}
      width="sm"
    >
      <AdministratorStepUpForm key={pending.id} user={pending.user} finish={finish} />
    </AdminModal>
  );
}

function AdministratorStepUpForm({
  user,
  finish,
}: {
  user: User;
  finish: (confirmed: boolean) => void;
}) {
  const { t } = useLanguage();
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const factors = resolver?.hints.filter((hint) => hint.factorId === 'totp') ?? [];
  const passwordProvider = user.providerData.some((provider) => provider.providerId === 'password');
  const googleProvider = user.providerData.some((provider) => provider.providerId === 'google.com');

  async function confirm(form: HTMLFormElement, method: 'password' | 'google.com') {
    if (busy) return;
    const fields = new FormData(form);
    form.reset();
    setBusy(true);
    setFailed(false);
    try {
      if (resolver) {
        const factor = String(fields.get('factor') ?? factors[0]?.uid ?? '');
        if (!factors.some((hint) => hint.uid === factor)) throw new Error('Unsupported factor.');
        if (
          (await resolveTotpSignIn(resolver, factor, String(fields.get('verification') ?? '')))
            .uid !== user.uid
        ) {
          throw new Error('Authentication changed.');
        }
      } else {
        await reauthenticateAdministrator(user, method, String(fields.get('password') ?? ''));
      }
      await user.getIdToken(true);
      finish(true);
    } catch (error) {
      if (
        !resolver &&
        error instanceof FirebaseError &&
        error.code === 'auth/multi-factor-auth-required'
      ) {
        try {
          const next = getSignInMfaResolver(error as MultiFactorError);
          if (next.hints.some((hint) => hint.factorId === 'totp')) {
            setResolver(next);
            return;
          }
        } catch {
          // The Firebase error can contain pending authentication credentials.
        }
      }
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void confirm(event.currentTarget, 'password');
      }}
    >
      <p>{t('adminStepUpDescription')}</p>
      {resolver ? (
        <>
          {factors.length > 1 && (
            <label className="block">
              {t('authTotpDevice')}
              <select name="factor" className="ui-field-plain">
                {factors.map((hint, index) => (
                  <option key={hint.uid} value={hint.uid}>
                    {hint.displayName || t('authTotpDevice')} {index + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            {t('authTotpCode')}
            <input
              className="ui-field-plain"
              name="verification"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
            />
          </label>
        </>
      ) : (
        passwordProvider && (
          <label className="block">
            {t('password')}
            <input
              className="ui-field-plain"
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
        )
      )}
      {failed && <p role="alert">{t('adminStepUpFailed')}</p>}
      <div className="flex flex-wrap gap-2">
        {(resolver || passwordProvider) && (
          <button type="submit" className="btn-primary px-4 py-2" disabled={busy}>
            {t('confirm')}
          </button>
        )}
        {!resolver && googleProvider && (
          <button
            type="button"
            className="btn-secondary px-4 py-2"
            disabled={busy}
            onClick={(event) => {
              const form = event.currentTarget.form;
              if (form) void confirm(form, 'google.com');
            }}
          >
            {t('adminStepUpGoogle')}
          </button>
        )}
        <button type="button" className="btn-secondary px-4 py-2" onClick={() => finish(false)}>
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
