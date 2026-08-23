import {
  AccountSchema,
  InstructorRelationshipSchema,
  ParticipantAccessTopologySchema,
  ParticipantBlockSchema,
  ParticipantManagementActiveOwnerGuardSchema,
  ParticipantManagementSchema,
  ParticipantSchema,
  type Account,
  type InstructorRelationship,
  type Participant,
  type ParticipantAccessTopology,
  type ParticipantBlock,
  type ParticipantManagement,
  type ParticipantManagementActiveOwnerGuard,
} from '../canonical/accountParticipantAccess';
import { timestampFromDate } from '../canonical/primitives';

const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
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

const account = AccountSchema.parse({
  accountId: 'account_access_fixture',
  lifecycle: { status: 'active' },
  ...metadata,
});

const participant = ParticipantSchema.parse({
  participantId: 'participant_access_fixture',
  displayName: 'Access Fixture Participant',
  age: { kind: 'age_years', years: 13 },
  skillLevel: 'intermediate',
  discipline: 'ski',
  management: { kind: 'managed', participantManagementId: 'management_access_fixture' },
  lifecycle: { status: 'active' },
  ...metadata,
});

const management = ParticipantManagementSchema.parse({
  participantManagementId: 'management_access_fixture',
  accountId: account.accountId,
  participantId: participant.participantId,
  role: 'owner',
  authority: 'parent_guardian',
  status: 'active',
  ...metadata,
});

const activeOwnerGuard = ParticipantManagementActiveOwnerGuardSchema.parse({
  participantId: participant.participantId,
  accountId: account.accountId,
  participantManagementId: management.participantManagementId,
  managementRevision: management.revision,
  updatedAt: metadata.updatedAt,
  lastChangedByCommandId: metadata.audit.lastChangedByCommandId,
  correlationId: metadata.audit.correlationId,
});

const instructorRelationship = InstructorRelationshipSchema.parse({
  instructorRelationshipId: 'relationship_access_fixture',
  participantId: participant.participantId,
  instructorId: 'instructor_access_fixture',
  basis: {
    kind: 'guardian_permission',
    participantManagementId: management.participantManagementId,
    grantedByAccountId: account.accountId,
  },
  validFrom: createdAt,
  expiresAt: timestampFromDate(new Date('2027-01-01T00:00:00.000Z')),
  status: 'active',
  ...metadata,
});

const participantBlock = ParticipantBlockSchema.parse({
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
} as const;

export interface CanonicalParticipantAccessFixtures {
  readonly account: Account;
  readonly participant: Participant;
  readonly management: ParticipantManagement;
  readonly activeOwnerGuard: ParticipantManagementActiveOwnerGuard;
  readonly instructorRelationship: InstructorRelationship;
  readonly participantBlock: ParticipantBlock;
  readonly unblockedTopology: ParticipantAccessTopology;
  readonly blockedTopology: ParticipantAccessTopology;
}

export const canonicalParticipantAccessFixtures: CanonicalParticipantAccessFixtures = Object.freeze(
  {
    account,
    participant,
    management,
    activeOwnerGuard,
    instructorRelationship,
    participantBlock,
    unblockedTopology: ParticipantAccessTopologySchema.parse({
      ...topologyFields,
      participantBlocks: [],
    }),
    blockedTopology: ParticipantAccessTopologySchema.parse({
      ...topologyFields,
      participantBlocks: [participantBlock],
    }),
  }
);
