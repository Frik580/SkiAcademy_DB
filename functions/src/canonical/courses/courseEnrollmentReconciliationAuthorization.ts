import {
  CanonicalCommandError,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';

export function assertReconcileCourseEnrollmentAuthorization(
  envelope: CommandEnvelope<'reconcile_course_enrollment'>
): 'system' | 'administrator' {
  const { actor, exercisedCapability, source } = envelope.context;

  if (actor.kind === 'system' && exercisedCapability === 'system') {
    if (source !== 'system_reconciliation' && source !== 'scheduler') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    return 'system';
  }

  if (
    actor.kind === 'account' &&
    exercisedCapability === 'administrator' &&
    source === 'admin_callable'
  ) {
    return 'administrator';
  }

  throw new CanonicalCommandError('forbidden', {
    correlationId: envelope.context.correlationId,
  });
}
