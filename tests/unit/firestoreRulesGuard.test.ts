import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

const rulesSource = readRepoFile('firestore.rules');

/** Firestore security rules do not support JavaScript string helpers. */
const UNSUPPORTED_RULES_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\.substring\s*\(/, reason: 'Use .matches() instead of .substring()' },
  { pattern: /\.slice\s*\(/, reason: 'String.slice is not available in Firestore rules' },
  { pattern: /\.substr\s*\(/, reason: 'String.substr is not available in Firestore rules' },
  { pattern: /\.replace\s*\(/, reason: 'String.replace is not available in Firestore rules' },
];

describe('firestore.rules guardrails', () => {
  it('does not use unsupported string APIs that fail at runtime in production', () => {
    for (const { pattern, reason } of UNSUPPORTED_RULES_PATTERNS) {
      expect(rulesSource, reason).not.toMatch(pattern);
    }
  });

  it('defines course enrollment reactivation validation', () => {
    expect(rulesSource).not.toContain('function validCourseEnrollmentReactivation');
  });

  it('skips availability slot sync for group course bookings', () => {
    expect(rulesSource).toMatch(
      /function availabilityIsSynchronized[\s\S]*booking\.instructorId\.matches\('\^course_\.\*'\)/
    );
  });

  it('allows wallet balance decreases without requiring a pre-existing balanceUSD field', () => {
    expect(rulesSource).toMatch(/function validBalanceDecreaseOnly/);
    expect(rulesSource).toMatch(/let previousBalance/);
    expect(rulesSource).not.toMatch(
      /request\.resource\.data\.balanceUSD < resource\.data\.balanceUSD;/
    );
  });

  it('locks booking creates and lifecycle writes to Callables', () => {
    expect(rulesSource).toContain('function bookingStatusUnchanged');
    expect(rulesSource).toContain('function bookingScheduleUnchanged');
    expect(rulesSource).toMatch(/allow create: if false;/);
    expect(rulesSource).not.toContain('function clientAllowedCreateStatus');
    expect(rulesSource).toMatch(/allow update: if \([\s\S]*bookingStatusUnchanged\(\)/);
    expect(rulesSource).not.toMatch(
      /\(resource\.data\.userId\.matches\('\^client_\.\*'\) \|\| resource\.data\.userId\.matches\('\^guest_\.\*'\)\)/
    );
  });

  it('authorizes canonical booking chat via active participant owner guards', () => {
    expect(rulesSource).toContain('function isCanonicalBooking');
    expect(rulesSource).toContain('function canAccessCanonicalBookingChat');
    expect(rulesSource).toContain('function managesParticipant');
    expect(rulesSource).toMatch(
      /match \/participant_management_active_owner\/\{participantId\}[\s\S]*allow read, write: if false;/
    );
  });

  it('allows users to delete their own cancelled course bookings', () => {
    expect(rulesSource).toContain('function isCancelledCourseBooking');
    expect(rulesSource).toMatch(/allow delete: if \([\s\S]*isCancelledCourseBooking/);
    expect(rulesSource).not.toContain('allow delete: if isAdmin() || (');
  });

  it('locks function_idempotency documents to the Admin SDK', () => {
    expect(rulesSource).toMatch(/match \/function_idempotency\/\{id\}/);
    expect(rulesSource).toMatch(
      /match \/function_idempotency\/\{id\}[\s\S]*allow read, write: if false;/
    );
  });

  it('contains direct Admin monetary and destructive writes', () => {
    expect(rulesSource).toContain('function validWalletLedgerEntryFields');
    expect(rulesSource).toContain('function authoritativeMoneyFieldsUnchanged');
    expect(rulesSource).toContain('function validInitialWalletAuthority');
    expect(rulesSource).toContain('function validStarterCreditSetting');
    expect(rulesSource).toMatch(
      /allow delete: if userId\.matches\('\^client_\.\*'\)[\s\S]*isOwnEmail\(resource\.data\.email\)/
    );
    expect(rulesSource).toMatch(
      /match \/settings\/\{settingId\}[\s\S]*settingId != 'guest_wallet'/
    );
    expect(rulesSource).toMatch(/match \/wallet_ledger\/\{entryId\}[\s\S]*allow delete: if false;/);
    expect(rulesSource).not.toMatch(/match \/wallet_ledger\/\{entryId\}[\s\S]*isAdmin\(\) \|\|/);
  });

  it('protects strict and provisioned canonical courses from legacy Admin writes', () => {
    expect(rulesSource).toContain('function hasStrictCanonicalCourseTopLevelShape');
    expect(rulesSource).toContain('function canonicalCourseProtectedFromLegacyAdminWrites');
    expect(rulesSource).toMatch(
      /allow update, delete: if isAdmin\(\) &&[\s\S]*legacyAdminCourseWriteAllowed\(resource\.data\)/
    );
  });
});
