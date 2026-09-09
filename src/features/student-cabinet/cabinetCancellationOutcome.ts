import {
  parseCommandResultPayload,
  type RequestCancellationLifecycleStatus,
} from '@ski-academy/shared-domain';
import type { CourseEnrollmentLifecycleStatus } from '@ski-academy/shared-domain';
import type { BookingStatus } from '@ski-academy/shared-domain';

export type CabinetCancellationEntityKind = 'lesson' | 'course';

export interface CabinetCancellationCommandResult {
  readonly lifecycleStatus: RequestCancellationLifecycleStatus;
  readonly refreshFailed: boolean;
}

export type CabinetCancellationNotification = Readonly<{
  readonly type: 'success' | 'warning';
  readonly titleKey: string;
  readonly messageKey: string;
}>;

const CANCELLATION_COMMAND_KINDS = {
  lesson: 'request_booking_cancellation',
  course: 'request_course_enrollment_cancellation',
} as const;

export function parseCancellationLifecycleFromCommandResult(
  entityKind: CabinetCancellationEntityKind,
  result: Readonly<{ status: string; payload?: unknown }>
): RequestCancellationLifecycleStatus | undefined {
  if (result.status !== 'success') return undefined;
  const parsed = parseCommandResultPayload(
    CANCELLATION_COMMAND_KINDS[entityKind],
    result.payload ?? {}
  );
  return parsed.success ? parsed.data.lifecycleStatus : undefined;
}

export function resolveLessonCancellationLifecycleFromStore(
  bookingId: string,
  items: ReadonlyMap<string, { readonly status: BookingStatus }>
): RequestCancellationLifecycleStatus | undefined {
  const item = items.get(bookingId);
  if (item?.status === 'cancelled') return 'cancelled';
  if (item?.status === 'pending_cancellation') return 'pending_cancellation';
  return undefined;
}

export function resolveCourseCancellationLifecycleFromStore(
  enrollmentId: string,
  items: ReadonlyMap<string, { readonly lifecycleStatus: CourseEnrollmentLifecycleStatus }>
): RequestCancellationLifecycleStatus | undefined {
  const item = items.get(enrollmentId);
  if (item?.lifecycleStatus === 'cancelled') return 'cancelled';
  if (item?.lifecycleStatus === 'pending_cancellation') return 'pending_cancellation';
  return undefined;
}

export function presentCabinetCancellationNotifications(
  entityKind: CabinetCancellationEntityKind,
  outcome: CabinetCancellationCommandResult
): readonly CabinetCancellationNotification[] {
  const notifications: CabinetCancellationNotification[] = [];

  if (outcome.lifecycleStatus === 'cancelled') {
    notifications.push({
      type: 'success',
      titleKey: entityKind === 'lesson' ? 'lessonCancelledImmediate' : 'courseCancelledImmediate',
      messageKey:
        entityKind === 'lesson' ? 'lessonCancelledImmediateDesc' : 'courseCancelledImmediateDesc',
    });
  } else {
    notifications.push({
      type: 'success',
      titleKey:
        entityKind === 'lesson' ? 'lessonCancellationRequested' : 'courseCancellationRequested',
      messageKey:
        entityKind === 'lesson'
          ? 'lessonCancellationRequestedDesc'
          : 'courseCancellationRequestedDesc',
    });
  }

  if (outcome.refreshFailed) {
    notifications.push({
      type: 'warning',
      titleKey: 'cabinetCancellationRefreshWarning',
      messageKey: 'cabinetCancellationRefreshWarningDesc',
    });
  }

  return notifications;
}
