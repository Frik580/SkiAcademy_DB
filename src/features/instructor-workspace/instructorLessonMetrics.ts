import {
  bookingIsCompletedService,
  bookingIsNoShowOutcome,
  bookingOccupiesInstructorSlot,
  type BookingLifecycleStatus,
} from '@ski-academy/shared-domain';
import type { BookingStatus } from '../../types';

/**
 * Instructor dashboard business/operational metrics.
 *
 * Counted per Booking (one group lesson = one slot), never per Participant.
 * Source: drained instructor_hot + instructor_history after revision merge.
 *
 * Window: lifetime of the instructor lesson read-model set (hot ∪ history).
 * Student-learning Attendance is not used here.
 */
export type InstructorLessonMetricItem = {
  readonly id: string;
  readonly revision: number;
  readonly status: BookingStatus;
};

export type InstructorLessonMetrics = {
  /** Non-cancelled lesson bookings (existing dashboard “Всего занятий”). */
  readonly total: number;
  /** Lifecycle pending + pending_cancellation. */
  readonly pending: number;
  /** Lifecycle confirmed. */
  readonly confirmed: number;
  /** Lifecycle completed only — UI “Завершено”. */
  readonly completed: number;
  /** Lifecycle no_show — UI “Неявка”. */
  readonly noShow: number;
  /** completed + no_show; occupancy helper, not labelled “completed”. */
  readonly occupied: number;
  readonly cancelled: number;
  /** Revenue is canonical Payment only; dashboard keeps a placeholder. */
  readonly revenue: undefined;
};

export type InstructorRosterParticipant = {
  readonly participantId: string;
};

export function mergeInstructorLessonMetricItems(
  items: readonly InstructorLessonMetricItem[]
): InstructorLessonMetricItem[] {
  const merged = new Map<string, InstructorLessonMetricItem>();
  for (const item of items) {
    const cached = merged.get(item.id);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.id, item);
    }
  }
  return [...merged.values()];
}

function asLifecycleStatus(status: BookingStatus): BookingLifecycleStatus {
  return status;
}

export function computeInstructorLessonMetrics(
  items: readonly InstructorLessonMetricItem[]
): InstructorLessonMetrics {
  let total = 0;
  let pending = 0;
  let confirmed = 0;
  let completed = 0;
  let noShow = 0;
  let occupied = 0;
  let cancelled = 0;

  for (const item of mergeInstructorLessonMetricItems(items)) {
    const lifecycle = asLifecycleStatus(item.status);
    if (item.status === 'cancelled') {
      cancelled += 1;
      continue;
    }
    total += 1;
    if (item.status === 'pending' || item.status === 'pending_cancellation') {
      pending += 1;
    }
    if (item.status === 'confirmed') {
      confirmed += 1;
    }
    if (bookingIsCompletedService(lifecycle)) {
      completed += 1;
    }
    if (bookingIsNoShowOutcome(lifecycle)) {
      noShow += 1;
    }
    if (bookingOccupiesInstructorSlot(lifecycle)) {
      occupied += 1;
    }
  }

  return {
    total,
    pending,
    confirmed,
    completed,
    noShow,
    occupied,
    cancelled,
    revenue: undefined,
  };
}

/**
 * Roster “занятий” / “lessons” = associated non-cancelled bookings with this
 * instructor, not “Завершено”. One booking increments each participant once.
 */
export function countInstructorRosterLessons(
  bookings: readonly {
    readonly status: BookingStatus;
    readonly participants: readonly InstructorRosterParticipant[];
  }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue;
    for (const participant of booking.participants) {
      counts.set(participant.participantId, (counts.get(participant.participantId) ?? 0) + 1);
    }
  }
  return counts;
}
