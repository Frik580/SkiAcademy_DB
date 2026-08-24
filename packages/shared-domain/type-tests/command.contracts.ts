import type { CommandEnvelope, CommandIntentForKind } from '../src/canonical/commands';
import {
  accountCommandActor,
  AccountIdSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
} from '../src';

const accountId = AccountIdSchema.parse('account_type_cmd_01');
const correlationId = CorrelationIdSchema.parse('correlation_type_cmd_01');

const completeIntent: CommandIntentForKind<'complete_booking'> = {
  bookingId: BookingIdSchema.parse('booking_type_cmd_01'),
};

const createIntent: CommandIntentForKind<'create_confirmed_booking'> = {
  bookingId: BookingIdSchema.parse('booking_type_cmd_02'),
  instructorId: InstructorIdSchema.parse('instructor_type_cmd_01'),
  participantIds: [ParticipantIdSchema.parse('participant_type_cmd_01')],
};

const baseContext = {
  actor: accountCommandActor(accountId),
  exercisedCapability: 'account_owner' as const,
  idempotencyKey: 'type-idem-01',
  correlationId,
  source: 'client_callable' as const,
};

const completeEnvelope: CommandEnvelope<'complete_booking'> = {
  kind: 'complete_booking',
  context: baseContext,
  intent: completeIntent,
};

const createEnvelope: CommandEnvelope<'create_confirmed_booking'> = {
  kind: 'create_confirmed_booking',
  context: baseContext,
  intent: createIntent,
};

// Intent payloads are separated per command kind at compile time.
// @ts-expect-error create_confirmed_booking requires instructor and participant fields
const _missingCreateFields: CommandIntentForKind<'create_confirmed_booking'> = completeIntent;

// Envelope discriminant ties intent shape to command kind.
// @ts-expect-error kind literal must match envelope generic parameter
const _wrongKindEnvelope: CommandEnvelope<'complete_booking'> = createEnvelope;

void completeEnvelope;
void createEnvelope;

export {};
