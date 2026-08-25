import { describe, expect, it } from 'vitest';
import {
  CommandIdSchema,
  KztMinorUnitsSchema,
  ParticipantIdSchema,
  createIncrementalRequirement,
  incrementalRequirementIdFromPartyAddition,
  markIncrementalRequirementRolledBack,
  allocateIncrementalRequirementFunding,
  timestampFromDate,
} from '@ski-academy/shared-domain';

describe('bookingPartyFinance', () => {
  const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
  const commandId = CommandIdSchema.parse('command_party_finance_01');
  const participantId = ParticipantIdSchema.parse('participant_party_finance_01');

  it('zeros allocation fields when an incremental requirement is rolled back', () => {
    const requirement = allocateIncrementalRequirementFunding(
      createIncrementalRequirement({
        incrementalRequirementId: incrementalRequirementIdFromPartyAddition({
          commandId,
          participantId,
        }),
        participantId,
        createdAt: decidedAt,
        createdByCommandId: commandId,
        requiredPriceDelta: KztMinorUnitsSchema.parse(6_000),
      }),
      KztMinorUnitsSchema.parse(4_000)
    );
    expect(requirement.allocatedSettledAmount).toBe(4_000);
    expect(requirement.state).toBe('active');

    const rolledBack = markIncrementalRequirementRolledBack(requirement);
    expect(rolledBack.state).toBe('rolled_back');
    expect(rolledBack.allocatedSettledAmount).toBe(0);
    expect(rolledBack.allocatedRetainedAmount).toBe(0);
  });
});
