import { describe, expect, it } from 'vitest';
import { QueryBookingChangeRequestReadModelsInputSchema } from './bookingChangeRequestReadModel';
import { QueryBookingProposalReadModelsInputSchema } from './bookingProposalReadModel';
import { QueryLessonBookingReadModelsInputSchema } from './lessonBookingReadModel';
import { QueryParticipantInstructorAccessReadModelsInputSchema } from './participantInstructorAccessReadModel';

describe('collaboration read model callable transport contracts', () => {
  const cases = [
    {
      name: 'QueryLessonBookingReadModelsInputSchema',
      schema: QueryLessonBookingReadModelsInputSchema,
      input: {
        scope: 'instructor_hot' as const,
        idempotencyKey: 'read:lesson_booking:instructor_hot:start:none',
      },
    },
    {
      name: 'QueryBookingProposalReadModelsInputSchema',
      schema: QueryBookingProposalReadModelsInputSchema,
      input: {
        scope: 'account_open' as const,
        idempotencyKey: 'read:booking_proposal:account_open',
      },
    },
    {
      name: 'QueryBookingChangeRequestReadModelsInputSchema',
      schema: QueryBookingChangeRequestReadModelsInputSchema,
      input: {
        scope: 'instructor_open' as const,
        idempotencyKey: 'read:booking_change_request:instructor_open',
      },
    },
    {
      name: 'QueryParticipantInstructorAccessReadModelsInputSchema',
      schema: QueryParticipantInstructorAccessReadModelsInputSchema,
      input: {
        scope: 'account_manager' as const,
        participantId: 'participant_fixture_01',
        instructorId: 'instructor_fixture_01',
        idempotencyKey:
          'read:participant_instructor_access:account_manager:participant_fixture_01:instructor_fixture_01',
      },
    },
  ];

  it.each(cases)('accepts transport-injected idempotencyKey for $name', ({ schema, input }) => {
    expect(schema.safeParse(input).success).toBe(true);
  });
});
