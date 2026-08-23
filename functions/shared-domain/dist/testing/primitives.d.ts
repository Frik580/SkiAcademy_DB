export declare const canonicalPrimitiveFixtures: Readonly<{
    accountId: import("../canonical").CanonicalId<"account">;
    instructorId: import("../canonical").CanonicalId<"instructor">;
    participantId: import("../canonical").CanonicalId<"participant">;
    bookingId: import("../canonical").CanonicalId<"booking">;
    courseId: import("../canonical").CanonicalId<"course">;
    courseDayId: import("../canonical").CanonicalId<"course_day">;
    courseEnrollmentId: import("../canonical").CanonicalId<"course_enrollment">;
    paymentId: import("../canonical").CanonicalId<"payment">;
    correlationId: import("../canonical").CanonicalId<"correlation">;
    guestSubjectId: import("../canonical").CanonicalId<"guest_subject">;
    guestActorRef: {
        kind: "guest";
        guestSubjectId: import("../canonical").CanonicalId<"guest_subject">;
    };
    activeCourseEnrollmentGuardKey: import("../canonical").ActiveCourseEnrollmentGuardKey;
    revision: import("../canonical").AggregateRevision;
    money: {
        currency: "KZT";
        minorUnits: import("../canonical").KztMinorUnits;
    };
    interval: {
        startsAt: {
            seconds: number;
            nanoseconds: number;
        };
        endsAt: {
            seconds: number;
            nanoseconds: number;
        };
    };
    timeZone: "Asia/Almaty";
}>;
