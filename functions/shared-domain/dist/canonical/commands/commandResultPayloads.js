"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandResultPayloadSchemaByKind = exports.CreateCourseEnrollmentsResultPayloadSchema = exports.GuestCourseEnrollmentLinkCredentialSchema = void 0;
exports.parseCommandResultPayload = parseCommandResultPayload;
const zod_1 = require("zod");
const identifiers_1 = require("../identifiers");
const primitives_1 = require("../primitives");
exports.GuestCourseEnrollmentLinkCredentialSchema = zod_1.z
    .object({
    enrollmentId: identifiers_1.CourseEnrollmentIdSchema,
    guestSubjectId: identifiers_1.GuestSubjectIdSchema,
    nonce: zod_1.z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    signature: zod_1.z.string().regex(/^[0-9a-fA-F]{64}$/),
    expiresAt: primitives_1.CanonicalTimestampSchema,
})
    .strict();
exports.CreateCourseEnrollmentsResultPayloadSchema = zod_1.z
    .object({
    guestLinkCredentials: zod_1.z.array(exports.GuestCourseEnrollmentLinkCredentialSchema).optional(),
})
    .strict();
exports.CommandResultPayloadSchemaByKind = {
    create_course_enrollments: exports.CreateCourseEnrollmentsResultPayloadSchema,
};
function parseCommandResultPayload(kind, input) {
    return exports.CommandResultPayloadSchemaByKind[kind].safeParse(input);
}
