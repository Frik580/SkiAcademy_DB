import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  AdministrativeAvailabilityBlockIdSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createExecuteCanonicalCommandHandler } from '../commands/executeCanonicalCommandCallable';
import { queryAdminIdentityReadModels } from '../readModels/adminIdentityReadModels';
import { createQueryAdminPlannerReadModelsHandler } from '../readModels/queryAdminPlannerReadModelsCallable';

const PROJECT_ID = 'ski-academy-admin-planner-mutations-emulator';
const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;
const adminAccountId = AccountIdSchema.parse('account_admin_planner_emulator');
const payerAccountId = AccountIdSchema.parse('account_payer_planner_emulator');
const instructorId = InstructorIdSchema.parse('instructor_admin_planner_emulator');
const correlationId = CorrelationIdSchema.parse('correlation_admin_planner_emulator');
const createdAt = timestampFromDate(new Date('2026-09-01T00:00:00.000Z'));
const localDate = '2026-09-10';

const COLLECTIONS_TO_CLEAR = [
  'users',
  'participants',
  'participant_management',
  'participant_management_active_owner',
  'instructors',
  'bookings',
  'payments',
  'monetary_events',
  'administrative_availability_blocks',
  'resource_claims',
  'resource_claim_guards',
  'activity_logs',
  'domain_outbox',
  'command_idempotency',
] as const;

let app: App;
let firestore: Firestore;

async function clearCollections(): Promise<void> {
  for (const collectionName of COLLECTIONS_TO_CLEAR) {
    const snapshot = await firestore.collection(collectionName).get();
    if (snapshot.empty) continue;
    const batch = firestore.batch();
    for (const document of snapshot.docs) batch.delete(document.ref);
    await batch.commit();
  }
}

async function seedFixture(): Promise<void> {
  const admin = AccountSchema.parse({
    accountId: adminAccountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'command_seed_admin_planner_emulator',
      lastChangedByCommandId: 'command_seed_admin_planner_emulator',
      correlationId,
    },
  });
  await firestore
    .collection('users')
    .doc(adminAccountId)
    .set({
      ...admin,
      uid: adminAccountId,
      displayName: 'Planner Admin',
      role: 'admin',
    });
  await firestore.collection('users').doc(payerAccountId).set({
    uid: payerAccountId,
    displayName: 'Planner Client',
    email: 'planner-client@example.com',
    role: 'user',
    isClientActive: true,
  });
  await firestore.collection('instructors').doc(instructorId).set({
    id: instructorId,
    name: 'Planner Instructor',
    pricePerHourKZT: 12_000,
    isAvailable: true,
  });
}

function commandRequest(data: Record<string, unknown>) {
  return {
    auth: { uid: adminAccountId },
    data,
  } as never;
}

async function executeWithDiagnostics<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const callableError = error as {
      readonly code?: unknown;
      readonly message?: unknown;
      readonly details?: unknown;
    };
    throw new Error(
      JSON.stringify({
        code: callableError.code,
        message: callableError.message,
        details: callableError.details,
      }),
      { cause: error }
    );
  }
}

async function queryPlanner(
  view: 'day' | 'week',
  localDateValue: string = localDate
) {
  return createQueryAdminPlannerReadModelsHandler(firestore)({
    auth: { uid: adminAccountId },
    data: {
      scope: 'admin_planner',
      localDate: localDateValue,
      view,
      timeZone: 'Asia/Almaty',
    },
  } as never);
}

