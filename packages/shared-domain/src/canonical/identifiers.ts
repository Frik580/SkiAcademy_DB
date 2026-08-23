import { z } from 'zod';

declare const canonicalIdBrand: unique symbol;

export const CANONICAL_ID_KINDS = [
  'account',
  'instructor',
  'participant',
  'participant_management',
  'participant_management_active_owner',
  'instructor_relationship',
  'participant_block',
  'booking',
  'course',
  'course_day',
  'course_enrollment',
  'payment',
  'attendance',
  'booking_proposal',
  'booking_change_request',
  'admin_issue',
  'resource_claim',
  'resource_claim_guard',
  'active_course_enrollment_guard',
  'activity_log',
  'command',
  'domain_outbox',
  'notification',
  'monetary_event',
  'provider_event_receipt',
  'correlation',
  'causation',
  'occurrence',
  'incremental_requirement',
  'guest_subject',
  'system_actor',
  'provider',
] as const;

export type CanonicalIdKind = (typeof CANONICAL_ID_KINDS)[number];

export type CanonicalId<Kind extends CanonicalIdKind> = string & {
  readonly [canonicalIdBrand]: Kind;
};

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export const CanonicalOpaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(OPAQUE_ID_PATTERN, 'ID must be a bounded URL-safe opaque value');

function canonicalIdSchema<const Kind extends CanonicalIdKind>(kind: Kind) {
  return CanonicalOpaqueIdSchema.transform((value) => value as CanonicalId<Kind>).describe(
    `${kind} ID`
  );
}

export const AccountIdSchema = canonicalIdSchema('account');
export const InstructorIdSchema = canonicalIdSchema('instructor');
export const ParticipantIdSchema = canonicalIdSchema('participant');
export const ParticipantManagementIdSchema = canonicalIdSchema('participant_management');
export const ParticipantManagementActiveOwnerIdSchema = canonicalIdSchema(
  'participant_management_active_owner'
);
export const InstructorRelationshipIdSchema = canonicalIdSchema('instructor_relationship');
export const ParticipantBlockIdSchema = canonicalIdSchema('participant_block');
export const BookingIdSchema = canonicalIdSchema('booking');
export const CourseIdSchema = canonicalIdSchema('course');
export const CourseDayIdSchema = canonicalIdSchema('course_day');
export const CourseEnrollmentIdSchema = canonicalIdSchema('course_enrollment');
export const PaymentIdSchema = canonicalIdSchema('payment');
export const AttendanceIdSchema = canonicalIdSchema('attendance');
export const BookingProposalIdSchema = canonicalIdSchema('booking_proposal');
export const BookingChangeRequestIdSchema = canonicalIdSchema('booking_change_request');
export const AdminIssueIdSchema = canonicalIdSchema('admin_issue');
export const ResourceClaimIdSchema = canonicalIdSchema('resource_claim');
export const ResourceClaimGuardIdSchema = canonicalIdSchema('resource_claim_guard');
export const ActiveCourseEnrollmentGuardIdSchema = canonicalIdSchema(
  'active_course_enrollment_guard'
);
export const ActivityLogIdSchema = canonicalIdSchema('activity_log');
export const CommandIdSchema = canonicalIdSchema('command');
export const DomainOutboxIdSchema = canonicalIdSchema('domain_outbox');
export const NotificationIdSchema = canonicalIdSchema('notification');
export const MonetaryEventIdSchema = canonicalIdSchema('monetary_event');
export const ProviderEventReceiptIdSchema = canonicalIdSchema('provider_event_receipt');
export const CorrelationIdSchema = canonicalIdSchema('correlation');
export const CausationIdSchema = canonicalIdSchema('causation');
export const OccurrenceIdSchema = canonicalIdSchema('occurrence');
export const IncrementalRequirementIdSchema = canonicalIdSchema('incremental_requirement');
export const GuestSubjectIdSchema = canonicalIdSchema('guest_subject');
export const SystemActorIdSchema = canonicalIdSchema('system_actor');
export const ProviderIdSchema = canonicalIdSchema('provider');

export type AccountId = z.output<typeof AccountIdSchema>;
export type InstructorId = z.output<typeof InstructorIdSchema>;
export type ParticipantId = z.output<typeof ParticipantIdSchema>;
export type ParticipantManagementId = z.output<typeof ParticipantManagementIdSchema>;
export type ParticipantManagementActiveOwnerId = z.output<
  typeof ParticipantManagementActiveOwnerIdSchema
