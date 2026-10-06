import {
  CanonicalCommandError,
  CanonicalTimestampSchema,
  type CommandId,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  canonicalReference,
  assertExpectedRevision,
  commandSuccessResult,
  guestSubjectIdFromBookingId,
  guestSubjectIdFromCourseEnrollmentId,
  nextAggregateRevision,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
  type Participant,
} from '@ski-academy/shared-domain';
import type { CommandHandlerMap } from '../commands/canonicalCommands';
import {
  executeAuthoritativeIdempotentCanonicalCommand,
  type AuthoritativeIdempotentCanonicalCommandHandler,
} from '../commands/idempotentCommandExecution';
import {
  verifyGuestActionCredentialPartsAuthoritative,
  verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative,
} from '../bookings/guestCredentialVerification';
import { bookingPath, parseBooking } from '../bookings/bookingStore';
import {
  parseParticipant,
  participantPath,
  PARTICIPANT_ACCESS_PLANNING_ESTIMATES,
} from '../participantAccess/participantAccessStore';
import { buildParticipantAccessAuditPlan } from '../participantAccess/participantAccessAudit';
import { courseEnrollmentPath, parseCourseEnrollment } from './courseEnrollmentStore';
import { coursePath, parseCourse } from './courseStore';
import type { GuestCourseEnrollmentCommandEnvironment } from './guestCourseEnrollmentLifecycle';

