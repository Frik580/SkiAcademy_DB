/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../src/features/auth';
import { readUserProfile as realReadUserProfile } from '../../src/infrastructure/firebase/firestoreSchemas';
import {
  ksushaProductionShapedUserDocument,
  PROD_SHAPED_KSUSHA_ACCOUNT_ID,
  PROD_SHAPED_KSUSHA_EMAIL,
} from '../helpers/userProfileFixtures';

const mockCreateUserWithEmailAndPassword = vi.fn();
const mockSignInWithEmailAndPassword = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSetDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockMigratePreExistingProfile = vi.fn();
const mockAddNotification = vi.fn();
const mockToUserProfile = vi.fn((data: any) => data);
const mockReadUserProfile = vi.fn();

vi.mock('../../src/infrastructure/firebase', async () => {
  const { omitLegacyAccountProgressFields } =
    await import('../../src/infrastructure/firebase/omitLegacyAccountProgressFields');

  return {
    auth: {},
    db: {},
    googleProvider: {},
    signInWithPopup: (...args: any[]) => mockSignInWithPopup(...args),
    doc: () => ({}),
    setDoc: (...args: any[]) => mockSetDoc(...args),
    getDoc: () => mockGetDoc(),
    handleFirestoreError: () => {},
    OperationType: { GET: 'get', WRITE: 'write' },
    migratePreExistingProfile: (...args: any[]) => mockMigratePreExistingProfile(...args),
    toUserProfile: (...args: any[]) => mockToUserProfile(...args),
    readUserProfile: (...args: any[]) => mockReadUserProfile(...args),
    omitLegacyAccountProgressFields,
  };
});

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: any[]) => mockSignInWithEmailAndPassword(...args),
  createUserWithEmailAndPassword: (...args: any[]) => mockCreateUserWithEmailAndPassword(...args),
  sendPasswordResetEmail: (...args: any[]) => mockSendPasswordResetEmail(...args),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: mockAddNotification }),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

