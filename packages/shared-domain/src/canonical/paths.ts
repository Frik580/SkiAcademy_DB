import { z } from 'zod';
import {
  AccountIdSchema,
  ActiveCourseEnrollmentGuardKeySchema,
  ActivityLogIdSchema,
  AdminIssueIdSchema,
  AdministrativeAvailabilityBlockIdSchema,
  AttendanceIdSchema,
  BookingChangeRequestIdSchema,
  BookingIdSchema,
  BookingProposalIdSchema,
  CommandIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  DomainOutboxIdSchema,
  InstructorIdSchema,
  InstructorRelationshipIdSchema,
  MonetaryEventIdSchema,
  NotificationIdSchema,
  ParticipantBlockIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  PaymentIdSchema,
  ProviderEventReceiptIdSchema,
  ResourceClaimGuardIdSchema,
  ResourceClaimIdSchema,
  activeCourseEnrollmentGuardKey,
  type AccountId,
  type ActivityLogId,
  type AdminIssueId,
  type AdministrativeAvailabilityBlockId,
  type AttendanceId,
  type BookingChangeRequestId,
  type BookingId,
  type BookingProposalId,
  type CommandId,
  type CourseDayId,
  type CourseEnrollmentId,
  type CourseId,
  type DomainOutboxId,
  type InstructorId,
  type InstructorRelationshipId,
  type MonetaryEventId,
  type NotificationId,
  type ParticipantBlockId,
  type ParticipantId,
  type ParticipantManagementId,
  type PaymentId,
  type ProviderEventReceiptId,
  type ResourceClaimGuardId,
  type ResourceClaimId,
} from './identifiers';

declare const canonicalCollectionPathBrand: unique symbol;
declare const canonicalDocumentPathBrand: unique symbol;

export type CanonicalCollectionPath = string & {
  readonly [canonicalCollectionPathBrand]: 'CanonicalCollectionPath';
};

export type CanonicalDocumentPath = string & {
  readonly [canonicalDocumentPathBrand]: 'CanonicalDocumentPath';
};

export const CANONICAL_COLLECTIONS = {
  users: 'users',
  instructors: 'instructors',
  participants: 'participants',
  participantManagement: 'participant_management',
  participantManagementActiveOwner: 'participant_management_active_owner',
  instructorRelationships: 'instructor_relationships',
  participantBlocks: 'participant_blocks',
  bookings: 'bookings',
  courses: 'courses',
  courseEnrollments: 'course_enrollments',
  payments: 'payments',
  attendance: 'attendance',
  bookingProposals: 'booking_proposals',
  bookingChangeRequests: 'booking_change_requests',
  adminIssues: 'admin_issues',
  administrativeAvailabilityBlocks: 'administrative_availability_blocks',
  resourceClaims: 'resource_claims',
  resourceClaimGuards: 'resource_claim_guards',
  activeCourseEnrollmentGuards: 'active_course_enrollment_guards',
  activityLogs: 'activity_logs',
  commandIdempotency: 'command_idempotency',
  domainOutbox: 'domain_outbox',
  notifications: 'notifications',
  monetaryEvents: 'monetary_events',
  providerEventReceipts: 'provider_event_receipts',
} as const;

const topLevelDocumentSchemas: Readonly<Record<string, z.ZodType<string>>> = {
  users: AccountIdSchema,
  instructors: InstructorIdSchema,
  participants: ParticipantIdSchema,
  participant_management: ParticipantManagementIdSchema,
  participant_management_active_owner: ParticipantIdSchema,
  instructor_relationships: InstructorRelationshipIdSchema,
  participant_blocks: ParticipantBlockIdSchema,
  bookings: BookingIdSchema,
  courses: CourseIdSchema,
  course_enrollments: CourseEnrollmentIdSchema,
  payments: PaymentIdSchema,
  attendance: AttendanceIdSchema,
  booking_proposals: BookingProposalIdSchema,
  booking_change_requests: BookingChangeRequestIdSchema,
  admin_issues: AdminIssueIdSchema,
  administrative_availability_blocks: AdministrativeAvailabilityBlockIdSchema,
  resource_claims: ResourceClaimIdSchema,
  resource_claim_guards: ResourceClaimGuardIdSchema,
  active_course_enrollment_guards: ActiveCourseEnrollmentGuardKeySchema,
  activity_logs: ActivityLogIdSchema,
  command_idempotency: CommandIdSchema,
  domain_outbox: DomainOutboxIdSchema,
  notifications: NotificationIdSchema,
  monetary_events: MonetaryEventIdSchema,
  provider_event_receipts: ProviderEventReceiptIdSchema,
};

