import { z } from 'zod';
export declare const GuestCourseEnrollmentLinkCredentialSchema: z.ZodObject<{
    enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
    guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"guest_subject">, string>>;
    nonce: z.ZodString;
    signature: z.ZodString;
    expiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export type GuestCourseEnrollmentLinkCredential = Readonly<z.output<typeof GuestCourseEnrollmentLinkCredentialSchema>>;
export declare const CreateCourseEnrollmentsResultPayloadSchema: z.ZodObject<{
    guestLinkCredentials: z.ZodOptional<z.ZodArray<z.ZodObject<{
        enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
        guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"guest_subject">, string>>;
        nonce: z.ZodString;
        signature: z.ZodString;
        expiresAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type CreateCourseEnrollmentsResultPayload = Readonly<z.output<typeof CreateCourseEnrollmentsResultPayloadSchema>>;
export declare const CommandResultPayloadSchemaByKind: {
    readonly create_course_enrollments: z.ZodObject<{
        guestLinkCredentials: z.ZodOptional<z.ZodArray<z.ZodObject<{
            enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"course_enrollment">, string>>;
            guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"guest_subject">, string>>;
            nonce: z.ZodString;
            signature: z.ZodString;
            expiresAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
};
export type CommandResultPayloadForKind<Kind extends keyof typeof CommandResultPayloadSchemaByKind> = z.output<(typeof CommandResultPayloadSchemaByKind)[Kind]>;
export declare function parseCommandResultPayload<Kind extends keyof typeof CommandResultPayloadSchemaByKind>(kind: Kind, input: unknown): z.ZodSafeParseResult<CommandResultPayloadForKind<Kind>>;