describeEmulator('Admin Planner mutations through callable gateway', () => {
  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT_ID }, `${PROJECT_ID}-${Date.now()}`);
    firestore = getFirestore(app);
  });

  beforeEach(async () => {
    await clearCollections();
    await seedFixture();
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it.each([
    { kind: 'day_off' as const, localTime: '08:00', durationMinutes: 660 },
    { kind: 'break' as const, localTime: '12:00', durationMinutes: 60 },
  ])(
    'accepts UI-equivalent $kind payload and exposes the block in Planner read models',
    async (input) => {
      const blockId = AdministrativeAvailabilityBlockIdSchema.parse(
        `block_admin_planner_emulator_${input.kind}`
      );
      const execute = createExecuteCanonicalCommandHandler(firestore);
      const result = await execute(
        commandRequest({
          kind: 'create_administrative_availability_block',
          intent: {
            blockId,
            instructorId,
            kind: input.kind,
            notes: input.kind === 'break' ? 'Lunch' : 'Day off',
            reasonExplanation: 'Admin Planner availability block',
          },
          idempotencyKey: `admin-planner-emulator-${input.kind}`,
          correlationId,
          calendarInput: {
            localDate,
            localTime: input.localTime,
            durationMinutes: input.durationMinutes,
          },
          timezone: 'Asia/Almaty',
          administratorContext: true,
        })
      );
      expect(result.status).toBe('success');

      const dayPlanner = await queryPlanner('day');
      expect(dayPlanner.item.occupancy).toContainEqual(
        expect.objectContaining({
          occupancyKind: 'availability_block',
          blockId,
          blockKind: input.kind,
          instructorId,
        })
      );

      const weekPlanner = await queryPlanner('week');
      expect(weekPlanner.item.occupancy).toContainEqual(
        expect.objectContaining({
          occupancyKind: 'availability_block',
          blockId,
          blockKind: input.kind,
          instructorId,
        })
      );
    }
  );

  it('provisions the payer self Participant, creates a lesson, and exposes its occupancy', async () => {
    const execute = createExecuteCanonicalCommandHandler(firestore);
    const provision = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'provision_self_participant_for_account',
          intent: {
            accountId: payerAccountId,
            reasonExplanation: 'Admin Planner lesson requires the payer self Participant',
          },
          idempotencyKey: 'admin-planner-emulator-provision-self',
          correlationId,
          administratorContext: true,
        })
      )
    );
    expect(provision.status).toBe('success');

    const eligible = await queryAdminIdentityReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_eligible_participants', accountId: payerAccountId }
    );
    expect(eligible.scope).toBe('admin_eligible_participants');
    if (eligible.scope !== 'admin_eligible_participants') return;
    const self = eligible.items.find((item) => item.authority === 'self');
    expect(self).toBeDefined();

    const bookingId = BookingIdSchema.parse('booking_admin_planner_emulator');
    const createBooking = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'create_confirmed_booking',
          intent: {
            bookingId,
            instructorId,
            participantIds: [self!.participantId],
            payerAccountId,
            reasonExplanation: 'Admin Planner confirmed lesson',
          },
          idempotencyKey: 'admin-planner-emulator-create-lesson',
          correlationId,
          calendarInput: {
            localDate,
            localTime: '10:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
          administratorContext: true,
        })
      )
    );
    expect(createBooking.status).toBe('success');

    const planner = await queryPlanner('day');
    expect(planner.item.occupancy).toContainEqual(
      expect.objectContaining({
        occupancyKind: 'lesson_booking',
        bookingId,
        participantId: self!.participantId,
        payerAccountId,
        instructorId,
        displayTitle: 'Planner Client',
      })
    );
    expect(planner.item.occupancy.filter((item) => item.bookingId === bookingId)).toHaveLength(1);
  });

  it('creates a lesson for a selected managed Participant instead of the Account self Participant', async () => {
    const execute = createExecuteCanonicalCommandHandler(firestore);
    const payer = AccountSchema.parse({
      accountId: payerAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed_payer_planner_emulator',
        lastChangedByCommandId: 'command_seed_payer_planner_emulator',
        correlationId,
      },
    });
    await firestore.collection('users').doc(payerAccountId).set({
      ...payer,
      uid: payerAccountId,
      displayName: 'Planner Client',
      email: 'planner-client@example.com',
      role: 'user',
    });

    const provision = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'provision_self_participant_for_account',
          intent: {
            accountId: payerAccountId,
            reasonExplanation: 'Seed self Participant so the Account manages more than one person',
          },
          idempotencyKey: 'admin-planner-emulator-provision-self-managed',
          correlationId,
          administratorContext: true,
        })
      )
    );
    expect(provision.status).toBe('success');

    const dependentId = ParticipantIdSchema.parse('participant_planner_dependent_emulator');
    const managementId = ParticipantManagementIdSchema.parse(
      'management_planner_dependent_emulator'
    );
    await firestore.collection('participants').doc(dependentId).set({
      participantId: dependentId,
      displayName: 'Planner Dependent',
      age: { kind: 'age_years', years: 12 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed_dependent_planner_emulator',
        lastChangedByCommandId: 'command_seed_dependent_planner_emulator',
        correlationId,
      },
    });
    await firestore.collection('participant_management').doc(managementId).set({
      participantManagementId: managementId,
      participantId: dependentId,
      accountId: payerAccountId,
      role: 'owner',
      authority: 'parent_guardian',
      status: 'active',
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed_dependent_planner_emulator',
        lastChangedByCommandId: 'command_seed_dependent_planner_emulator',
        correlationId,
      },
    });

    const eligible = await queryAdminIdentityReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_eligible_participants', accountId: payerAccountId }
    );
    expect(eligible.scope).toBe('admin_eligible_participants');
    if (eligible.scope !== 'admin_eligible_participants') return;
    const self = eligible.items.find((item) => item.authority === 'self');
    expect(self).toBeDefined();
    expect(eligible.items.some((item) => item.participantId === dependentId)).toBe(true);

    const bookingId = BookingIdSchema.parse('booking_admin_planner_managed_emulator');
    const createBooking = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'create_confirmed_booking',
          intent: {
            bookingId,
            instructorId,
            participantIds: [dependentId],
            payerAccountId,
            reasonExplanation: 'Admin Planner managed Participant lesson',
            difficulty: 'intermediate',
            notes: 'Dependent lesson notes',
          },
          idempotencyKey: 'admin-planner-emulator-create-managed',
          correlationId,
          calendarInput: {
            localDate,
            localTime: '11:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
          administratorContext: true,
        })
      )
    );
    expect(createBooking.status).toBe('success');

    const planner = await queryPlanner('day');
    expect(planner.item.occupancy).toContainEqual(
      expect.objectContaining({
        occupancyKind: 'lesson_booking',
        bookingId,
        participantId: dependentId,
        payerAccountId,
      })
    );
    expect(planner.item.occupancy.find((item) => item.bookingId === bookingId)?.participantId).not.toBe(
      self?.participantId
    );
    const stored = await firestore.collection('bookings').doc(bookingId).get();
    expect(stored.data()?.difficulty).toBe('intermediate');
    expect(stored.data()?.notes).toBe('Dependent lesson notes');
    expect(
      planner.item.occupancy.find((item) => item.bookingId === bookingId)?.difficulty
    ).toBe('intermediate');
    expect(planner.item.occupancy.find((item) => item.bookingId === bookingId)?.notes).toBe(
      'Dependent lesson notes'
    );
  });

  it('reschedules, reassigns, and changes duration through the canonical gateway', async () => {
    const execute = createExecuteCanonicalCommandHandler(firestore);
    const provision = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'provision_self_participant_for_account',
          intent: {
            accountId: payerAccountId,
            reasonExplanation: 'Admin Planner sequential schedule mutations',
          },
          idempotencyKey: 'admin-planner-emulator-provision-self-seq',
          correlationId,
          administratorContext: true,
        })
      )
    );
    expect(provision.status).toBe('success');
    const eligible = await queryAdminIdentityReadModels(
      firestore,
      { kind: 'administrator', accountId: adminAccountId },
      { scope: 'admin_eligible_participants', accountId: payerAccountId }
    );
    expect(eligible.scope).toBe('admin_eligible_participants');
    if (eligible.scope !== 'admin_eligible_participants') return;
    const self = eligible.items.find((item) => item.authority === 'self');
    expect(self).toBeDefined();

    const bookingId = BookingIdSchema.parse('booking_admin_planner_schedule_emulator');
    const created = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'create_confirmed_booking',
          intent: {
            bookingId,
            instructorId,
            participantIds: [self!.participantId],
            payerAccountId,
            reasonExplanation: 'Admin Planner sequential schedule mutations',
          },
          idempotencyKey: 'admin-planner-emulator-create-seq',
          correlationId,
          calendarInput: {
            localDate,
            localTime: '10:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
          administratorContext: true,
        })
      )
    );
    expect(created.status).toBe('success');

    const readRevision = async () => {
      const snapshot = await firestore.collection('bookings').doc(bookingId).get();
      return snapshot.data()?.revision as number;
    };

    const afterCreate = await readRevision();
    const rescheduled = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'reschedule_booking',
          intent: {
            bookingId,
            reasonExplanation: 'Admin Planner reschedule lesson',
          },
          idempotencyKey: 'admin-planner-emulator-reschedule',
          correlationId,
          expectedRevision: afterCreate,
          calendarInput: {
            localDate,
            localTime: '13:00',
            durationMinutes: 60,
          },
          timezone: 'Asia/Almaty',
          administratorContext: true,
        })
      )
    );
    expect(rescheduled.status).toBe('success');

    const afterReschedule = await readRevision();
    expect(afterReschedule).not.toBe(afterCreate);
    const nextInstructorId = InstructorIdSchema.parse('instructor_admin_planner_emulator_two');
    await firestore.collection('instructors').doc(nextInstructorId).set({
      id: nextInstructorId,
      name: 'Second Planner Instructor',
      pricePerHourKZT: 15_000,
      isAvailable: true,
    });
    const reassigned = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'change_booking_instructor',
          intent: {
            bookingId,
            instructorId: nextInstructorId,
            reasonExplanation: 'Admin Planner reassign lesson',
          },
          idempotencyKey: 'admin-planner-emulator-reassign',
          correlationId,
          expectedRevision: afterReschedule,
          administratorContext: true,
        })
      )
    );
    expect(reassigned.status).toBe('success');

    const afterReassign = await readRevision();
    expect(afterReassign).not.toBe(afterReschedule);
    const durationChanged = await executeWithDiagnostics(() =>
      execute(
        commandRequest({
          kind: 'change_booking_duration',
          intent: {
            bookingId,
            durationMinutes: 120,
            reasonExplanation: 'Admin Planner change duration',
          },
          idempotencyKey: 'admin-planner-emulator-duration',
          correlationId,
          expectedRevision: afterReassign,
          administratorContext: true,
        })
      )
    );
    expect(durationChanged.status).toBe('success');

    const planner = await queryPlanner('day');
    expect(planner.item.occupancy).toContainEqual(
      expect.objectContaining({
        occupancyKind: 'lesson_booking',
        bookingId,
        instructorId: nextInstructorId,
        durationMinutes: 120,
        localTime: '13:00',
      })
    );
  });
});
