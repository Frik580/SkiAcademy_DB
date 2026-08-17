/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../src/features/auth';

const mockCreateUserWithEmailAndPassword = vi.fn();
const mockSignInWithEmailAndPassword = vi.fn();
const mockSendPasswordResetEmail = vi.fn();
const mockSignInWithPopup = vi.fn();
const mockSetDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockMigratePreExistingProfile = vi.fn();
const mockAddNotification = vi.fn();

vi.mock('../../src/infrastructure/firebase/firebase', () => ({
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
}));

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
          role: 'user',
          balanceUSD: 250,
        })
      );
    });
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
  });
});
