import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  ParticipantSchema,
  accountCommandActor,
  participantManagementIdFromGuestLink,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_identity_admin_unit_01');
const adminAccountId = AccountIdSchema.parse('account_identity_admin_unit_01');
const targetAccountId = AccountIdSchema.parse('account_identity_admin_unit_02');
const ownerAccountId = AccountIdSchema.parse('account_identity_admin_unit_owner');
const participantId = ParticipantIdSchema.parse('participant_identity_admin_unit_01');
const instructorId = InstructorIdSchema.parse('instructor_identity_admin_unit_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment() {
  return { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) };
}

function adminContext(idempotencyKey: string, expectedRevision = 1, actor = adminAccountId) {
  return {
    actor: accountCommandActor(actor),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId,
    source: 'admin_callable' as const,
    expectedRevision,
  };
}

function seedAccount(accountId: typeof adminAccountId, extras: Record<string, unknown> = {}) {
  return {
    ...AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_account',
        lastChangedByCommandId: 'command_seed_account',
        correlationId,
      },
    }),
    displayName: 'Seed',
    role: 'admin',
    ...extras,
  };
}

function seedParticipant() {
  return ParticipantSchema.parse({
    participantId,
    displayName: 'Dependent',
    age: { kind: 'birth_date', birthDate: '2014-01-15' },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant',
      lastChangedByCommandId: 'command_seed_participant',
      correlationId,
    },
  });
}

async function run<Kind extends CommandEnvelope['kind']>(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  envelope: CommandEnvelope<Kind>
) {
  return createProductionCanonicalCommands(environment(), executor).execute(envelope);
}

