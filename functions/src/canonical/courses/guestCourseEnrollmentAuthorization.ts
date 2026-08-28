import {
  CanonicalCommandError,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  guestSubjectIdFromCourseEnrollmentId,
  parseGuestParticipantProfileFromTransportMetadata,
  type CommandEnvelope,
  type CourseEnrollmentId,
  type GuestParticipantProfileFromTransport,
  type GuestSubjectId,
  type Participant,
} from '@ski-academy/shared-domain';
import { assertParticipantActive } from '../participantAccess/participantAccessAuthorization';
import { parseParticipant } from '../participantAccess/participantAccessStore';

export function requireGuestActor(
  envelope: CommandEnvelope
): { readonly guestSubjectId: GuestSubjectId } {
  const actor = envelope.context.actor;
  if (actor.kind !== 'guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  return actor;
}

export function assertGuestCourseEnrollmentRequestContext(
  envelope: CommandEnvelope<'create_course_enrollments'>
): void {
  if (envelope.context.source !== 'guest_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (envelope.context.exercisedCapability !== 'guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (envelope.intent.participantIds.length !== 1) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'unsupported' },
    });
  }
  if (!envelope.intent.enrollmentIds || envelope.intent.enrollmentIds.length !== 1) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'enrollmentIds', reason: 'required' },
    });
  }
}

export function assertGuestActorMatchesEnrollment(
  envelope: CommandEnvelope<'create_course_enrollments'>,
  enrollmentId: CourseEnrollmentId
): void {
  const guestActor = requireGuestActor(envelope);
  const expected = guestSubjectIdFromCourseEnrollmentId(enrollmentId);
  if (guestActor.guestSubjectId !== expected) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function resolveGuestParticipantProfileForCourseEnrollment(
  envelope: CommandEnvelope<'create_course_enrollments'>
): GuestParticipantProfileFromTransport {
  const parsed = parseGuestParticipantProfileFromTransportMetadata(
    envelope.context.transportMetadata
  );
  if (!parsed.success) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'guestParticipantDisplayName', reason: 'required' },
    });
  }
  return parsed.data;
}

export function assertGuestParticipantForCourseEnrollment(
  envelope: CommandEnvelope<'create_course_enrollments'>,
  participant: Participant | undefined,
  participantId: Participant['participantId']
): Participant {
  const active = assertParticipantActive(envelope, participant);
  if (active.participantId !== participantId) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'participantIds', reason: 'conflict' },
    });
  }
  if (active.management.kind !== 'unmanaged_guest') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'participant', reason: 'conflict' },
    });
  }
  return active;
}

export function readGuestLinkCredentialFromTransport(
  envelope: CommandEnvelope
): { readonly nonce?: string; readonly signature?: string } {
  return {
    nonce: envelope.context.transportMetadata?.[GUEST_ACTION_NONCE_TRANSPORT_KEY],
    signature: envelope.context.transportMetadata?.[GUEST_ACTION_SIGNATURE_TRANSPORT_KEY],
  };
}

export function parseGuestParticipantForEnrollment(
  data: Record<string, unknown> | undefined
): Participant | undefined {
  return parseParticipant(data);
}