const topLevelCollections = new Set<string>(Object.values(CANONICAL_COLLECTIONS));

function isCanonicalCollectionPath(path: string): boolean {
  const segments = path.split('/');
  if (segments[0] !== '') return false;
  if (segments.length === 2) return topLevelCollections.has(segments[1]);
  if (segments.length === 4 && segments[1] === 'courses' && segments[3] === 'days') {
    return CourseIdSchema.safeParse(segments[2]).success;
  }
  if (segments.length === 4 && segments[1] === 'users' && segments[3] === 'wallet') {
    return AccountIdSchema.safeParse(segments[2]).success;
  }
  return false;
}

function isCanonicalDocumentPath(path: string): boolean {
  const segments = path.split('/');
  if (segments[0] !== '') return false;
  if (segments.length === 3) {
    const idSchema = topLevelDocumentSchemas[segments[1]];
    return Boolean(idSchema?.safeParse(segments[2]).success);
  }
  if (segments.length === 5 && segments[1] === 'courses' && segments[3] === 'days') {
    return (
      CourseIdSchema.safeParse(segments[2]).success &&
      CourseDayIdSchema.safeParse(segments[4]).success
    );
  }
  if (
    segments.length === 5 &&
    segments[1] === 'users' &&
    segments[3] === 'wallet' &&
    segments[4] === 'state'
  ) {
    return AccountIdSchema.safeParse(segments[2]).success;
  }
  return false;
}

export const CanonicalCollectionPathSchema = z
  .string()
  .refine(isCanonicalCollectionPath, 'Path must name a canonical collection')
  .transform((path) => path as CanonicalCollectionPath);

export const CanonicalDocumentPathSchema = z
  .string()
  .refine(isCanonicalDocumentPath, 'Path must name a canonical document')
  .transform((path) => path as CanonicalDocumentPath);

function documentPath(collection: string, id: string): CanonicalDocumentPath {
  return `/${collection}/${id}` as CanonicalDocumentPath;
}

export const canonicalPaths = {
  account: (id: AccountId) => documentPath('users', id),
  wallet: (id: AccountId) => `/users/${id}/wallet/state` as CanonicalDocumentPath,
  instructor: (id: InstructorId) => documentPath('instructors', id),
  participant: (id: ParticipantId) => documentPath('participants', id),
  participantManagement: (id: ParticipantManagementId) =>
    documentPath('participant_management', id),
  participantManagementActiveOwner: (id: ParticipantId) =>
    documentPath('participant_management_active_owner', id),
  instructorRelationship: (id: InstructorRelationshipId) =>
    documentPath('instructor_relationships', id),
  participantBlock: (id: ParticipantBlockId) => documentPath('participant_blocks', id),
  booking: (id: BookingId) => documentPath('bookings', id),
  course: (id: CourseId) => documentPath('courses', id),
  courseDays: (id: CourseId) => `/courses/${id}/days` as CanonicalCollectionPath,
  courseDay: (courseId: CourseId, dayId: CourseDayId) =>
    `/courses/${courseId}/days/${dayId}` as CanonicalDocumentPath,
  courseEnrollment: (id: CourseEnrollmentId) => documentPath('course_enrollments', id),
  payment: (id: PaymentId) => documentPath('payments', id),
  attendance: (id: AttendanceId) => documentPath('attendance', id),
  bookingProposal: (id: BookingProposalId) => documentPath('booking_proposals', id),
  bookingChangeRequest: (id: BookingChangeRequestId) => documentPath('booking_change_requests', id),
  adminIssue: (id: AdminIssueId) => documentPath('admin_issues', id),
  administrativeAvailabilityBlock: (id: AdministrativeAvailabilityBlockId) =>
    documentPath('administrative_availability_blocks', id),
  resourceClaim: (id: ResourceClaimId) => documentPath('resource_claims', id),
  resourceClaimGuard: (id: ResourceClaimGuardId) => documentPath('resource_claim_guards', id),
  activeCourseEnrollmentGuard: (participantId: ParticipantId, courseId: CourseId) =>
    documentPath(
      'active_course_enrollment_guards',
      activeCourseEnrollmentGuardKey(participantId, courseId)
    ),
  activityLog: (id: ActivityLogId) => documentPath('activity_logs', id),
  commandIdempotency: (id: CommandId) => documentPath('command_idempotency', id),
  domainOutbox: (id: DomainOutboxId) => documentPath('domain_outbox', id),
  notification: (id: NotificationId) => documentPath('notifications', id),
  monetaryEvent: (id: MonetaryEventId) => documentPath('monetary_events', id),
  providerEventReceipt: (id: ProviderEventReceiptId) => documentPath('provider_event_receipts', id),
} as const;
