import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { assertAdministrator } from '../participantAccess/participantAccessAuthorization';

export function assertCourseProvisioningAdminAuthorization(
  envelope: CommandEnvelope<
    'provision_canonical_course' | 'apply_canonical_course_provisioning_manifest'
  >
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
