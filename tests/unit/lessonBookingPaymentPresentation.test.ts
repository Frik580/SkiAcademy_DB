import { describe, expect, it } from 'vitest';
import type { TranslationKey } from '../../src/app/providers/LanguageContext';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import {
  formatLessonBookingPaymentAmount,
  lessonBookingPaymentDisplayLabel,
  resolveLessonBookingPaymentDisplay,
} from '../../src/features/lesson-bookings/lessonBookingPaymentPresentation';

const translate = (key: TranslationKey) =>
  (
    ({
      paid: 'Paid',
      paymentDetailsUnavailable: 'Payment details unavailable',
      paymentDetailsWithheld: 'Payment details withheld',
      paymentStatusUnpaid: 'Unpaid',
    }) as Partial<Record<TranslationKey, string>>
  )[key] ?? key;

function lessonBooking(
  payment: LessonBookingCabinetItem['payment']
): Pick<LessonBookingCabinetItem, 'payment'> {
  return { payment };
}

describe('lessonBookingPaymentPresentation', () => {
  it('formats production-like paid KZT amount', () => {
    expect(formatLessonBookingPaymentAmount(50000)).toBe('50 000 ₸');
  });

  it('resolves visible paid payment for calendar display', () => {
    const display = resolveLessonBookingPaymentDisplay(
      lessonBooking({ kind: 'visible', paymentStatus: 'paid', price: 50000 }),
      translate
    );
    expect(display).toEqual({
      kind: 'visible',
      amountLabel: '50 000 ₸',
      statusLabel: 'Paid',
    });
    expect(lessonBookingPaymentDisplayLabel(display, translate)).toBe('50 000 ₸ · Paid');
  });

  it('keeps withheld fallback distinct from missing payment', () => {
    const withheld = resolveLessonBookingPaymentDisplay(lessonBooking({ kind: 'withheld' }), translate);
    const missing = resolveLessonBookingPaymentDisplay(
      lessonBooking({ kind: 'visible' }),
      translate
    );
    expect(lessonBookingPaymentDisplayLabel(withheld, translate)).toBe('Payment details withheld');
    expect(lessonBookingPaymentDisplayLabel(missing, translate)).toBe(
      'Payment details unavailable'
    );
  });
});
