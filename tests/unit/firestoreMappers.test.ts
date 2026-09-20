import { describe, expect, it } from 'vitest';
import { WalletSchema } from '@ski-academy/shared-domain';
import {
  readUserProfile,
  toBooking,
  toCourse,
  toNotification,
  toUserProfile,
} from '../../src/infrastructure/firebase';
import { parseUserProfile } from '../../src/infrastructure/firebase/firestoreSchemas';
import {
  canonicalUserProfileDocument,
  currentSupportedWalletBalances,
  ksushaProductionShapedUserDocument,
  PROD_SHAPED_KSUSHA_ACCOUNT_ID,
  PROD_SHAPED_KSUSHA_EMAIL,
} from '../helpers/userProfileFixtures';

const validBooking = {
  userId: 'user-1',
  instructorId: 'instructor-1',
  instructorName: 'Instructor',
  instructorAvatar: '',
  date: '2026-08-18',
  time: '10:00',
  durationHours: 2,
  totalPrice: 100,
  status: 'confirmed' as const,
  difficulty: 'beginner' as const,
};

const validCourse = {
  title: 'Carving basics',
  duration: '2 hours',
  description: 'Course description',
  dates: '2026-08-18',
  totalSeats: 10,
  availableSeats: 4,
  price: 100,
  bgImageUrl: '',
};

describe('Firestore mappers', () => {
  it('attaches the Firestore document id to booking and course domain models', () => {
    expect(toBooking('booking-1', validBooking)?.id).toBe('booking-1');
    expect(toCourse('course-1', validCourse)?.id).toBe('course-1');
  });

  it('keeps the Firestore document id separate from notification fields', () => {
    const notification = toNotification('notification-1', {
      userId: 'user-1',
      isRead: false,
      timestamp: '2026-08-17T00:00:00.000Z',
    });

    expect(notification.id).toBe('notification-1');
    expect(notification.userId).toBe('user-1');
  });

  it('skips incomplete or malformed booking, course, and user documents', () => {
    expect(toBooking('booking-invalid', { ...validBooking, durationHours: 0 })).toBeNull();
    expect(toCourse('course-invalid', { ...validCourse, availableSeats: '4' })).toBeNull();
    expect(
      toUserProfile(
        {
          uid: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          role: 'unexpected',
          avatarUrl: '',
        },
        'user-1'
      )
    ).toBeNull();
  });

  it('preserves a valid user profile', () => {
    const profile = toUserProfile(
      {
        uid: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        role: 'user',
        avatarUrl: '',
        dismissedReviewIds: ['booking-1'],
      },
      'user-1'
    );
    expect(profile).toMatchObject({ uid: 'user-1', dismissedReviewIds: ['booking-1'] });
    expect(profile).not.toHaveProperty('balanceUSD');
    expect(profile).not.toHaveProperty('walletBalances');
  });

  it('normalizes historical profiles that predate duplicated uid and avatar fields', () => {
    expect(
      toUserProfile(
        {
          email: 'legacy@example.com',
          displayName: 'Legacy User',
          role: 'user',
        },
        'legacy-user'
      )
    ).toMatchObject({
      uid: 'legacy-user',
      email: 'legacy@example.com',
      displayName: 'Legacy User',
      avatarUrl: '',
    });
  });
});

