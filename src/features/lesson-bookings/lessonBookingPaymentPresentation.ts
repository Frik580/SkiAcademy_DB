import type { LessonBookingCabinetItem } from './lessonBookingContracts';
import type { TranslationKey } from '../../app/providers/LanguageContext';

export type LessonBookingPaymentDisplay =
  | {
      readonly kind: 'visible';
      readonly amountLabel: string;
      readonly statusLabel: string;
    }
  | { readonly kind: 'withheld' }
  | { readonly kind: 'unavailable' };

const PAYMENT_STATUS_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  unpaid: 'paymentStatusUnpaid',
  partially_paid: 'paymentStatusPartiallyPaid',
  paid: 'paid',
  refunded: 'paymentStatusRefunded',
  partially_refunded: 'paymentStatusPartiallyRefunded',
};

export function formatLessonBookingPaymentAmount(priceKzt: number): string {
  return `${priceKzt.toLocaleString('ru-RU')} ₸`;
}

export function resolveLessonBookingPaymentDisplay(
  booking: Pick<LessonBookingCabinetItem, 'payment'>,
  translate: (key: TranslationKey) => string
): LessonBookingPaymentDisplay {
  if (booking.payment.kind === 'withheld') {
    return { kind: 'withheld' };
  }
  if (
    booking.payment.kind === 'visible' &&
    booking.payment.price !== undefined &&
    booking.payment.paymentStatus !== undefined
  ) {
    const statusKey = PAYMENT_STATUS_TRANSLATION_KEYS[booking.payment.paymentStatus];
    return {
      kind: 'visible',
      amountLabel: formatLessonBookingPaymentAmount(booking.payment.price),
      statusLabel: statusKey ? translate(statusKey) : booking.payment.paymentStatus,
    };
  }
  return { kind: 'unavailable' };
}

export function lessonBookingPaymentDisplayLabel(
  display: LessonBookingPaymentDisplay,
  translate: (key: TranslationKey) => string
): string {
  if (display.kind === 'visible') {
    return `${display.amountLabel} · ${display.statusLabel}`;
  }
  if (display.kind === 'withheld') {
    return translate('paymentDetailsWithheld');
  }
  return translate('paymentDetailsUnavailable');
}
