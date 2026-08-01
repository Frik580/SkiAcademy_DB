import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RULES_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../firestore.rules');
const rulesSource = readFileSync(RULES_PATH, 'utf8');

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
    expect(rulesSource).toContain('function validCourseEnrollmentReactivation');
    expect(rulesSource).toContain('validCourseEnrollmentReactivation(bookingId, resource.data, request.resource.data)');
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

  it('allows users to delete their own cancelled course bookings', () => {
    expect(rulesSource).toContain('function isCancelledCourseBooking');
    expect(rulesSource).toMatch(/allow delete: if isAdmin\(\) \|\| \([\s\S]*isCancelledCourseBooking/);
  });
});
