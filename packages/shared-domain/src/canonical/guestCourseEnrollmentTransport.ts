import { z } from 'zod';
import {
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  ParticipantIdSchema,
  type CourseEnrollmentId,
  type GuestSubjectId,
} from './identifiers';
import { guestSubjectIdFromCourseEnrollmentId } from './deterministicIdentity';

export const GuestCreateCourseEnrollmentsIntentSchema = z
  .object({
    courseId: CourseIdSchema,
    participantIds: z.array(ParticipantIdSchema).min(1).max(1),
    enrollmentIds: z.array(CourseEnrollmentIdSchema).min(1).max(1),
  })
  .strict()
  .superRefine((intent, context) => {
    if (intent.enrollmentIds.length !== intent.participantIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['enrollmentIds'],
        message: 'enrollmentIds length must match participantIds length',
      });
    }
  });

export type GuestCreateCourseEnrollmentsIntent = Readonly<
  z.output<typeof GuestCreateCourseEnrollmentsIntentSchema>
>;

export function deriveGuestSubjectIdFromCourseEnrollmentIntent(
  intent: GuestCreateCourseEnrollmentsIntent | undefined
): GuestSubjectId | undefined {
  if (!intent) {
    return undefined;
  }
  const parsed = GuestCreateCourseEnrollmentsIntentSchema.safeParse(intent);
  if (!parsed.success) {
    return undefined;
  }
  return guestSubjectIdFromCourseEnrollmentId(parsed.data.enrollmentIds[0]!);
}

export function resolveGuestCourseEnrollmentIdFromIntent(
  intent: GuestCreateCourseEnrollmentsIntent,
  participantIndex: number
): CourseEnrollmentId {
  return intent.enrollmentIds[participantIndex]!;
}
