"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalParticipantAccessFixtures = void 0;
const accountParticipantAccess_1 = require("../canonical/accountParticipantAccess");
const primitives_1 = require("../canonical/primitives");
const createdAt = (0, primitives_1.timestampFromDate)(new Date('2026-01-01T00:00:00.000Z'));
const metadata = {
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
        createdByCommandId: 'command_access_fixture_create',
        lastChangedByCommandId: 'command_access_fixture_create',
        correlationId: 'correlation_access_fixture_create',
    },
};
const account = accountParticipantAccess_1.AccountSchema.parse({
    accountId: 'account_access_fixture',
    lifecycle: { status: 'active' },
    ...metadata,
});
const participant = accountParticipantAccess_1.ParticipantSchema.parse({
    participantId: 'participant_access_fixture',
    displayName: 'Access Fixture Participant',
    age: { kind: 'age_years', years: 13 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: 'management_access_fixture' },
    lifecycle: { status: 'active' },
    ...metadata,
});
const management = accountParticipantAccess_1.ParticipantManagementSchema.parse({
    participantManagementId: 'management_access_fixture',
    accountId: account.accountId,
    participantId: participant.participantId,
    role: 'owner',
    authority: 'parent_guardian',
    status: 'active',
    ...metadata,
});
const activeOwnerGuard = accountParticipantAccess_1.ParticipantManagementActiveOwnerGuardSchema.parse({
    participantId: participant.participantId,
    accountId: account.accountId,
    participantManagementId: management.participantManagementId,
    managementRevision: management.revision,
    updatedAt: metadata.updatedAt,
    lastChangedByCommandId: metadata.audit.lastChangedByCommandId,
    correlationId: metadata.audit.correlationId,
});
const instructorRelationship = accountParticipantAccess_1.InstructorRelationshipSchema.parse({
    instructorRelationshipId: 'relationship_access_fixture',
    participantId: participant.participantId,
    instructorId: 'instructor_access_fixture',
    basis: {
        kind: 'guardian_permission',
        participantManagementId: management.participantManagementId,
        grantedByAccountId: account.accountId,
    },
    validFrom: createdAt,
    expiresAt: (0, primitives_1.timestampFromDate)(new Date('2027-01-01T00:00:00.000Z')),
    status: 'active',
    ...metadata,
});
const participantBlock = accountParticipantAccess_1.ParticipantBlockSchema.parse({
    participantBlockId: 'block_access_fixture',
    participantId: participant.participantId,
    instructorId: instructorRelationship.instructorId,
    createdBy: {
        kind: 'participant_manager',
        accountId: account.accountId,
        participantManagementId: management.participantManagementId,
    },
    reason: 'Canonical blocked-access fixture.',
    status: 'active',
    ...metadata,
});
const topologyFields = {
    accounts: [account],
    participants: [participant],
    participantManagement: [management],
    activeOwnerGuards: [activeOwnerGuard],
    instructorRelationships: [instructorRelationship],
};
exports.canonicalParticipantAccessFixtures = Object.freeze({
    account,
    participant,
    management,
    activeOwnerGuard,
    instructorRelationship,
    participantBlock,
    unblockedTopology: accountParticipantAccess_1.ParticipantAccessTopologySchema.parse({
        ...topologyFields,
        participantBlocks: [],
    }),
    blockedTopology: accountParticipantAccess_1.ParticipantAccessTopologySchema.parse({
        ...topologyFields,
        participantBlocks: [participantBlock],
    }),
});
