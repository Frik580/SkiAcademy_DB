import {
  AccountIdSchema,
  ActivityLogIdSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseIdSchema,
  DomainOutboxIdSchema,
  GuestSubjectIdSchema,
  InstructorIdSchema,
  InstructorRelationshipIdSchema,
  MonetaryEventIdSchema,
  ParticipantAccessTopologySchema,
  ParticipantBlockIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  OccurrenceIdSchema,
  PaymentIdSchema,
  ResourceClaimIdSchema,
  WalletSchema,
  accountActorRef,
  activeCourseEnrollmentGuardKey,
  activityLogIdFromCommandId,
  canonicalPaths,
  canonicalReference,
  domainOutboxIdFromCommand,
  evaluateInstructorParticipantAccess,
  evaluateParticipantManagementAccess,
  monetaryEventIdFromCommandEffect,
  resourceClaimIdFromIdentity,
  type BookingId,
  type InstructorParticipantAccessDecision,
  type InstructorRelationship,
  type ParticipantBlock,
  type ParticipantManagement,
  type ParticipantManagementAccessDecision,
  type PaymentId,
} from '../src';
import { canonicalPrimitiveFixtures } from '../src/testing';

const paymentId = PaymentIdSchema.parse('payment_contract_01');
const monetaryEventId = MonetaryEventIdSchema.parse('monetary_event_contract_01');
const resourceClaimId = ResourceClaimIdSchema.parse('resource_claim_contract_01');
const activityLogId = ActivityLogIdSchema.parse('activity_log_contract_01');
const outboxId = DomainOutboxIdSchema.parse('domain_outbox_contract_01');
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

const bookingId = BookingIdSchema.parse('booking_contract_01');

canonicalReference('payment', paymentId);
canonicalPaths.payment(paymentId);
activityLogIdFromCommandId(commandId);
domainOutboxIdFromCommand(commandId, 0);
monetaryEventIdFromCommandEffect(commandId, 0);
resourceClaimIdFromIdentity({
  strategyVersion: 'claim:v1',
  claimKind: 'instructor_booking_occurrence',
  resourceKind: 'instructor',
  resourceId: instructorId,
  ownerKind: 'booking',
  ownerId: bookingId,
  occurrenceId: OccurrenceIdSchema.parse('occurrence_contract_01'),
});
WalletSchema.parse({
  accountId,
  currency: 'KZT',
  balance: canonicalPrimitiveFixtures.money.minorUnits,
  revision: canonicalPrimitiveFixtures.revision,
  eventRevision: 0,
  createdAt: canonicalPrimitiveFixtures.interval.startsAt,
  updatedAt: canonicalPrimitiveFixtures.interval.startsAt,
});
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

// @ts-expect-error A Monetary Event ID cannot address a Payment document.
canonicalPaths.payment(monetaryEventId);

// @ts-expect-error A Resource Claim ID cannot address a Payment document.
canonicalPaths.payment(resourceClaimId);

// @ts-expect-error Branded financial and claim IDs are not interchangeable.
const crossFinancialId: PaymentId = monetaryEventId;

// @ts-expect-error Branded claim IDs are not interchangeable with Payment IDs.
const crossClaimId: PaymentId = resourceClaimId;

// @ts-expect-error Activity Log IDs cannot substitute for outbox IDs.
const crossOutboxId: DomainOutboxId = activityLogId;

void crossFinancialId;
void crossClaimId;
void crossOutboxId;
void paymentId;
void monetaryEventId;
void resourceClaimId;
void activityLogId;
void outboxId;

canonicalReference('booking', bookingId);
canonicalPaths.booking(bookingId);

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

// @ts-expect-error Branded aggregate IDs are not structurally interchangeable.
const crossTypeId: BookingId = participantId;

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