>;
export type InstructorRelationshipId = z.output<typeof InstructorRelationshipIdSchema>;
export type ParticipantBlockId = z.output<typeof ParticipantBlockIdSchema>;
export type BookingId = z.output<typeof BookingIdSchema>;
export type CourseId = z.output<typeof CourseIdSchema>;
export type CourseDayId = z.output<typeof CourseDayIdSchema>;
export type CourseEnrollmentId = z.output<typeof CourseEnrollmentIdSchema>;
export type PaymentId = z.output<typeof PaymentIdSchema>;
export type AttendanceId = z.output<typeof AttendanceIdSchema>;
export type BookingProposalId = z.output<typeof BookingProposalIdSchema>;
export type BookingChangeRequestId = z.output<typeof BookingChangeRequestIdSchema>;
export type AdminIssueId = z.output<typeof AdminIssueIdSchema>;
export type ResourceClaimId = z.output<typeof ResourceClaimIdSchema>;
export type ResourceClaimGuardId = z.output<typeof ResourceClaimGuardIdSchema>;
export type ActiveCourseEnrollmentGuardId = z.output<typeof ActiveCourseEnrollmentGuardIdSchema>;
export type ActivityLogId = z.output<typeof ActivityLogIdSchema>;
export type CommandId = z.output<typeof CommandIdSchema>;
export type DomainOutboxId = z.output<typeof DomainOutboxIdSchema>;
export type NotificationId = z.output<typeof NotificationIdSchema>;
export type MonetaryEventId = z.output<typeof MonetaryEventIdSchema>;
export type ProviderEventReceiptId = z.output<typeof ProviderEventReceiptIdSchema>;
export type CorrelationId = z.output<typeof CorrelationIdSchema>;
export type CausationId = z.output<typeof CausationIdSchema>;
export type OccurrenceId = z.output<typeof OccurrenceIdSchema>;
export type IncrementalRequirementId = z.output<typeof IncrementalRequirementIdSchema>;
export type GuestSubjectId = z.output<typeof GuestSubjectIdSchema>;
export type SystemActorId = z.output<typeof SystemActorIdSchema>;
export type ProviderId = z.output<typeof ProviderIdSchema>;

const referenceSchemas = {
  account: AccountIdSchema,
  instructor: InstructorIdSchema,
  participant: ParticipantIdSchema,
  participant_management: ParticipantManagementIdSchema,
  instructor_relationship: InstructorRelationshipIdSchema,
  participant_block: ParticipantBlockIdSchema,
  booking: BookingIdSchema,
  course: CourseIdSchema,
  course_day: CourseDayIdSchema,
  course_enrollment: CourseEnrollmentIdSchema,
  payment: PaymentIdSchema,
  attendance: AttendanceIdSchema,
  booking_proposal: BookingProposalIdSchema,
  booking_change_request: BookingChangeRequestIdSchema,
  admin_issue: AdminIssueIdSchema,
  resource_claim: ResourceClaimIdSchema,
  activity_log: ActivityLogIdSchema,
  domain_outbox: DomainOutboxIdSchema,
  notification: NotificationIdSchema,
  monetary_event: MonetaryEventIdSchema,
} as const;

export const CANONICAL_REFERENCE_KINDS = Object.keys(referenceSchemas) as Array<
  keyof typeof referenceSchemas
>;

export type CanonicalReferenceKind = keyof typeof referenceSchemas;

export type CanonicalReferenceIdMap = {
  [Kind in CanonicalReferenceKind]: z.output<(typeof referenceSchemas)[Kind]>;
};

export type CanonicalReferenceFor<Kind extends CanonicalReferenceKind> = Readonly<{
  kind: Kind;
  id: CanonicalReferenceIdMap[Kind];
}>;

export type CanonicalReference = {
  [Kind in CanonicalReferenceKind]: CanonicalReferenceFor<Kind>;
}[CanonicalReferenceKind];

const canonicalReferenceSchemas = Object.entries(referenceSchemas).map(([kind, idSchema]) =>
  z.object({ kind: z.literal(kind), id: idSchema }).strict()
);

export const CanonicalReferenceSchema = z.discriminatedUnion(
  'kind',
  canonicalReferenceSchemas as [
    (typeof canonicalReferenceSchemas)[number],
    (typeof canonicalReferenceSchemas)[number],
    ...(typeof canonicalReferenceSchemas)[number][],
  ]
) as z.ZodType<CanonicalReference>;

export function canonicalReference<Kind extends CanonicalReferenceKind>(
  kind: Kind,
  id: CanonicalReferenceIdMap[Kind]
): CanonicalReferenceFor<Kind> {
  return { kind, id };
}
