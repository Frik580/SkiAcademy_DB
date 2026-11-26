import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { AdministratorStepUpHost } from '../../src/features/admin/components/AdministratorStepUpHost';
import { withAdministratorStepUp } from '../../src/lib/functions/administratorStepUp';

const fixture = vi.hoisted(() => ({
  auth: { currentUser: null as unknown },
  user: { uid: 'admin-one', providerData: [{ providerId: 'password' }], getIdToken: vi.fn() },
  reauthenticate: vi.fn(),
  resolve: vi.fn(),
  resolver: vi.fn(),
}));

const googleProvider = { providerId: 'google.com' };
const passwordProvider = { providerId: 'password' };

vi.mock('../../src/infrastructure/firebase', () => ({ auth: fixture.auth }));
vi.mock('../../src/features/auth', () => ({
  getSignInMfaResolver: fixture.resolver,
  resolveTotpSignIn: fixture.resolve,
  reauthenticateAdministrator: fixture.reauthenticate,
  useAuthStore: {
    getState: () => ({ firebaseUser: fixture.auth.currentUser, authGeneration: 1 }),
    subscribe: () => () => {},
  },
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

const stale = {
  code: 'functions/failed-precondition',
  details: { code: 'ADMIN_RECENT_AUTH_REQUIRED' },
};

function begin() {
  const body = { idempotencyKey: 'finance-attempt-one', amount: 400 };
  const send = vi.fn().mockRejectedValueOnce(stale).mockResolvedValueOnce('applied');
  const result = withAdministratorStepUp((uid) => send(body, uid));
  return { result: result.catch((error: unknown) => error), send, body };
}

describe('administrator step-up', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fixture.user.providerData = [passwordProvider];
    fixture.auth.currentUser = fixture.user;
    fixture.user.getIdToken.mockResolvedValue('refreshed');
    fixture.reauthenticate.mockResolvedValue(undefined);
  });

  it('offers a password only when it is linked, and supports both linked providers', async () => {
    fixture.user.providerData = [passwordProvider, googleProvider];
    render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
    const { result, send } = begin();
    expect(await screen.findByLabelText('password')).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: 'adminStepUpGoogle' }));
    await expect(result).resolves.toBe('applied');
    expect(fixture.reauthenticate).toHaveBeenCalledExactlyOnceWith(fixture.user, 'google.com', '');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses Google without a password for Google-only users, refreshes the token and preserves the operation', async () => {
    fixture.user.providerData = [googleProvider];
    render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
    const { result, send, body } = begin();
    const google = await screen.findByRole('button', { name: 'adminStepUpGoogle' });
    expect(screen.queryByLabelText('password')).toBeNull();
    fireEvent.click(google);
    await expect(result).resolves.toBe('applied');
    expect(fixture.reauthenticate).toHaveBeenCalledExactlyOnceWith(fixture.user, 'google.com', '');
    expect(fixture.user.getIdToken).toHaveBeenCalledExactlyOnceWith(true);
    expect(fixture.user.getIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[1]
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, body, fixture.user.uid);
  });

  it.each([
    'auth/user-mismatch',
    'auth/popup-blocked',
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
    'auth/unauthorized-domain',
  ])('does not refresh or replay after Google rejects with %s', async (code) => {
    fixture.user.providerData = [googleProvider];
    fixture.reauthenticate.mockRejectedValueOnce(new FirebaseError(code, 'OAuth rejected'));
    render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
    const { result, send } = begin();
    fireEvent.click(await screen.findByRole('button', { name: 'adminStepUpGoogle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('adminStepUpFailed');
    expect(fixture.user.getIdToken).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(result).resolves.toEqual(stale);
  });

  it('leaves an ordinary successful operation alone', async () => {
    render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
    const send = vi.fn().mockResolvedValue('ok');
    await expect(withAdministratorStepUp(send)).resolves.toBe('ok');
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not replay on Escape or after a wrong password', async () => {
    fixture.reauthenticate.mockRejectedValueOnce(
      new FirebaseError('auth/invalid-credential', 'invalid')
    );
    render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
    const { result, send } = begin();
    const password = await screen.findByLabelText('password');
    fireEvent.change(password, { target: { value: 'incorrect' } });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('adminStepUpFailed');
    expect(send).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    await expect(result).resolves.toEqual(stale);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['password', 'google.com'])(
    'completes TOTP after %s and replays once with the original operation and UID',
    async (method) => {
      fixture.user.providerData = [{ providerId: method }];
      fixture.reauthenticate.mockRejectedValueOnce(
        new FirebaseError('auth/multi-factor-auth-required', 'pending')
      );
      fixture.resolver.mockReturnValue({ hints: [{ factorId: 'totp', uid: 'factor' }] });
      fixture.resolve.mockResolvedValue(fixture.user);
      render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
      const { result, send, body } = begin();
      if (method === 'password') {
        fireEvent.change(await screen.findByLabelText('password'), {
          target: { value: 'valid-password' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
      } else {
        fireEvent.click(await screen.findByRole('button', { name: 'adminStepUpGoogle' }));
      }
      const code = await screen.findByLabelText('authTotpCode');
      expect(send).toHaveBeenCalledTimes(1);
      fireEvent.change(code, { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
      await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
      await expect(result).resolves.toBe('applied');
      expect(send).toHaveBeenNthCalledWith(2, body, fixture.user.uid);
      expect(fixture.user.getIdToken).toHaveBeenCalledExactlyOnceWith(true);
    }
  );

  it.each(['account change', 'modal cancellation'])(
    'does not replay if the Google popup completes after %s',
    async (event) => {
      fixture.user.providerData = [googleProvider];
      let finish: () => void = () => {};
      fixture.reauthenticate.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
      const { result, send } = begin();
      fireEvent.click(await screen.findByRole('button', { name: 'adminStepUpGoogle' }));
      if (event === 'account change') {
        fixture.auth.currentUser = { uid: 'admin-two' };
      } else {
        fireEvent.keyDown(document, { key: 'Escape' });
      }
      await act(async () => finish());
      await expect(result).resolves.toEqual(stale);
      expect(send).toHaveBeenCalledTimes(1);
    }
  );

  it('returns a second freshness denial without opening another prompt', async () => {
    render(<AdministratorStepUpHost administratorUid={fixture.user.uid} />);
    const send = vi.fn().mockRejectedValue(stale);
    const result = withAdministratorStepUp(send).catch((error: unknown) => error);
    fireEvent.change(await screen.findByLabelText('password'), {
      target: { value: 'valid-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await expect(result).resolves.toEqual(stale);
    expect(send).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
