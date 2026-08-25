import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { assertAdministrator } from '../participantAccess/participantAccessAuthorization';

export function assertCourseDayAdminAuthorization(
  envelope: CommandEnvelope<'create_course_day' | 'reassign_course_day_instructor'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (!administratorCapabilityExercisedByAccount(envelope.context)) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
}

export function assertCourseDayScheduleContext(
  envelope: CommandEnvelope<'create_course_day'>
): void {
  if (!envelope.context.calendarInput || !envelope.context.timezone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'calendarInput', reason: 'required' },
    });
  }
}

export function assertCourseDayReassignReason(
  envelope: CommandEnvelope<'reassign_course_day_instructor'>
): void {
  const explanation = envelope.intent.reasonExplanation?.trim();
  if (!explanation) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'reasonExplanation', reason: 'required' },
    });
  }
}
