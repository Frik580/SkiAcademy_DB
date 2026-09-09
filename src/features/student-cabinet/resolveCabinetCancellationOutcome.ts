import type { RequestCancellationLifecycleStatus } from '@ski-academy/shared-domain';
import { patchCourseEnrollmentCancellationInStore } from '../course-enrollments/courseEnrollmentViewModel';
import { patchLessonBookingCancellationInStore } from '../lesson-bookings/lessonBookingViewModel';
import {
  parseCancellationLifecycleFromCommandResult,
  type CabinetCancellationCommandResult,
  type CabinetCancellationEntityKind,
} from './cabinetCancellationOutcome';

export async function resolveCabinetCancellationOutcome(input: {
  readonly entityKind: CabinetCancellationEntityKind;
  readonly entityId: string;
  readonly nextRevision: number;
  readonly commandResult: Readonly<{ status: 'success'; payload?: unknown }>;
  readonly refresh: () => Promise<void>;
  readonly readLifecycleFromStore: () => RequestCancellationLifecycleStatus | undefined;
}): Promise<CabinetCancellationCommandResult> {
  const commandLifecycle = parseCancellationLifecycleFromCommandResult(
    input.entityKind,
    input.commandResult
  );
  if (!commandLifecycle) {
    throw new Error('Cancellation command succeeded without lifecycle outcome.');
  }

  if (input.entityKind === 'lesson') {
    patchLessonBookingCancellationInStore({
      bookingId: input.entityId,
      lifecycleStatus: commandLifecycle,
      nextRevision: input.nextRevision,
    });
  } else {
    patchCourseEnrollmentCancellationInStore({
      enrollmentId: input.entityId,
      lifecycleStatus: commandLifecycle,
      nextRevision: input.nextRevision,
    });
  }

  try {
    await input.refresh();
    const storeLifecycle = input.readLifecycleFromStore();
    return {
      lifecycleStatus: storeLifecycle ?? commandLifecycle,
      refreshFailed: false,
    };
  } catch {
    return {
      lifecycleStatus: commandLifecycle,
      refreshFailed: true,
    };
  }
}
