import {
  BookingIdSchema,
  guestCommandActor,
  GUEST_ACTION_NONCE_TRANSPORT_KEY,
  GUEST_ACTION_SIGNATURE_TRANSPORT_KEY,
  GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  parseGuestParticipantProfileFromTransportMetadata,
  type CommandContext,
  type CommandEnvelope,
  type CommandKind,
  type GuestSubjectId,
} from '@ski-academy/shared-domain';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { CallableCommandTransportInput } from './callableTransportAdapter';

export interface CallableGuestCommandTransportInput<Kind extends CommandKind> {
  readonly kind: Kind;
  readonly intent: CommandEnvelope<Kind>['intent'];
  readonly idempotencyKey: CommandContext['idempotencyKey'];
  readonly correlationId: CommandContext['correlationId'];
  readonly causationId?: CommandContext['causationId'];
  readonly expectedRevision?: CommandContext['expectedRevision'];
  readonly calendarInput?: CommandContext['calendarInput'];
  readonly timezone?: CommandContext['timezone'];
  readonly guestActionNonce?: string;
  readonly guestActionSignature?: string;
  readonly guestParticipantDisplayName?: string;
  readonly guestParticipantSkillLevel?: string;
  readonly guestParticipantDiscipline?: 'ski' | 'snowboard';
  readonly guestParticipantAgeYears?: number;
}

export function deriveGuestSubjectIdForIntent(
  intent: CommandEnvelope<CommandKind>['intent']
): GuestSubjectId | undefined {
  const record = intent as Record<string, unknown>;
  const parsedBookingId = BookingIdSchema.safeParse(record.bookingId);
  if (!parsedBookingId.success) {
    return undefined;
  }
  return guestSubjectIdFromBookingId(parsedBookingId.data);
}

export function buildGuestCommandContextFromCallable(
  guestSubjectId: GuestSubjectId,
  input: Pick<
    CallableGuestCommandTransportInput<CommandKind>,
    | 'idempotencyKey'
    | 'correlationId'
    | 'causationId'
    | 'expectedRevision'
    | 'calendarInput'
    | 'timezone'
    | 'guestActionNonce'
    | 'guestActionSignature'
    | 'guestParticipantDisplayName'
    | 'guestParticipantSkillLevel'
    | 'guestParticipantDiscipline'
    | 'guestParticipantAgeYears'
  >
): CommandContext {
  const transportMetadata: Record<string, string> = { transport: 'firebase_callable' };
  if (input.guestActionNonce) {
    transportMetadata[GUEST_ACTION_NONCE_TRANSPORT_KEY] = input.guestActionNonce;
  }
  if (input.guestActionSignature) {
    transportMetadata[GUEST_ACTION_SIGNATURE_TRANSPORT_KEY] = input.guestActionSignature;
  }

  const guestParticipantProfile = parseGuestParticipantProfileFromTransportMetadata({
    ...(input.guestParticipantDisplayName === undefined
      ? {}
      : { [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.displayName]: input.guestParticipantDisplayName }),
    ...(input.guestParticipantSkillLevel === undefined
      ? {}
      : { [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.skillLevel]: input.guestParticipantSkillLevel }),
    ...(input.guestParticipantDiscipline === undefined
      ? {}
      : { [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.discipline]: input.guestParticipantDiscipline }),
    ...(input.guestParticipantAgeYears === undefined
      ? {}
      : {
          [GUEST_PARTICIPANT_TRANSPORT_METADATA_KEYS.ageYears]: String(
            input.guestParticipantAgeYears
          ),
        }),
  });
  if (guestParticipantProfile.success) {
    Object.assign(
      transportMetadata,
      guestParticipantTransportMetadataFromProfile(guestParticipantProfile.data)
    );
  }

  return {
    actor: guestCommandActor(guestSubjectId),
    exercisedCapability: 'guest',
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    source: 'guest_callable',
    ...(input.calendarInput === undefined ? {} : { calendarInput: input.calendarInput }),
    ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
    transportMetadata,
  };
}

export function buildGuestCommandEnvelopeFromCallable<Kind extends CommandKind>(
  guestSubjectId: GuestSubjectId,
  input: CallableGuestCommandTransportInput<Kind>
): CommandEnvelope<Kind> {
  return {
    kind: input.kind,
    context: buildGuestCommandContextFromCallable(guestSubjectId, input),
    intent: input.intent,
  };
}

export function parseCallableGuestCommandTransportInput<Kind extends CommandKind>(
  request: CallableRequest<CallableGuestCommandTransportInput<Kind>>
): CallableGuestCommandTransportInput<Kind> {
  const data = request.data;
  if (!data || typeof data !== 'object') {
    throw new Error('Callable payload is required.');
  }
  return data as CallableGuestCommandTransportInput<Kind>;
}

export function parseAuthenticatedCallableCommandTransportInput<Kind extends CommandKind>(
  request: CallableRequest<
    CallableCommandTransportInput<Kind> & {
      readonly exercisedCapability?: unknown;
      readonly administratorContext?: unknown;
    }
  >
): CallableCommandTransportInput<Kind> & {
  readonly exercisedCapability?: unknown;
  readonly administratorContext?: unknown;
} {
  const data = request.data;
  if (!data || typeof data !== 'object') {
    throw new Error('Callable payload is required.');
  }
  return data as CallableCommandTransportInput<Kind> & {
    readonly exercisedCapability?: unknown;
    readonly administratorContext?: unknown;
  };
}
