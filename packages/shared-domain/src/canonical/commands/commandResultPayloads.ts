import { z } from 'zod';
import {
  CourseEnrollmentIdSchema,
  GuestSubjectIdSchema,
} from '../identifiers';
import { CanonicalTimestampSchema } from '../primitives';

export const GuestCourseEnrollmentLinkCredentialSchema = z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    guestSubjectId: GuestSubjectIdSchema,
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    signature: z.string().regex(/^[0-9a-fA-F]{64}$/),
    expiresAt: CanonicalTimestampSchema,
  })
  .strict();

export type GuestCourseEnrollmentLinkCredential = Readonly<
  z.output<typeof GuestCourseEnrollmentLinkCredentialSchema>
>;

export const CreateCourseEnrollmentsResultPayloadSchema = z
  .object({
    guestLinkCredentials: z.array(GuestCourseEnrollmentLinkCredentialSchema).optional(),
  })
  .strict();

export type CreateCourseEnrollmentsResultPayload = Readonly<
  z.output<typeof CreateCourseEnrollmentsResultPayloadSchema>
>;

export const CommandResultPayloadSchemaByKind = {
  create_course_enrollments: CreateCourseEnrollmentsResultPayloadSchema,
} as const;

export type CommandResultPayloadForKind<Kind extends keyof typeof CommandResultPayloadSchemaByKind> =
  z.output<(typeof CommandResultPayloadSchemaByKind)[Kind]>;

export function parseCommandResultPayload<Kind extends keyof typeof CommandResultPayloadSchemaByKind>(
  kind: Kind,
  input: unknown
): z.ZodSafeParseResult<CommandResultPayloadForKind<Kind>> {
  return CommandResultPayloadSchemaByKind[kind].safeParse(input) as z.ZodSafeParseResult<
    CommandResultPayloadForKind<Kind>
  >;
}
