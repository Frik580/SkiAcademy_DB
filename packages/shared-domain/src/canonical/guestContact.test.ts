import { describe, expect, it } from 'vitest';
import {
  GuestContactDetailsSchema,
  GuestContactInputSchema,
  normalizeGuestPhone,
} from './guestContact';

describe('guest phone format', () => {
  it.each([
    ['+7 701 123 45 67', '+77011234567'],
    ['+77011234567', '+77011234567'],
    ['87011234567', '+77011234567'],
    ['8 (701) 123-45-67', '+77011234567'],
    ['77011234567', '+77011234567'],
    ['+7 (727) 123-45-67', '+77271234567'],
    [' +996 (555) 123-456 ', '+996555123456'],
    ['+998 90 123 45 67', '+998901234567'],
    ['+44 20 7946 0958', '+442079460958'],
    ['+6834005', '+6834005'],
    ['+123456789012345', '+123456789012345'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeGuestPhone(input)).toBe(expected);
    expect(GuestContactInputSchema.parse({ phone: input }).phone).toBe(expected);
    expect(normalizeGuestPhone(expected)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '123456',
    '+555',
    '+123456',
    '+1234567890123456',
    '+012345678',
    '+7701123456',
    '+770112345678',
    '7011234567',
    'abc',
    '+7 701 abc 45 67',
    '+77011234567#',
    '++77011234567',
    '+7/701/1234567',
    '+77011234567 ext 1',
    '8'.repeat(65),
    '+7.701.1234567',
  ])('rejects %j', (input) => {
    expect(normalizeGuestPhone(input)).toBeUndefined();
    expect(GuestContactInputSchema.safeParse({ phone: input }).success).toBe(false);
  });

  it('keeps historical contact reads permissive and unchanged', () => {
    for (const phone of ['+555', '+7 701 123 45 67', '123456']) {
      expect(GuestContactDetailsSchema.parse({ phone })).toEqual({ phone });
    }
  });
});
