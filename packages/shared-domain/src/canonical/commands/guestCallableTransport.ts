import { z } from 'zod';
import { CausationIdSchema, CorrelationIdSchema } from '../identifiers';
import { AggregateRevisionSchema, IanaTimeZoneSchema } from '../primitives';
import {
  CommandCalendarInputSchema,
  IdempotencyKeySchema,
  type CommandCalendarInput,
  type IdempotencyKey,
} from './commandContext';
import { CommandIntentSchemaByKind } from './commandIntents';
import type { CommandKind } from './commandKinds';

const guestParticipantProfileTransportFields = {
  guestParticipantDisplayName: z.string().trim().min(1).max(200),
  guestParticipantSkillLevel: z.string().trim().min(1).max(64),
  guestParticipantDiscipline: z.enum(['ski', 'snowboard']),
  guestParticipantAgeYears: z.number().finite().int().min(0).max(125),
} as const;

export const CreateGuestBookingRequestTransportSchema = z
  .object({
    kind: z.literal('create_guest_booking_request'),
    intent: CommandIntentSchemaByKind.create_guest_booking_request,
    idempotencyKey: IdempotencyKeySchema,
    correlationId: CorrelationIdSchema,
    causationId: CausationIdSchema.optional(),
    expectedRevision: AggregateRevisionSchema.optional(),
    calendarInput: CommandCalendarInputSchema,
    timezone: IanaTimeZoneSchema,
    ...guestParticipantProfileTransportFields,
  })
  .strict();

export type CreateGuestBookingRequestTransport = z.output<
  typeof CreateGuestBookingRequestTransportSchema
>;

const guestCallableTransportBaseFields = {
  idempotencyKey: IdempotencyKeySchema,
  correlationId: CorrelationIdSchema,
  causationId: CausationIdSchema.optional(),
  expectedRevision: AggregateRevisionSchema.optional(),
  calendarInput: CommandCalendarInputSchema.optional(),
  timezone: IanaTimeZoneSchema.optional(),
  guestActionNonce: z.string().optional(),
  guestActionSignature: z.string().optional(),
  guestParticipantDisplayName: guestParticipantProfileTransportFields.guestParticipantDisplayName.optional(),
  guestParticipantSkillLevel: guestParticipantProfileTransportFields.guestParticipantSkillLevel.optional(),
  guestParticipantDiscipline: guestParticipantProfileTransportFields.guestParticipantDiscipline.optional(),
  guestParticipantAgeYears: guestParticipantProfileTransportFields.guestParticipantAgeYears.optional(),
} as const;

function guestCallableTransportSchemaForKind<Kind extends CommandKind>(kind: Kind) {
  return z
    .object({
      kind: z.literal(kind),
      intent: CommandIntentSchemaByKind[kind],
      ...guestCallableTransportBaseFields,
    })
    .strict();
}

const guestCallableTransportSchemas = [
  CreateGuestBookingRequestTransportSchema,
  guestCallableTransportSchemaForKind('request_booking_cancellation'),
  guestCallableTransportSchemaForKind('create_course_enrollments'),
  guestCallableTransportSchemaForKind('withdraw_course_enrollment'),
  guestCallableTransportSchemaForKind('request_course_enrollment_cancellation'),
] as const;

export const CallableGuestCommandTransportSchema = z.union(guestCallableTransportSchemas);

export type CallableGuestCommandTransport = z.output<typeof CallableGuestCommandTransportSchema>;

export function parseCallableGuestCommandTransport(
  input: unknown
): z.ZodSafeParseResult<CallableGuestCommandTransport> {
  return CallableGuestCommandTransportSchema.safeParse(input);
}

export interface FrontendGuestLessonBookingCallablePayload {
  readonly kind: 'create_guest_booking_request';
  readonly intent: CreateGuestBookingRequestTransport['intent'];
  readonly idempotencyKey: IdempotencyKey;
  readonly correlationId: CreateGuestBookingRequestTransport['correlationId'];
  readonly calendarInput: CommandCalendarInput;
  readonly timezone: CreateGuestBookingRequestTransport['timezone'];
  readonly guestParticipantDisplayName: string;
  readonly guestParticipantSkillLevel: string;
  readonly guestParticipantDiscipline: 'ski' | 'snowboard';
  readonly guestParticipantAgeYears: number;
}

export function buildFrontendGuestLessonBookingCallablePayload(input: {
  readonly bookingId: string;
  readonly instructorId: string;
  readonly participantId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly durationMinutes: number;
  readonly timezone: string;
  readonly guestDisplayName: string;
  readonly guestSkillLevel: string;
  readonly guestDiscipline: 'ski' | 'snowboard';
  readonly guestAgeYears: number;
}): FrontendGuestLessonBookingCallablePayload {
  return {
    kind: 'create_guest_booking_request',
    intent: CommandIntentSchemaByKind.create_guest_booking_request.parse({
      bookingId: input.bookingId,
      instructorId: input.instructorId,
      participantIds: [input.participantId],
    }),
    idempotencyKey: IdempotencyKeySchema.parse(input.idempotencyKey),
    correlationId: CorrelationIdSchema.parse(input.correlationId),
    calendarInput: CommandCalendarInputSchema.parse({
      localDate: input.localDate,
      localTime: input.localTime,
      durationMinutes: input.durationMinutes,
    }),
    timezone: IanaTimeZoneSchema.parse(input.timezone),
    guestParticipantDisplayName: input.guestDisplayName,
    guestParticipantSkillLevel: input.guestSkillLevel,
    guestParticipantDiscipline: input.guestDiscipline,
    guestParticipantAgeYears: input.guestAgeYears,
  };
}