function completeGuestParticipantProfileHandler(
  envelope: CommandEnvelope<'complete_guest_participant_profile'>,
  environment: GuestCourseEnrollmentCommandEnvironment,
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor']
): Promise<CommandResult<'complete_guest_participant_profile'>> {
  const identity = resolveCommandIdempotencyIdentity(envelope, environment.scope);

  let participantRecord!: Participant;
  let bookingCreationCommandId: CommandId | undefined;

  const handler: AuthoritativeIdempotentCanonicalCommandHandler<'complete_guest_participant_profile'> =
    {
      read: async (session) => {
        if (
          envelope.context.source !== 'guest_callable' ||
          envelope.context.actor.kind !== 'guest'
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }

        let participantId: Participant['participantId'];
        const nonce = envelope.context.transportMetadata?.[GUEST_ACTION_NONCE_TRANSPORT_KEY];
        const signature =
          envelope.context.transportMetadata?.[GUEST_ACTION_SIGNATURE_TRANSPORT_KEY];
        if (!nonce || !signature || !environment.guestActionTokenSecret) {
          throw new CanonicalCommandError('unauthorized', {
            correlationId: envelope.context.correlationId,
          });
        }

        if ('bookingId' in envelope.intent) {
          const path = bookingPath(envelope.intent.bookingId);
          const bookingRead = await session.tx.get({ path });
          session.plan.planRead({ path, category: 'aggregate' });
          const booking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
          const expectedGuestSubjectId = guestSubjectIdFromBookingId(envelope.intent.bookingId);
          // Cancellation or account linking revokes profile-completion authority.
          if (
            !booking ||
            booking.attribution.bookingOrigin !== 'guest' ||
            booking.attribution.bookedBy.kind !== 'guest' ||
            booking.attribution.bookedBy.guestSubjectId !== expectedGuestSubjectId ||
            envelope.context.actor.guestSubjectId !== expectedGuestSubjectId ||
            booking.lifecycle.status === 'cancelled' ||
            booking.party.participantIds.length !== 1
          ) {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }
          let expiresAt: unknown;
          try {
            expiresAt = JSON.parse(
              envelope.context.transportMetadata?.guest_profile_expires_at ?? 'null'
            );
          } catch {
            expiresAt = undefined;
          }
          const parsedExpiry = CanonicalTimestampSchema.safeParse(expiresAt);
          if (!parsedExpiry.success) {
            throw new CanonicalCommandError('unauthorized', {
              correlationId: envelope.context.correlationId,
            });
          }
          const verification = verifyGuestActionCredentialPartsAuthoritative({
            secret: environment.guestActionTokenSecret,
            nonce,
            signature,
            now: timestampFromDate(environment.clock.decidedAt()),
            expectedBookingId: booking.bookingId,
            expectedGuestSubjectId,
            expectedPurpose: 'complete_guest_participant_profile',
            expiresAt: parsedExpiry.data,
          });
          if (!verification.valid) {
            throw new CanonicalCommandError('unauthorized', {
              correlationId: envelope.context.correlationId,
            });
          }
          participantId = booking.party.participantIds[0]!;
          bookingCreationCommandId = booking.audit.createdByCommandId;
        } else {
          const enrollmentDocumentPath = courseEnrollmentPath(envelope.intent.courseEnrollmentId);

          const enrollmentRead = await session.tx.get({ path: enrollmentDocumentPath });
          session.plan.planRead({ path: enrollmentDocumentPath, category: 'aggregate' });
          const enrollment = parseCourseEnrollment(
            enrollmentRead.exists ? enrollmentRead.data : undefined
          );
          if (
            !enrollment ||
            enrollment.attribution.bookingOrigin !== 'guest' ||
            enrollment.attribution.bookedBy.kind !== 'guest'
          ) {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }

          const expectedGuestSubjectId = guestSubjectIdFromCourseEnrollmentId(
            enrollment.enrollmentId
          );
          if (
            envelope.context.actor.guestSubjectId !== expectedGuestSubjectId ||
            enrollment.attribution.bookedBy.guestSubjectId !== expectedGuestSubjectId
          ) {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }

          const courseRead = await session.tx.get({ path: coursePath(enrollment.courseId) });
          session.plan.planRead({ path: coursePath(enrollment.courseId), category: 'aggregate' });
          const course = parseCourse(courseRead.exists ? courseRead.data : undefined);
          if (!course) {
            throw new CanonicalCommandError('validation', {
              correlationId: envelope.context.correlationId,
              details: { field: 'courseEnrollmentId', reason: 'conflict' },
            });
          }

          const verification = verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
            secret: environment.guestActionTokenSecret,
            nonce,
            signature,
            now: timestampFromDate(environment.clock.decidedAt()),
            expectedEnrollmentId: enrollment.enrollmentId,
            expectedGuestSubjectId,
            expectedPurpose: 'link_guest_course_enrollment',
            expiresAt: course.scheduleProjection.finalCourseDayEndsAt,
          });
          if (!verification.valid) {
            throw new CanonicalCommandError('unauthorized', {
              correlationId: envelope.context.correlationId,
            });
          }
          participantId = enrollment.participantId;
        }

        const participantRead = await session.tx.get({
          path: participantPath(participantId),
        });
        session.plan.planRead({
          path: participantPath(participantId),
          category: 'aggregate',
        });
        const participant = parseParticipant(
          participantRead.exists ? participantRead.data : undefined
        );
        if (
          !participant ||
          participant.management.kind !== 'unmanaged_guest' ||
          participant.lifecycle.status !== 'active'
        ) {
          throw new CanonicalCommandError('forbidden', {
            correlationId: envelope.context.correlationId,
          });
        }
        if ('bookingId' in envelope.intent) {
          if (participant.audit.createdByCommandId !== bookingCreationCommandId) {
            throw new CanonicalCommandError('forbidden', {
              correlationId: envelope.context.correlationId,
            });
          }
          assertExpectedRevision({
            correlationId: envelope.context.correlationId,
            expectedRevision: envelope.context.expectedRevision,
            currentRevision: participant.revision,
            requireExpectedRevision: true,
          });
        }
        participantRecord = participant;

        session.plan.planMutation({
          path: participantPath(participant.participantId),
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: PARTICIPANT_ACCESS_PLANNING_ESTIMATES.participantBytes,
        });
      },
      planAuditOutbox: async () =>
        buildParticipantAccessAuditPlan({
          envelope,
          primarySubject: {
            kind: 'participant',
            id: participantRecord.participantId,
            subjectKey: `participant:${participantRecord.participantId}`,
          },
          affectedSubjects: [canonicalReference('participant', participantRecord.participantId)],
          resultingRevisions: [
            {
              subject: canonicalReference('participant', participantRecord.participantId),
              revision: nextAggregateRevision(participantRecord.revision),
            },
          ],
        }),
      execute: async (session, context) => {
        const decidedAt = timestampFromDate(context.decidedAt);
        const updated: Participant = {
          ...participantRecord,
          age: { kind: 'age_years', years: envelope.intent.ageYears },
          skillLevel: envelope.intent.skillLevel,
          revision: nextAggregateRevision(participantRecord.revision),
          updatedAt: decidedAt,
          audit: {
            ...participantRecord.audit,
            lastChangedByCommandId: identity.commandKey,
            correlationId: envelope.context.correlationId,
          },
        };
        session.tx.update(
          { path: participantPath(participantRecord.participantId) },
          updated as Record<string, unknown>
        );
        return commandSuccessResult(envelope.kind, envelope.context.correlationId);
      },
    };

  return executeAuthoritativeIdempotentCanonicalCommand({
    envelope,
    environment,
    executor,
    handler,
  });
}

export function createGuestParticipantProfileCommandHandlers(
  executor: Parameters<typeof executeAuthoritativeIdempotentCanonicalCommand>[0]['executor'],
  environmentFactory: (base: CommandExecutionEnvironment) => GuestCourseEnrollmentCommandEnvironment
): Pick<CommandHandlerMap, 'complete_guest_participant_profile'> {
  return {
    complete_guest_participant_profile: (envelope, environment) =>
      completeGuestParticipantProfileHandler(envelope, environmentFactory(environment), executor),
  };
}
