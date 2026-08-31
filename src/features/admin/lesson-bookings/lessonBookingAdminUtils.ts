import {
  AccountIdSchema,
  BookingIdSchema,
  IdempotencyKeySchema,
  canonicalDeterministicHash,
  compareCanonicalTimestamps,
  selfParticipantIdFromAccountId,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import type {
  AdminLessonAccountOption,
  AdminLessonBookingTarget,
  AdminLessonBookingView,
  AdminLessonParticipantOption,
} from './lessonBookingAdminContracts';

function entropy(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function parseAdminLessonBookingView(
  value: string | null | undefined
): AdminLessonBookingView {
  return value === 'history' ? 'history' : 'hot';
}

export function createAdminLessonBookingAttemptId(action: string) {
  return IdempotencyKeySchema.parse(`admin_lesson:${action}:${entropy()}`);
}

export function createAdminLogicalBookingId() {
  return BookingIdSchema.parse(`booking_admin_${entropy()}`);
}

export function deriveAttendanceIdempotencyKey(attemptId: string, participantId: string) {
  return IdempotencyKeySchema.parse(
    `admin_lesson:attendance:${canonicalDeterministicHash([
      'admin_lesson_attendance:v1',
      attemptId,
      participantId,
    ])}`
  );
}

export function captureAdminLessonBookingTarget(
  booking: Pick<LessonBookingReadModel, 'bookingId' | 'revision'>
): AdminLessonBookingTarget {
  return {
    bookingId: booking.bookingId,
    revision: booking.revision,
  };
}

export function mergeAdminLessonBookingItems(
  cached: readonly LessonBookingReadModel[],
  incoming: readonly LessonBookingReadModel[]
): LessonBookingReadModel[] {
  const byId = new Map(cached.map((item) => [item.bookingId, item]));
  for (const item of incoming) {
    const existing = byId.get(item.bookingId);
    if (!existing || item.revision >= existing.revision) byId.set(item.bookingId, item);
  }
  return [...byId.values()].sort((left, right) => {
    const updated = compareCanonicalTimestamps(left.updatedAt, right.updatedAt);
    return updated === 0 ? left.bookingId.localeCompare(right.bookingId) : -updated;
  });
}

export function collectAdminLessonParticipantOptions(
  bookings: readonly LessonBookingReadModel[],
  accounts: readonly AdminLessonAccountOption[]
): AdminLessonParticipantOption[] {
  const byId = new Map<string, AdminLessonParticipantOption>();
  for (const booking of bookings) {
    for (const participant of booking.admin?.participants ?? []) {
      byId.set(participant.participantId, {
        participantId: participant.participantId,
        displayName: participant.displayName,
        source: 'canonical_booking',
      });
    }
  }
  for (const account of accounts) {
    const parsed = AccountIdSchema.safeParse(account.accountId);
    if (!parsed.success) continue;
    const participantId = selfParticipantIdFromAccountId(parsed.data);
    if (!byId.has(participantId)) {
      byId.set(participantId, {
        participantId,
        displayName: account.displayName,
        source: 'account_self',
      });
    }
  }
  return [...byId.values()].sort(
    (left, right) =>
      left.displayName.localeCompare(right.displayName) ||
      left.participantId.localeCompare(right.participantId)
  );
}
