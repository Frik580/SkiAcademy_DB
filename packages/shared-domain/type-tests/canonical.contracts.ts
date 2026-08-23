import {
  AccountIdSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  InstructorRelationshipIdSchema,
  ParticipantAccessTopologySchema,
  ParticipantBlockIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  accountActorRef,
  activeCourseEnrollmentGuardKey,
  canonicalPaths,
  canonicalReference,
  evaluateInstructorParticipantAccess,
  evaluateParticipantManagementAccess,
  type BookingId,
  type InstructorParticipantAccessDecision,
  type InstructorRelationship,
  type ParticipantBlock,
  type ParticipantManagement,
  type ParticipantManagementAccessDecision,
} from '../src';
import { canonicalPrimitiveFixtures } from '../src/testing';

const bookingId = BookingIdSchema.parse('booking_contract_01');
const participantId = ParticipantIdSchema.parse('participant_contract_01');
const accountId = AccountIdSchema.parse('account_contract_01');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_contract_01');
const courseId = CourseIdSchema.parse('course_contract_01');
const instructorId = InstructorIdSchema.parse('instructor_contract_01');
const managementId = ParticipantManagementIdSchema.parse('management_contract_01');
const commandId = CommandIdSchema.parse('command_contract_01');
const correlationId = CorrelationIdSchema.parse('correlation_contract_01');
const accessMetadata = {
  revision: canonicalPrimitiveFixtures.revision,
  createdAt: canonicalPrimitiveFixtures.interval.startsAt,
  updatedAt: canonicalPrimitiveFixtures.interval.startsAt,
  audit: {
    createdByCommandId: commandId,
    lastChangedByCommandId: commandId,
    correlationId,
  },
};
const ownedManagementContract: ParticipantManagement = {
  participantManagementId: managementId,
  accountId,
  participantId,
  role: 'owner',
  authority: 'self',
  status: 'active',
  ...accessMetadata,
};
const dependentManagementContract: ParticipantManagement = {
  ...ownedManagementContract,
  authority: 'parent_guardian',
};
const managerBlockContract: ParticipantBlock = {
  participantBlockId: ParticipantBlockIdSchema.parse('manager_block_contract_01'),
  participantId,
  instructorId,
  createdBy: { kind: 'participant_manager', accountId, participantManagementId: managementId },
  reason: 'Manager block contract',
  status: 'active',
  ...accessMetadata,
};
const instructorBlockContract: ParticipantBlock = {
  ...managerBlockContract,
  participantBlockId: ParticipantBlockIdSchema.parse('instructor_block_contract_01'),
  createdBy: { kind: 'instructor', instructorId },
};
const revokedRelationshipContract: InstructorRelationship = {
  instructorRelationshipId: InstructorRelationshipIdSchema.parse(
    'revoked_relationship_contract_01'
  ),
  participantId,
  instructorId,
  basis: {
    kind: 'guardian_permission',
    participantManagementId: managementId,
    grantedByAccountId: accountId,
  },
  validFrom: canonicalPrimitiveFixtures.interval.startsAt,
  expiresAt: canonicalPrimitiveFixtures.interval.endsAt,
  status: 'revoked',
  revokedAt: canonicalPrimitiveFixtures.interval.startsAt,
  revokedBy: { kind: 'participant_manager', accountId, participantManagementId: managementId },
  ...accessMetadata,
};
const blockedDecisionContract: InstructorParticipantAccessDecision = {
  allowed: false,
  reason: 'blocked',
};
const unauthorizedDecisionContract: ParticipantManagementAccessDecision = {
  allowed: false,
  reason: 'unauthorized',
};
const accessTopology = ParticipantAccessTopologySchema.parse({
  accounts: [],
  participants: [],
  participantManagement: [],
  activeOwnerGuards: [],
  instructorRelationships: [],
  participantBlocks: [],
});

canonicalReference('booking', bookingId);
canonicalPaths.booking(bookingId);
accountActorRef(accountId);
activeCourseEnrollmentGuardKey(participantId, courseId);
evaluateParticipantManagementAccess(accessTopology, { accountId, participantId });
evaluateInstructorParticipantAccess(accessTopology, {
  instructorId,
  participantId,
  at: canonicalPrimitiveFixtures.interval.startsAt,
  bookingScopedEvidence: [],
});

const invalidInstructorBlockContract: ParticipantBlock = {
  ...instructorBlockContract,
  // @ts-expect-error A block's Instructor actor cannot be an Account identity.
  createdBy: { kind: 'instructor', instructorId: accountId },
};

// @ts-expect-error A Participant ID cannot cross the Booking reference boundary.
canonicalReference('booking', participantId);

// @ts-expect-error A Participant ID cannot address a Booking document.
canonicalPaths.booking(participantId);

// @ts-expect-error Branded aggregate IDs are not structurally interchangeable.
const crossTypeId: BookingId = participantId;

// @ts-expect-error A guest subject cannot be substituted for an Account actor.
accountActorRef(guestSubjectId);

// @ts-expect-error The active Enrollment guard must be keyed by Participant and Course.
activeCourseEnrollmentGuardKey(bookingId, courseId);

// @ts-expect-error Management access cannot target an Account as a Participant.
evaluateParticipantManagementAccess(accessTopology, { accountId, participantId: accountId });

evaluateInstructorParticipantAccess(accessTopology, {
  // @ts-expect-error Instructor access requires an Instructor identity, not an Account identity.
  instructorId: accountId,
  participantId,
  at: canonicalPrimitiveFixtures.interval.startsAt,
  bookingScopedEvidence: [],
});

void crossTypeId;
void ownedManagementContract;
void dependentManagementContract;
void managerBlockContract;
void instructorBlockContract;
void revokedRelationshipContract;
void blockedDecisionContract;
void unauthorizedDecisionContract;
void invalidInstructorBlockContract;
void canonicalPrimitiveFixtures;
