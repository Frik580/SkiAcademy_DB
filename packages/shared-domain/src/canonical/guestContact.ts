import { z } from 'zod';
import { BookingIdSchema, CourseEnrollmentIdSchema } from './identifiers';
import { CanonicalTimestampSchema } from './primitives';
import { DataScopeSchema } from './canonicalScope';
import { TestSessionIdSchema } from './identifiers';

export const GuestContactDetailsSchema = z.object({
  phone: z.string().trim().min(1).max(32),
  email: z.string().trim().email().max(320).optional(),
}).strict();

export const GuestContactSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('booking'), bookingId: BookingIdSchema }).strict(),
  z.object({ kind: z.literal('course_enrollment'), enrollmentId: CourseEnrollmentIdSchema }).strict(),
]);

export const GuestContactSchema = z.object({
  subject: GuestContactSubjectSchema,
  ...GuestContactDetailsSchema.shape,
  dataScope: DataScopeSchema,
  testSessionId: TestSessionIdSchema.optional(),
  createdAt: CanonicalTimestampSchema,
}).strict().superRefine((contact, context) => {
  if ((contact.dataScope === 'test') !== (contact.testSessionId !== undefined)) {
    context.addIssue({ code: 'custom', path: ['testSessionId'], message: 'Test scope requires testSessionId' });
  }
});

export type GuestContact = Readonly<z.output<typeof GuestContactSchema>>;
export type GuestContactSubject = z.output<typeof GuestContactSubjectSchema>;

export function guestContactDocumentId(subject: GuestContactSubject): string {
  return subject.kind === 'booking'
    ? `booking_${subject.bookingId}`
    : `course_enrollment_${subject.enrollmentId}`;
}