describe('UserProfile read normalization', () => {
  it('A. parses a current canonical user profile', () => {
    expect(toUserProfile(canonicalUserProfileDocument, canonicalUserProfileDocument.uid)).toEqual(
      expect.objectContaining(canonicalUserProfileDocument)
    );
  });

  it('documents the remaining ksusha schema mismatches before read normalization', () => {
    const result = parseUserProfile({
      ...ksushaProductionShapedUserDocument,
      uid: PROD_SHAPED_KSUSHA_ACCOUNT_ID,
      avatarUrl: '',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toMatch(/role:/);
    expect(result.reason).toMatch(/phoneNumber: Invalid input: expected string, received null/);
    expect(result.reason).toMatch(/systemRole:/);
    expect(result.reason).toMatch(/instructorId: Invalid input: expected string, received null/);
    expect(result.reason).toMatch(/isInstructor: Invalid input: expected boolean, received null/);
    expect(result.reason).toMatch(/walletBalances\.USD: Invalid input/);
    expect(result.reason).not.toMatch(PROD_SHAPED_KSUSHA_EMAIL);
  });

  it('B/C. parses and in-memory-normalizes the production-shaped ksusha profile', () => {
    const original = { ...ksushaProductionShapedUserDocument };
    const profile = toUserProfile(original, PROD_SHAPED_KSUSHA_ACCOUNT_ID);
    expect(profile).toMatchObject({
      uid: PROD_SHAPED_KSUSHA_ACCOUNT_ID,
      email: PROD_SHAPED_KSUSHA_EMAIL,
      displayName: 'Ксюша Иванова',
      role: 'user',
      avatarUrl: '',
      isClientActive: true,
    });
    expect(profile).not.toHaveProperty('phoneNumber');
    expect(profile).not.toHaveProperty('systemRole');
    expect(profile).not.toHaveProperty('walletBalances');
    expect(profile).not.toHaveProperty('balanceUSD');
    expect(original.role).toBeUndefined();
    expect(original.phoneNumber).toBeNull();
    expect(original.walletBalances).toEqual({ KZT: 0 });
    expect(original.uid).toBeUndefined();
  });

  it('C. derives missing uid, avatarUrl, and displayName from document identity fields', () => {
    expect(
      toUserProfile(
        {
          email: 'derived@example.com',
          name: 'Legacy Name Field',
        },
        'derived-user'
      )
    ).toMatchObject({
      uid: 'derived-user',
      displayName: 'Legacy Name Field',
      role: 'user',
      avatarUrl: '',
    });
  });

  it('D. keeps extra historical and canonical Account fields from causing rejection', () => {
    const profile = toUserProfile(
      ksushaProductionShapedUserDocument,
      PROD_SHAPED_KSUSHA_ACCOUNT_ID
    );
    expect(profile).toMatchObject({
      accountId: PROD_SHAPED_KSUSHA_ACCOUNT_ID,
      comments: 'historical extra field',
      lifecycle: { status: 'active' },
      revision: 1,
    });
  });

  it('E. still fails invalid authority-bearing data', () => {
    expect(
      readUserProfile(
        {
          ...canonicalUserProfileDocument,
          role: { admin: true },
        },
        canonicalUserProfileDocument.uid
      )
    ).toEqual({
      success: false,
      reason: "role: expected 'user' | 'admin', received object",
    });
    expect(
      readUserProfile(
        {
          ...canonicalUserProfileDocument,
          systemRole: 'admin',
        },
        canonicalUserProfileDocument.uid
      )
    ).toEqual({
      success: false,
      reason: "systemRole: expected 'owner', received string",
    });
    expect(
      toUserProfile(
        { ...canonicalUserProfileDocument, isInstructor: 'yes' },
        canonicalUserProfileDocument.uid
      )
    ).toBeNull();
  });

  it('F. still fails conflicting account/uid identity', () => {
    expect(
      readUserProfile(
        { ...canonicalUserProfileDocument, uid: 'other-user' },
        canonicalUserProfileDocument.uid
      )
    ).toEqual({
      success: false,
      reason: 'uid: identity conflict with document id',
    });
    expect(
      readUserProfile(
        {
          ...canonicalUserProfileDocument,
          accountId: 'other-account',
        },
        canonicalUserProfileDocument.uid
      )
    ).toEqual({
      success: false,
      reason: 'accountId: identity conflict with document id',
    });
  });
});

describe('legacy walletBalances profile read', () => {
  it('A. parses a canonical current profile without walletBalances', () => {
    const profile = toUserProfile(canonicalUserProfileDocument, canonicalUserProfileDocument.uid);
    expect(profile).toMatchObject(canonicalUserProfileDocument);
    expect(profile).not.toHaveProperty('walletBalances');
    expect(profile).not.toHaveProperty('balanceUSD');
  });

  it('B. parses a profile with the current supported walletBalances shape', () => {
    const profile = toUserProfile(
      { ...canonicalUserProfileDocument, walletBalances: currentSupportedWalletBalances },
      canonicalUserProfileDocument.uid
    );
    expect(profile).toMatchObject(canonicalUserProfileDocument);
    expect(profile).not.toHaveProperty('walletBalances');
  });

  it('C. parses ksusha-shaped historical walletBalances.USD leftovers', () => {
    for (const leftover of [
      { KZT: 0 },
      { USD: null },
      { USD: 250 },
      {},
      { USD: { amount: 250, currency: 'USD' } },
    ]) {
      const profile = toUserProfile(
        { ...canonicalUserProfileDocument, walletBalances: leftover },
        canonicalUserProfileDocument.uid
      );
      expect(profile).toMatchObject(canonicalUserProfileDocument);
      expect(profile).not.toHaveProperty('walletBalances');
    }
  });

  it('D/E. omits leftover USD so it cannot become canonical wallet authority', () => {
    const profile = toUserProfile(
      {
        ...canonicalUserProfileDocument,
        balanceUSD: 999,
        walletBalances: { USD: 999, KZT: 500_000 },
      },
      canonicalUserProfileDocument.uid
    );
    expect(profile).not.toHaveProperty('balanceUSD');
    expect(profile).not.toHaveProperty('walletBalances');
  });

  it('F. malformed canonical wallet authority still fails at WalletSchema', () => {
    expect(
      WalletSchema.safeParse({
        accountId: 'account_wallet_malformed',
        currency: 'USD',
        balance: 12.5,
      }).success
    ).toBe(false);
    expect(
      WalletSchema.safeParse({
        accountId: 'account_wallet_malformed',
        currency: 'KZT',
        balance: -1,
        revision: 1,
        eventRevision: 1,
        createdAt: { seconds: 1, nanoseconds: 0 },
        updatedAt: { seconds: 1, nanoseconds: 0 },
      }).success
    ).toBe(false);
  });

  it('G. unrelated historical extras outside UserProfile ownership cannot break authentication', () => {
    const profile = toUserProfile(
      {
        ...canonicalUserProfileDocument,
        walletBalances: { KZT: 0 },
        pendingWalletCredit: { amount: 1 },
        schoolGuestWallet: { USD: 10 },
        lifecycle: { status: 'active' },
        unknownCanonicalProjection: { nested: true },
      },
      canonicalUserProfileDocument.uid
    );
    expect(profile).toMatchObject({
      ...canonicalUserProfileDocument,
      lifecycle: { status: 'active' },
      unknownCanonicalProjection: { nested: true },
      schoolGuestWallet: { USD: 10 },
    });
    expect(profile).not.toHaveProperty('walletBalances');
    expect(profile).not.toHaveProperty('pendingWalletCredit');
  });
});