describe('Auth', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockMigratePreExistingProfile.mockResolvedValue(null);
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockToUserProfile.mockImplementation((data: any, id?: string) => {
      const result = realReadUserProfile(data, id);
      return result.success ? result.data : null;
    });
    mockReadUserProfile.mockImplementation((data: any, id?: string) =>
      realReadUserProfile(data, id)
    );
  });

  it('renders the sign-in form by default', () => {
    render(<Auth onSuccess={onSuccess} />);
    expect(screen.getByRole('button', { name: /signInBtn/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /noAccount/i })).toBeInTheDocument();
  });

  it('switches to the sign-up form when the toggle button is clicked', async () => {
    render(<Auth onSuccess={onSuccess} />);

    const switchButton = screen.getByRole('button', { name: /noAccount/i });
    await userEvent.click(switchButton);

    expect(screen.getByRole('button', { name: /signUpBtn/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('fullName')).toBeInTheDocument();
  });

  it('shows an error when signing up with an empty display name', async () => {
    render(<Auth onSuccess={onSuccess} />);

    await userEvent.click(screen.getByRole('button', { name: /noAccount/i }));
    await userEvent.type(screen.getByPlaceholderText('emailAddress'), 'user@example.com');
    await userEvent.type(screen.getByPlaceholderText('password'), 'password123');

    const form = screen.getByRole('button', { name: /signUpBtn/i }).closest('form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByText('authDisplayNameRequired')).toBeInTheDocument();
    });
    expect(mockCreateUserWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('creates a new user profile on successful sign-up', async () => {
    mockCreateUserWithEmailAndPassword.mockResolvedValue({
      user: { uid: 'new-user', email: 'user@example.com' },
    });

    render(<Auth onSuccess={onSuccess} />);

    await userEvent.click(screen.getByRole('button', { name: /noAccount/i }));
    await userEvent.type(screen.getByPlaceholderText('fullName'), 'Alex Carter');
    await userEvent.type(screen.getByPlaceholderText('phoneOptional'), '+15550001111');
    await userEvent.type(screen.getByPlaceholderText('emailAddress'), 'user@example.com');
    await userEvent.type(screen.getByPlaceholderText('password'), 'password123');

    await userEvent.click(screen.getByRole('button', { name: /signUpBtn/i }));

    await waitFor(() => {
      expect(mockCreateUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.any(Object),
        'user@example.com',
        'password123'
      );
    });
    await waitFor(() => {
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          uid: 'new-user',
          email: 'user@example.com',
          displayName: 'Alex Carter',
          phoneNumber: '+15550001111',
          role: 'user',
        })
      );
    });
    const writtenProfile = mockSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(writtenProfile).not.toHaveProperty('level');
    expect(writtenProfile).not.toHaveProperty('skillScores');
    expect(writtenProfile).not.toHaveProperty('skillComments');
    expect(writtenProfile).not.toHaveProperty('balanceUSD');
    expect(writtenProfile).not.toHaveProperty('walletBalances');
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'new-user', displayName: 'Alex Carter' })
      );
    });
  });

  it('signs in an existing user and calls onSuccess with their profile', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { uid: 'existing-user', email: 'user@example.com' },
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'existing-user',
      data: () => ({
        uid: 'existing-user',
        email: 'user@example.com',
        displayName: 'Existing User',
        role: 'user',
        balanceUSD: 50,
      }),
    });

    render(<Auth onSuccess={onSuccess} />);

    await userEvent.type(screen.getByPlaceholderText('emailAddress'), 'user@example.com');
    await userEvent.type(screen.getByPlaceholderText('password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /signInBtn/i }));

    await waitFor(() => {
      expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.any(Object),
        'user@example.com',
        'password123'
      );
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'existing-user', displayName: 'Existing User' })
      );
    });
    expect(mockMigratePreExistingProfile).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('uses legacy migration only when the authenticated UID has no profile', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { uid: 'claimed-user', email: 'claimed@example.com' },
    });
    mockMigratePreExistingProfile.mockResolvedValue({
      uid: 'claimed-user',
      email: 'claimed@example.com',
      displayName: 'Claimed User',
      role: 'user',
      avatarUrl: '',
    });

    render(<Auth onSuccess={onSuccess} />);
    await userEvent.type(screen.getByPlaceholderText('emailAddress'), 'claimed@example.com');
    await userEvent.type(screen.getByPlaceholderText('password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /signInBtn/i }));

    await waitFor(() => {
      expect(mockMigratePreExistingProfile).toHaveBeenCalledWith(
        'claimed-user',
        'claimed@example.com',
        undefined
      );
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'claimed-user', displayName: 'Claimed User' })
      );
    });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('does not treat an invalid existing profile as missing or overwrite it', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { uid: 'invalid-user', email: 'invalid@example.com' },
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: 'invalid-user',
      data: () => ({ role: 'unexpected' }),
    });

    render(<Auth onSuccess={onSuccess} />);
    await userEvent.type(screen.getByPlaceholderText('emailAddress'), 'invalid@example.com');
    await userEvent.type(screen.getByPlaceholderText('password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /signInBtn/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Existing user profile is invalid: users\/invalid-user: .*role:/)
      ).toBeInTheDocument();
    });
    expect(mockMigratePreExistingProfile).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not report authentication success when required profile creation is denied', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { uid: 'missing-user', email: 'missing@example.com' },
    });
    mockSetDoc.mockRejectedValue(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      })
    );

    render(<Auth onSuccess={onSuccess} />);
    await userEvent.type(screen.getByPlaceholderText('emailAddress'), 'missing@example.com');
    await userEvent.type(screen.getByPlaceholderText('password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /signInBtn/i }));

    await waitFor(() => {
      expect(screen.getByText(/Missing or insufficient permissions/)).toBeInTheDocument();
    });
    expect(mockSetDoc).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('signs in a production-shaped ksusha profile without writing users/{uid}', async () => {
    mockSignInWithEmailAndPassword.mockResolvedValue({
      user: { uid: PROD_SHAPED_KSUSHA_ACCOUNT_ID, email: PROD_SHAPED_KSUSHA_EMAIL },
    });
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: PROD_SHAPED_KSUSHA_ACCOUNT_ID,
      data: () => ({ ...ksushaProductionShapedUserDocument }),
    });

    render(<Auth onSuccess={onSuccess} />);
    await userEvent.type(screen.getByPlaceholderText('emailAddress'), PROD_SHAPED_KSUSHA_EMAIL);
    await userEvent.type(screen.getByPlaceholderText('password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /signInBtn/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: PROD_SHAPED_KSUSHA_ACCOUNT_ID,
          email: PROD_SHAPED_KSUSHA_EMAIL,
          displayName: 'Ксюша Иванова',
          role: 'user',
          avatarUrl: '',
        })
      );
    });
    expect(mockMigratePreExistingProfile).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