describe('canonical identity administration commands', () => {
  it('disables an Account without cascading related documents', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
      [`participants/${participantId}`]: seedParticipant(),
    });
    const result = await run(executor, {
      kind: 'disable_account',
      context: adminContext('disable-account-01'),
      intent: { accountId: targetAccountId, reasonExplanation: 'Inactive client' },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      lifecycle: { status: 'disabled' },
      role: 'user',
    });
    expect(snapshot.docs.get(`participants/${participantId}`)?.data).toMatchObject({
      lifecycle: { status: 'active' },
      age: { kind: 'birth_date', birthDate: '2014-01-15' },
    });
  });

  it('refuses to disable a system owner Account', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${ownerAccountId}`]: seedAccount(ownerAccountId, { systemRole: 'owner' }),
    });
    const result = await run(executor, {
      kind: 'disable_account',
      context: adminContext('disable-owner-01'),
      intent: { accountId: ownerAccountId, reasonExplanation: 'Should fail' },
    });
    expect(result.status).toBe('error');
  });

  it('lets only system owner change a non-owner Account role', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
    });
    const denied = await run(executor, {
      kind: 'change_account_role',
      context: adminContext('role-denied-01'),
      intent: { accountId: targetAccountId, role: 'admin', reasonExplanation: 'Promote' },
    });
    expect(denied.status).toBe('error');

    const ownerExecutor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
    });
    const allowed = await run(ownerExecutor, {
      kind: 'change_account_role',
      context: adminContext('role-allowed-01'),
      intent: { accountId: targetAccountId, role: 'admin', reasonExplanation: 'Promote' },
    });
    expect(allowed.status).toBe('success');
    expect(ownerExecutor.snapshot().docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      role: 'admin',
      lifecycle: { status: 'active' },
    });
  });

  it('lets system owner demote a non-owner admin without touching lifecycle or instructor link', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'admin',
        instructorId,
        isInstructor: true,
      }),
      [`participants/${participantId}`]: seedParticipant(),
    });
    const result = await run(executor, {
      kind: 'change_account_role',
      context: adminContext('role-demote-01'),
      intent: { accountId: targetAccountId, role: 'user', reasonExplanation: 'Demote' },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      role: 'user',
      lifecycle: { status: 'active' },
      instructorId,
      isInstructor: true,
    });
    expect(executor.snapshot().docs.get(`participants/${participantId}`)?.data).toMatchObject({
      lifecycle: { status: 'active' },
    });
  });

  it('rejects ordinary admin and non-admin role mutations; rejects self demotion and owner target', async () => {
    const ordinaryDenied = await run(
      createInMemoryCanonicalTransactionExecutor({
        [`users/${adminAccountId}`]: seedAccount(adminAccountId, { role: 'admin' }),
        [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
      }),
      {
        kind: 'change_account_role',
        context: adminContext('role-ordinary-01'),
        intent: { accountId: targetAccountId, role: 'admin', reasonExplanation: 'Promote' },
      }
    );
    expect(ordinaryDenied.status).toBe('error');

    const nonAdminDenied = await run(
      createInMemoryCanonicalTransactionExecutor({
        [`users/${adminAccountId}`]: seedAccount(adminAccountId, { role: 'user' }),
        [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
      }),
      {
        kind: 'change_account_role',
        context: {
          ...adminContext('role-nonadmin-01'),
          exercisedCapability: 'account_owner',
        },
        intent: { accountId: targetAccountId, role: 'admin', reasonExplanation: 'Promote' },
      }
    );
    expect(nonAdminDenied.status).toBe('error');

    const selfDemote = await run(
      createInMemoryCanonicalTransactionExecutor({
        [`users/${adminAccountId}`]: seedAccount(adminAccountId, {
          role: 'admin',
          systemRole: 'owner',
        }),
      }),
      {
        kind: 'change_account_role',
        context: adminContext('role-self-01'),
        intent: { accountId: adminAccountId, role: 'user', reasonExplanation: 'Self demote' },
      }
    );
    expect(selfDemote.status).toBe('error');

    const ownerTarget = await run(
      createInMemoryCanonicalTransactionExecutor({
        [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
        [`users/${ownerAccountId}`]: seedAccount(ownerAccountId, {
          role: 'admin',
          systemRole: 'owner',
        }),
      }),
      {
        kind: 'change_account_role',
        context: adminContext('role-owner-target-02'),
        intent: {
          accountId: ownerAccountId,
          role: 'user',
          reasonExplanation: 'Must not demote owner',
        },
      }
    );
    expect(ownerTarget.status).toBe('error');
  });

  it('rejects change_account_role against uninitialized non-canonical documents', async () => {
    const statsId = AccountIdSchema.parse('school_global_stats');
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${statsId}`]: { displayName: 'School Global Stats' },
    });
    const result = await run(executor, {
      kind: 'change_account_role',
      context: adminContext('role-uninit-01', 1),
      intent: {
        accountId: statsId,
        role: 'admin',
        reasonExplanation: 'Must not promote stats',
      },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`users/${statsId}`)?.data).toEqual({
      displayName: 'School Global Stats',
    });
  });

  it('fails closed when archiving a Participant with too many commitments to scan', async () => {
    const bookings: Record<string, Record<string, unknown>> = {};
    for (let index = 0; index < 33; index += 1) {
      bookings[`bookings/booking_identity_scan_${index}`] = {
        party: { participantIds: [participantId] },
        lifecycle: { status: 'confirmed' },
      };
    }
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`participants/${participantId}`]: seedParticipant(),
      ...bookings,
    });
    const result = await run(executor, {
      kind: 'archive_participant',
      context: adminContext('archive-capped-01'),
      intent: { participantId, reasonExplanation: 'Should fail closed' },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`participants/${participantId}`)?.data).toMatchObject({
      lifecycle: { status: 'active' },
    });
  });

  it('fails closed when archive cannot prove a related booking is terminal', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`participants/${participantId}`]: seedParticipant(),
      [`bookings/booking_identity_unparsed_01`]: {
        party: { participantIds: [participantId] },
        lifecycle: { status: 'confirmed' },
      },
    });
    const result = await run(executor, {
      kind: 'archive_participant',
      context: adminContext('archive-unparsed-01'),
      intent: { participantId, reasonExplanation: 'Unparsed commitments must block archive' },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`participants/${participantId}`)?.data).toMatchObject({
      lifecycle: { status: 'active' },
    });
  });

  it('assigns an unmanaged guest to a specified Account without making Admin the owner', async () => {
    const managementId = participantManagementIdFromGuestLink({
      participantId,
      accountId: targetAccountId,
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
      [`participants/${participantId}`]: seedParticipant(),
    });
    const result = await run(executor, {
      kind: 'assign_participant_management_as_administrator',
      context: adminContext('assign-guest-01'),
      intent: {
        participantId,
        accountId: targetAccountId,
        participantManagementId: managementId,
        reasonExplanation: 'Link guest to family account',
      },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`participant_management/${managementId}`)?.data).toMatchObject({
      accountId: targetAccountId,
      participantId,
      authority: 'parent_guardian',
      role: 'owner',
      status: 'active',
    });
    expect(snapshot.docs.get(`participants/${participantId}`)?.data).toMatchObject({
      management: { kind: 'managed', participantManagementId: managementId },
      age: { kind: 'birth_date', birthDate: '2014-01-15' },
    });
  });

  it('refuses to transfer an already managed Participant', async () => {
    const existingManagementId = ParticipantManagementIdSchema.parse(
      'management_identity_admin_existing'
    );
    const attemptedManagementId = participantManagementIdFromGuestLink({
      participantId,
      accountId: targetAccountId,
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
      [`participants/${participantId}`]: {
        ...seedParticipant(),
        management: { kind: 'managed', participantManagementId: existingManagementId },
      },
    });
    const result = await run(executor, {
      kind: 'assign_participant_management_as_administrator',
      context: adminContext('assign-managed-01'),
      intent: {
        participantId,
        accountId: targetAccountId,
        participantManagementId: attemptedManagementId,
        reasonExplanation: 'Must not transfer',
      },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`participants/${participantId}`)?.data).toMatchObject({
      management: { kind: 'managed', participantManagementId: existingManagementId },
    });
  });

  it('reactivates ended parent_guardian management when Admin assigns the same Account again', async () => {
    const managementId = participantManagementIdFromGuestLink({
      participantId,
      accountId: targetAccountId,
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
      [`participants/${participantId}`]: seedParticipant(),
      [`participant_management/${managementId}`]: {
        participantManagementId: managementId,
        accountId: targetAccountId,
        participantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'ended',
        endedAt: decidedAt,
        revision: 2,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed_management',
          lastChangedByCommandId: 'command_seed_management',
          correlationId,
        },
      },
    });
    const result = await run(executor, {
      kind: 'assign_participant_management_as_administrator',
      context: adminContext('assign-ended-01'),
      intent: {
        participantId,
        accountId: targetAccountId,
        participantManagementId: managementId,
        reasonExplanation: 'Re-assign after revoke',
      },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`participant_management/${managementId}`)?.data).toMatchObject({
      accountId: targetAccountId,
      authority: 'parent_guardian',
      status: 'active',
    });
    expect(executor.snapshot().docs.get(`participant_management/${managementId}`)?.data).not.toHaveProperty(
      'endedAt'
    );
    expect(executor.snapshot().docs.get(`participants/${participantId}`)?.data).toMatchObject({
      management: { kind: 'managed', participantManagementId: managementId },
    });
  });

  it('creates a dependent Participant atomically with parent_guardian management', async () => {
    const dependentId = ParticipantIdSchema.parse('participant_identity_admin_dependent_01');
    const managementId = participantManagementIdFromGuestLink({
      participantId: dependentId,
      accountId: targetAccountId,
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
    });
    const result = await run(executor, {
      kind: 'create_managed_dependent_participant',
      context: adminContext('create-dependent-01'),
      intent: {
        participantId: dependentId,
        participantManagementId: managementId,
        accountId: targetAccountId,
        displayName: 'Child Skier',
        age: { kind: 'birth_date', birthDate: '2016-06-01' },
        skillLevel: 'beginner',
        discipline: 'ski',
        reasonExplanation: 'Add child to family',
      },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`participants/${dependentId}`)?.data).toMatchObject({
      displayName: 'Child Skier',
      age: { kind: 'birth_date', birthDate: '2016-06-01' },
      management: { kind: 'managed', participantManagementId: managementId },
    });
    expect(snapshot.docs.get(`participant_management/${managementId}`)?.data).toMatchObject({
      accountId: targetAccountId,
      authority: 'parent_guardian',
      status: 'active',
    });
  });

  it('keeps birth_date when Admin updates operational profile fields', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`participants/${participantId}`]: seedParticipant(),
    });
    const result = await run(executor, {
      kind: 'update_participant_profile',
      context: adminContext('profile-birth-01'),
      intent: {
        participantId,
        displayName: 'Renamed Dependent',
        skillLevel: 'intermediate',
      },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`participants/${participantId}`)?.data).toMatchObject({
      displayName: 'Renamed Dependent',
      skillLevel: 'intermediate',
      age: { kind: 'birth_date', birthDate: '2014-01-15' },
      management: { kind: 'unmanaged_guest' },
    });
  });

  it('creates an instructor catalog entry without linking an Account', async () => {
    const catalogId = InstructorIdSchema.parse('instructor_identity_admin_create_01');
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
    });
    const result = await run(executor, {
      kind: 'create_instructor_catalog_entry',
      context: adminContext('catalog-create-01'),
      intent: {
        instructorId: catalogId,
        name: 'New Catalog Coach',
        pricePerHourKZT: 18_000,
        reasonExplanation: 'Add catalog coach',
      },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`instructors/${catalogId}`)?.data).toMatchObject({
      name: 'New Catalog Coach',
      isAvailable: true,
      pricePerHourKZT: 18_000,
    });
    expect(snapshot.docs.get(`users/${adminAccountId}`)?.data).not.toMatchObject({
      instructorId: catalogId,
    });
  });

  it('refuses to change the role of a system owner Account', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${ownerAccountId}`]: seedAccount(ownerAccountId, {
        role: 'admin',
        systemRole: 'owner',
      }),
    });
    const result = await run(executor, {
      kind: 'change_account_role',
      context: adminContext('role-owner-target-01'),
      intent: {
        accountId: ownerAccountId,
        role: 'user',
        reasonExplanation: 'Must not demote owner',
      },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`users/${ownerAccountId}`)?.data).toMatchObject({
      role: 'admin',
      systemRole: 'owner',
    });
  });

  it('deactivates instructor catalog availability without deleting the entry', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Catalog Coach',
        pricePerHourKZT: 15_000,
        isAvailable: true,
        revision: 1,
      },
      [`bookings/booking_identity_catalog_01`]: {
        instructorId,
        lifecycle: { status: 'confirmed' },
      },
    });
    const result = await run(executor, {
      kind: 'deactivate_instructor_catalog',
      context: adminContext('catalog-off-01'),
      intent: { instructorId, reasonExplanation: 'Hide from public availability' },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      name: 'Catalog Coach',
      isAvailable: false,
    });
    expect(snapshot.docs.has(`bookings/booking_identity_catalog_01`)).toBe(true);
  });

  it('rejects identity administration from a non-administrator capability', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
    });
    const result = await run(executor, {
      kind: 'disable_account',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'disable-client-01',
        correlationId,
        source: 'client_callable',
        expectedRevision: 1,
      },
      intent: { accountId: targetAccountId, reasonExplanation: 'Client cannot disable' },
    });
    expect(result.status).toBe('error');
  });

  it('lets an administrator update Account contact projection without touching identity or finance', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        email: 'keep@example.com',
        displayName: 'Old Name',
        phoneNumber: '+77010000000',
      }),
      [`participants/${participantId}`]: seedParticipant(),
      [`users/${targetAccountId}/wallet/state`]: {
        accountId: targetAccountId,
        balance: 42_000,
        currency: 'KZT',
        revision: 3,
      },
    });
    const result = await run(executor, {
      kind: 'update_account_contact_as_administrator',
      context: adminContext('contact-update-01'),
      intent: {
        accountId: targetAccountId,
        displayName: 'New Client Name',
        phoneNumber: '+77019999999',
        reasonExplanation: 'Admin contact correction',
      },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      displayName: 'New Client Name',
      phoneNumber: '+77019999999',
      email: 'keep@example.com',
      role: 'user',
      lifecycle: { status: 'active' },
      revision: 2,
    });
    expect(snapshot.docs.get(`participants/${participantId}`)?.data).toMatchObject({
      displayName: 'Dependent',
      skillLevel: 'beginner',
    });
    expect(snapshot.docs.get(`users/${targetAccountId}/wallet/state`)?.data).toMatchObject({
      balance: 42_000,
      revision: 3,
    });
  });

  it('rejects Account contact updates from a non-administrator', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        displayName: 'Old Name',
      }),
    });
    const result = await run(executor, {
      kind: 'update_account_contact_as_administrator',
      context: {
        actor: accountCommandActor(adminAccountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'contact-client-01',
        correlationId,
        source: 'client_callable',
        expectedRevision: 1,
      },
      intent: {
        accountId: targetAccountId,
        displayName: 'Hijacked Name',
        phoneNumber: '+77011111111',
        reasonExplanation: 'Must fail',
      },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      displayName: 'Old Name',
    });
  });

  it('is idempotent when Account contact already matches the requested projection', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        displayName: 'Same Name',
        phoneNumber: '+77012222222',
      }),
    });
    const result = await run(executor, {
      kind: 'update_account_contact_as_administrator',
      context: adminContext('contact-idempotent-01'),
      intent: {
        accountId: targetAccountId,
        displayName: 'Same Name',
        phoneNumber: '+77012222222',
        reasonExplanation: 'No-op contact save',
      },
    });
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      displayName: 'Same Name',
      phoneNumber: '+77012222222',
      revision: 1,
    });
  });

  it('rejects Account contact updates that omit displayName or exceed phone length', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user', displayName: 'Keep' }),
    });
    const emptyName = await run(executor, {
      kind: 'update_account_contact_as_administrator',
      context: adminContext('contact-empty-01'),
      intent: {
        accountId: targetAccountId,
        displayName: '   ',
        reasonExplanation: 'Empty name',
      },
    });
    expect(emptyName.status).toBe('error');
    const longPhone = await run(executor, {
      kind: 'update_account_contact_as_administrator',
      context: adminContext('contact-phone-01'),
      intent: {
        accountId: targetAccountId,
        displayName: 'Keep',
        phoneNumber: '1'.repeat(33),
        reasonExplanation: 'Phone too long',
      },
    });
    expect(longPhone.status).toBe('error');
    expect(executor.snapshot().docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      displayName: 'Keep',
      revision: 1,
    });
  });

  it('atomically creates and links an instructor catalog for an Account', async () => {
    const catalogId = InstructorIdSchema.parse('instructor_identity_admin_create_link_01');
    const selfParticipantId = ParticipantIdSchema.parse('participant_identity_admin_self_01');
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        displayName: 'Client Coach',
      }),
      [`participants/${selfParticipantId}`]: {
        ...seedParticipant(),
        participantId: selfParticipantId,
        displayName: 'Client Self',
        skillLevel: 'advanced',
        management: {
          kind: 'managed',
          participantManagementId: ParticipantManagementIdSchema.parse(
            'management_identity_admin_self_01'
          ),
        },
      },
    });
    const result = await run(executor, {
      kind: 'create_instructor_catalog_entry',
      context: adminContext('catalog-create-link-01', 1),
      intent: {
        instructorId: catalogId,
        accountId: targetAccountId,
        name: 'Client Coach',
        specialty: 'ski',
        pricePerHourKZT: 20_000,
        reasonExplanation: 'Account-first instructor add',
      },
    });
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`instructors/${catalogId}`)?.data).toMatchObject({
      name: 'Client Coach',
      linkedAccountId: targetAccountId,
      isAvailable: true,
      pricePerHourKZT: 20_000,
    });
    expect(snapshot.docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      instructorId: catalogId,
      isInstructor: true,
      role: 'user',
    });
    expect(snapshot.docs.get(`participants/${selfParticipantId}`)?.data).toMatchObject({
      displayName: 'Client Self',
      skillLevel: 'advanced',
    });
  });

  it('links Account A to Instructor X and refuses Account A → Y and Account B → X', async () => {
    const instructorX = InstructorIdSchema.parse('instructor_identity_admin_link_x');
    const instructorY = InstructorIdSchema.parse('instructor_identity_admin_link_y');
    const accountB = AccountIdSchema.parse('account_identity_admin_unit_03');
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, { role: 'user' }),
      [`users/${accountB}`]: seedAccount(accountB, { role: 'user' }),
      [`instructors/${instructorX}`]: {
        instructorId: instructorX,
        name: 'X',
        pricePerHourKZT: 15_000,
        isAvailable: true,
        revision: 1,
      },
      [`instructors/${instructorY}`]: {
        instructorId: instructorY,
        name: 'Y',
        pricePerHourKZT: 15_000,
        isAvailable: true,
        revision: 1,
      },
    });
    const linkAtoX = await run(executor, {
      kind: 'link_account_instructor_catalog',
      context: adminContext('link-a-x-01'),
      intent: {
        accountId: targetAccountId,
        instructorId: instructorX,
        reasonExplanation: 'Link A to X',
      },
    });
    expect(linkAtoX.status).toBe('success');
    const linkAtoY = await run(executor, {
      kind: 'link_account_instructor_catalog',
      context: adminContext('link-a-y-01', 2),
      intent: {
        accountId: targetAccountId,
        instructorId: instructorY,
        reasonExplanation: 'Second instructor forbidden',
      },
    });
    expect(linkAtoY.status).toBe('error');
    const linkBtoX = await run(executor, {
      kind: 'link_account_instructor_catalog',
      context: adminContext('link-b-x-01'),
      intent: {
        accountId: accountB,
        instructorId: instructorX,
        reasonExplanation: 'Reverse link forbidden',
      },
    });
    expect(linkBtoX.status).toBe('error');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`users/${targetAccountId}`)?.data).toMatchObject({
      instructorId: instructorX,
    });
    expect(snapshot.docs.get(`users/${accountB}`)?.data?.instructorId).toBeUndefined();
    expect(snapshot.docs.get(`instructors/${instructorX}`)?.data).toMatchObject({
      linkedAccountId: targetAccountId,
    });
  });

  it('refuses disable_account while linked instructor is available, then allows after deactivate without auto-reactivate', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        instructorId,
        isInstructor: true,
      }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Linked Coach',
        pricePerHourKZT: 15_000,
        isAvailable: true,
        linkedAccountId: targetAccountId,
        revision: 1,
      },
    });
    const blocked = await run(executor, {
      kind: 'disable_account',
      context: adminContext('disable-active-instructor-01'),
      intent: { accountId: targetAccountId, reasonExplanation: 'Should fail' },
    });
    expect(blocked.status).toBe('error');
    const pause = await run(executor, {
      kind: 'deactivate_instructor_catalog',
      context: adminContext('pause-before-disable-01'),
      intent: { instructorId, reasonExplanation: 'Pause first' },
    });
    expect(pause.status).toBe('success');
    const disabled = await run(executor, {
      kind: 'disable_account',
      context: adminContext('disable-after-pause-01'),
      intent: { accountId: targetAccountId, reasonExplanation: 'Now allowed' },
    });
    expect(disabled.status).toBe('success');
    const enabled = await run(executor, {
      kind: 'enable_account',
      context: adminContext('enable-keep-paused-01', 2),
      intent: { accountId: targetAccountId, reasonExplanation: 'Re-enable account' },
    });
    expect(enabled.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      isAvailable: false,
      linkedAccountId: targetAccountId,
    });
  });

  it('refuses reactivate while linked Account is disabled', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        instructorId,
        isInstructor: true,
        lifecycle: { status: 'disabled', disabledAt: decidedAt },
      }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Paused Coach',
        pricePerHourKZT: 15_000,
        isAvailable: false,
        linkedAccountId: targetAccountId,
        revision: 2,
      },
    });
    const result = await run(executor, {
      kind: 'reactivate_instructor_catalog',
      context: adminContext('reactivate-disabled-account-01', 2),
      intent: { instructorId, reasonExplanation: 'Blocked by disabled account' },
    });
    expect(result.status).toBe('error');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      isAvailable: false,
    });
  });

  it('unlinks without commitments and refuses when future booking docs are present', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        instructorId,
        isInstructor: true,
      }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Stop Coach',
        pricePerHourKZT: 15_000,
        isAvailable: false,
        linkedAccountId: targetAccountId,
        revision: 2,
      },
    });
    const unlinkOk = await run(executor, {
      kind: 'unlink_account_instructor_catalog',
      context: adminContext('unlink-ok-01'),
      intent: {
        accountId: targetAccountId,
        instructorId,
        reasonExplanation: 'Stop being instructor',
      },
    });
    expect(unlinkOk.status).toBe('success');
    expect(executor.snapshot().docs.get(`users/${targetAccountId}`)?.data?.instructorId).toBeUndefined();
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      isAvailable: false,
    });
    expect(executor.snapshot().docs.has(`instructors/${instructorId}`)).toBe(true);

    const executorBlocked = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        instructorId,
        isInstructor: true,
      }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Busy Coach',
        pricePerHourKZT: 15_000,
        isAvailable: false,
        linkedAccountId: targetAccountId,
        revision: 2,
      },
      [`bookings/booking_future_commitment_01`]: {
        occurrence: { instructorId },
        lifecycle: { status: 'confirmed' },
      },
    });
    const unlinkBlocked = await run(executorBlocked, {
      kind: 'unlink_account_instructor_catalog',
      context: adminContext('unlink-blocked-01'),
      intent: {
        accountId: targetAccountId,
        instructorId,
        reasonExplanation: 'Should fail on commitments',
      },
    });
    expect(unlinkBlocked.status).toBe('error');
    expect(
      executorBlocked.snapshot().docs.get(`users/${targetAccountId}`)?.data
    ).toMatchObject({ instructorId });
  });

  it('rejects oversized avatarUrl on update_instructor_catalog_profile without mutating Firestore', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Catalog Coach',
        pricePerHourKZT: 15_000,
        isAvailable: true,
        revision: 1,
        avatarUrl: 'https://example.com/existing.jpg',
      },
    });
    const oversized = `https://example.com/${'x'.repeat(2_001)}`;
    const result = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-avatar-oversized-01'),
      intent: {
        instructorId,
        avatarUrl: oversized,
        reasonExplanation: 'Must reject oversized avatar URL',
      },
    } as never);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      name: 'Catalog Coach',
      avatarUrl: 'https://example.com/existing.jpg',
      revision: 1,
    });
  });

  it('accepts update_instructor_catalog_profile when authoritative revision and expectedRevision are 0', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Zero Revision Coach',
        pricePerHourKZT: 30_000,
        isAvailable: true,
        revision: 0,
        specialty: 'both',
      },
    });
    const result = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-revision-zero-ok-01', 0),
      intent: {
        instructorId,
        name: 'Zero Revision Coach',
        bio: 'Updated bio',
        avatarUrl:
          'https://firebasestorage.googleapis.com/v0/b/bucket/o/instructors%2Fz.jpg?alt=media&token=t',
        reasonExplanation: 'Preserve revision 0 concurrency',
      },
    } as never);
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      bio: 'Updated bio',
      revision: 1,
    });
  });

  it('rejects stale expectedRevision 0 when authoritative instructor revision is 1', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Stale Guard Coach',
        pricePerHourKZT: 20_000,
        isAvailable: true,
        revision: 1,
      },
    });
    const result = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-revision-stale-01', 0),
      intent: {
        instructorId,
        bio: 'Should not apply',
        reasonExplanation: 'Genuine stale protection',
      },
    } as never);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
      expect(result.error.currentRevision).toBe(1);
    }
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      revision: 1,
    });
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).not.toMatchObject({
      bio: 'Should not apply',
    });
  });

  it('advances from revision 0 to 1 then accepts a second update with expectedRevision 1', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Sequential Coach',
        pricePerHourKZT: 25_000,
        isAvailable: true,
        revision: 0,
      },
    });
    const first = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-revision-seq-01', 0),
      intent: {
        instructorId,
        bio: 'First save',
        reasonExplanation: 'First update from revision 0',
      },
    } as never);
    expect(first.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      bio: 'First save',
      revision: 1,
    });

    const second = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-revision-seq-02', 1),
      intent: {
        instructorId,
        bio: 'Second save',
        reasonExplanation: 'Second update after refresh',
      },
    } as never);
    expect(second.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      bio: 'Second save',
      revision: 2,
    });
  });

  it('accepts deactivate_instructor_catalog when authoritative revision is 0', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Pause Zero Coach',
        pricePerHourKZT: 18_000,
        isAvailable: true,
        revision: 0,
      },
    });
    const result = await run(executor, {
      kind: 'deactivate_instructor_catalog',
      context: adminContext('catalog-deactivate-zero-01', 0),
      intent: {
        instructorId,
        reasonExplanation: 'Pause with revision 0',
      },
    } as never);
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      isAvailable: false,
      revision: 1,
    });
  });

  it('accepts update_instructor_catalog_profile when revision field is absent (legacy)', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Legacy Missing Revision Coach',
        pricePerHourKZT: 22_000,
        isAvailable: true,
        specialty: 'ski',
        // revision field intentionally absent
      },
    });
    const first = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-revision-missing-01', 0),
      intent: {
        instructorId,
        bio: 'First legacy save',
        avatarUrl:
          'https://firebasestorage.googleapis.com/v0/b/bucket/o/instructors%2Flegacy.jpg?alt=media&token=t',
        reasonExplanation: 'Legacy missing revision first save',
      },
    } as never);
    expect(first.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      bio: 'First legacy save',
      revision: 1,
    });

    const second = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-revision-missing-02', 1),
      intent: {
        instructorId,
        bio: 'Second legacy save',
        reasonExplanation: 'Legacy missing revision second save',
      },
    } as never);
    expect(second.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      bio: 'Second legacy save',
      revision: 2,
    });
  });

  it('rejects genuine stale expectedRevision when legacy missing revision was already advanced', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Legacy Stale Coach',
        pricePerHourKZT: 19_000,
        isAvailable: true,
        revision: 1,
      },
    });
    const result = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-revision-missing-stale-01', 0),
      intent: {
        instructorId,
        bio: 'Should not apply',
        reasonExplanation: 'Genuine stale after missing-revision bootstrap',
      },
    } as never);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
      expect(result.error.currentRevision).toBe(1);
    }
  });

  it('accepts deactivate then reactivate on legacy missing-revision instructor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Legacy Pause Coach',
        pricePerHourKZT: 17_000,
        isAvailable: true,
      },
    });
    const deactivate = await run(executor, {
      kind: 'deactivate_instructor_catalog',
      context: adminContext('catalog-missing-deactivate-01', 0),
      intent: {
        instructorId,
        reasonExplanation: 'Pause legacy missing revision',
      },
    } as never);
    expect(deactivate.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      isAvailable: false,
      revision: 1,
    });

    const reactivate = await run(executor, {
      kind: 'reactivate_instructor_catalog',
      context: adminContext('catalog-missing-reactivate-01', 1),
      intent: {
        instructorId,
        reasonExplanation: 'Reactivate after legacy pause',
      },
    } as never);
    expect(reactivate.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      isAvailable: true,
      revision: 2,
    });
  });

  it('updates profile on symmetrically linked instructor even with oversized legacy avatarUrl', async () => {
    const linkedInstructorId = InstructorIdSchema.parse('ins_X9vUp3gIrbNFWUpWsEzvLCAEh7q2');
    const linkedAccount = AccountIdSchema.parse('X9vUp3gIrbNFWUpWsEzvLCAEh7q2');
    const legacyAvatar = `data:image/jpeg;base64,${'B'.repeat(2_500)}`;
    const nextAvatar =
      'https://firebasestorage.googleapis.com/v0/b/bucket/o/instructors%2Fok.jpg?alt=media&token=t';
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${linkedAccount}`]: seedAccount(linkedAccount, {
        role: 'user',
        instructorId: linkedInstructorId,
        isInstructor: true,
      }),
      [`instructors/${linkedInstructorId}`]: {
        instructorId: linkedInstructorId,
        name: 'Арсений Герасимчук',
        specialty: 'both',
        languages: ['Русский'],
        experienceYears: 10,
        pricePerHourKZT: 30_000,
        phoneNumber: '+77055492235',
        isAvailable: true,
        linkedAccountId: linkedAccount,
        avatarUrl: legacyAvatar,
        // revision field intentionally absent — production legacy shape
      },
    });

    const first = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-linked-legacy-avatar-01', 0),
      intent: {
        instructorId: linkedInstructorId,
        name: 'Арсений Герасимчук',
        specialty: 'both',
        languages: ['Русский'],
        experienceYears: 10,
        bio: 'Updated bio',
        avatarUrl: nextAvatar,
        pricePerHourKZT: 30_000,
        phoneNumber: '+77055492235',
        reasonExplanation: 'Profile update must not conflict on valid link',
      },
    } as never);
    expect(first.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${linkedInstructorId}`)?.data).toMatchObject({
      bio: 'Updated bio',
      avatarUrl: nextAvatar,
      revision: 1,
      linkedAccountId: linkedAccount,
      specialty: 'both',
      experienceYears: 10,
    });
    expect(executor.snapshot().docs.get(`users/${linkedAccount}`)?.data).toMatchObject({
      instructorId: linkedInstructorId,
      isInstructor: true,
      revision: 1,
    });

    const second = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-linked-legacy-avatar-02', 1),
      intent: {
        instructorId: linkedInstructorId,
        bio: 'Second bio',
        reasonExplanation: 'Second profile save after legacy avatar repair',
      },
    } as never);
    expect(second.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${linkedInstructorId}`)?.data).toMatchObject({
      bio: 'Second bio',
      revision: 2,
      linkedAccountId: linkedAccount,
    });
  });

  it('updates catalog-only instructor profile without linked Account', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Catalog Only Coach',
        pricePerHourKZT: 14_000,
        isAvailable: true,
        revision: 0,
      },
    });
    const result = await run(executor, {
      kind: 'update_instructor_catalog_profile',
      context: adminContext('catalog-only-profile-01', 0),
      intent: {
        instructorId,
        bio: 'Catalog only bio',
        reasonExplanation: 'Catalog-only profile update',
      },
    } as never);
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`instructors/${instructorId}`)?.data).toMatchObject({
      bio: 'Catalog only bio',
      revision: 1,
    });
    expect(
      executor.snapshot().docs.get(`instructors/${instructorId}`)?.data
    ).not.toHaveProperty('linkedAccountId');
  });

  it('still rejects duplicate reverse Account links on link_account_instructor_catalog', async () => {
    const accountB = AccountIdSchema.parse('account_identity_admin_unit_dup_b');
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`users/${adminAccountId}`]: seedAccount(adminAccountId, { systemRole: 'owner' }),
      [`users/${targetAccountId}`]: seedAccount(targetAccountId, {
        role: 'user',
        instructorId,
        isInstructor: true,
      }),
      [`users/${accountB}`]: seedAccount(accountB, {
        role: 'user',
        instructorId,
        isInstructor: true,
      }),
      [`instructors/${instructorId}`]: {
        instructorId,
        name: 'Dup Reverse Coach',
        pricePerHourKZT: 20_000,
        isAvailable: true,
        revision: 1,
        linkedAccountId: targetAccountId,
      },
    });
    const result = await run(executor, {
      kind: 'link_account_instructor_catalog',
      context: adminContext('catalog-dup-reverse-link-01', 1),
      intent: {
        accountId: accountB,
        instructorId,
        reasonExplanation: 'Must reject duplicate reverse link',
      },
    } as never);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('blocked_relationship');
    }
  });
});
