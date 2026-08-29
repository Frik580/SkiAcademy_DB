import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  WalletSchema,
  accountCommandActor,
  participantManagementIdFromSelfProvisioning,
  selfParticipantIdFromAccountId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { createAuthoritativeCommandClock } from '../../functions/src/canonical/commands/commandClock';
import { createProductionCanonicalCommands } from '../../functions/src/canonical/commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../../functions/src/canonical/transactions';
import { queryManagedParticipantPickerReadModels } from '../../functions/src/canonical/readModels/managedParticipantPickerReadModels';

const correlationId = CorrelationIdSchema.parse('correlation_picker_booking_flow');
const accountId = AccountIdSchema.parse('account_picker_booking_flow');
const instructorId = InstructorIdSchema.parse('instructor_picker_booking_flow');
const bookingId = BookingIdSchema.parse('booking_picker_booking_flow');
const dependentParticipantId = ParticipantIdSchema.parse('participant_picker_dependent');
const dependentManagementId = ParticipantManagementIdSchema.parse('management_picker_dependent');
const selfParticipantId = selfParticipantIdFromAccountId(accountId);
const selfManagementId = participantManagementIdFromSelfProvisioning(accountId);
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

const BOOKING_PRICE_KZT = 12_000;
const WALLET_BALANCE_KZT = 50_000;

const audit = {
  createdByCommandId: 'seed',
  lastChangedByCommandId: 'seed',
  correlationId,
};

function environment(at = '2026-01-01T00:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function createFixtureFirestore(): Firestore {
  const docs = new Map<string, Record<string, unknown>>([
    [
      `users/${accountId}`,
      AccountSchema.parse({
        accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      }),
    ],
    [
      `participants/${selfParticipantId}`,
      {
        participantId: selfParticipantId,
        displayName: 'Self Picker Client',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: selfManagementId },
        lifecycle: { status: 'active' },
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
    ],
    [
      `participant_management/${selfManagementId}`,
      {
        participantManagementId: selfManagementId,
        participantId: selfParticipantId,
        accountId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
    ],
    [
      `participants/${dependentParticipantId}`,
      {
        participantId: dependentParticipantId,
        displayName: 'Picker Dependent',
        age: { kind: 'birth_date', birthDate: '2014-05-01' },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: dependentManagementId },
        lifecycle: { status: 'active' },
        revision: 4,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
    ],
    [
      `participant_management/${dependentManagementId}`,
      {
        participantManagementId: dependentManagementId,
        participantId: dependentParticipantId,
        accountId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 3,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
    ],
  ]);

  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = docs.get(`${name}/${id}`);
          return {
            exists: data !== undefined,
            data: () => data,
          };
        },
      }),
      where: (field: string, _op: string, value: unknown) => ({
        limit: () => ({
          get: async () => ({
            docs: [...docs.entries()]
              .filter(([path]) => path.startsWith(`${name}/`))
              .map(([, data]) => data)
              .filter((data) => data[field] === value)
              .map((data) => ({
                data: () => data,
              })),
          }),
        }),
      }),
    }),
  } as unknown as Firestore;
}

describe('canonical booking after managed participant picker read model', () => {
  it('books using picker revision as display-only metadata without stale_version', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${accountId}`]: AccountSchema.parse({
        accountId,
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      }),
      [`instructors/${instructorId}`]: {
        id: instructorId,
        name: 'Picker Booking Instructor',
        pricePerHourKZT: BOOKING_PRICE_KZT,
        isAvailable: true,
      },
      [`participants/${selfParticipantId}`]: {
        participantId: selfParticipantId,
        displayName: 'Self Picker Client',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: selfManagementId },
        lifecycle: { status: 'active' },
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
      [`participant_management/${selfManagementId}`]: {
        participantManagementId: selfManagementId,
        participantId: selfParticipantId,
        accountId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
      [`participants/${dependentParticipantId}`]: {
        participantId: dependentParticipantId,
        displayName: 'Picker Dependent',
        age: { kind: 'birth_date', birthDate: '2014-05-01' },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: dependentManagementId },
        lifecycle: { status: 'active' },
        revision: 4,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
      [`participant_management/${dependentManagementId}`]: {
        participantManagementId: dependentManagementId,
        participantId: dependentParticipantId,
        accountId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        revision: 3,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit,
      },
      [`users/${accountId}/wallet/state`]: WalletSchema.parse({
        accountId,
        currency: 'KZT',
        balance: WALLET_BALANCE_KZT,
        revision: 1,
        eventRevision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
      }),
    });

    const picker = await queryManagedParticipantPickerReadModels(createFixtureFirestore(), accountId);
    expect(picker.items).toHaveLength(2);

    const dependentOption = picker.items.find(
      (item) => item.participantId === dependentParticipantId
    );
    expect(dependentOption?.revision).toBe(4);

    const commands = createProductionCanonicalCommands(environment(), executor);
    const envelope: CommandEnvelope<'create_confirmed_booking'> = {
      kind: 'create_confirmed_booking',
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'parent_guardian',
        idempotencyKey: 'picker-dependent-booking',
        correlationId,
        source: 'client_callable',
        calendarInput: {
          localDate: '2026-02-10',
          localTime: '10:00',
          durationMinutes: 60,
        },
        timezone: 'Asia/Almaty',
      },
      intent: {
        bookingId,
        instructorId,
        participantIds: [dependentOption!.participantId],
      },
    };

    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');
    expect(result.error).toBeUndefined();
  });
});
