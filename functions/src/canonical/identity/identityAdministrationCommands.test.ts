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
});
