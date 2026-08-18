import { z } from 'zod';
export declare const LessonDifficultySchema: z.ZodEnum<{
    beginner: "beginner";
    intermediate: "intermediate";
    advanced: "advanced";
    freeride: "freeride";
    freestyle: "freestyle";
}>;
export declare const BookingStatusSchema: z.ZodEnum<{
    pending: "pending";
    confirmed: "confirmed";
    cancelled: "cancelled";
    completed: "completed";
    pending_cancellation: "pending_cancellation";
}>;
export declare const WalletLedgerTypeSchema: z.ZodEnum<{
    top_up: "top_up";
    starter_credit: "starter_credit";
    lesson_payment: "lesson_payment";
    course_payment: "course_payment";
    refund: "refund";
    admin_adjustment: "admin_adjustment";
}>;
export declare const WalletCurrencySchema: z.ZodEnum<{
    USD: "USD";
    KZT: "KZT";
}>;
export declare const BookingDocumentSchema: z.ZodObject<{
    userId: z.ZodString;
    instructorId: z.ZodString;
    instructorName: z.ZodString;
    instructorAvatar: z.ZodString;
    date: z.ZodString;
    time: z.ZodString;
    durationHours: z.ZodNumber;
    totalPrice: z.ZodNumber;
    status: z.ZodEnum<{
        pending: "pending";
        confirmed: "confirmed";
        cancelled: "cancelled";
        completed: "completed";
        pending_cancellation: "pending_cancellation";
    }>;
    difficulty: z.ZodEnum<{
        beginner: "beginner";
        intermediate: "intermediate";
        advanced: "advanced";
        freeride: "freeride";
        freestyle: "freestyle";
    }>;
    notes: z.ZodOptional<z.ZodString>;
    cancellationReason: z.ZodOptional<z.ZodString>;
    isDeleted: z.ZodOptional<z.ZodBoolean>;
    isGuest: z.ZodOptional<z.ZodBoolean>;
    guestName: z.ZodOptional<z.ZodString>;
    guestPhone: z.ZodOptional<z.ZodString>;
    guestEmail: z.ZodOptional<z.ZodString>;
    courseId: z.ZodOptional<z.ZodString>;
    recommendations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
    }, z.core.$strip>>>;
    completedRecommendationIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    endsAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export declare const CourseDocumentSchema: z.ZodObject<{
    title: z.ZodString;
    titleRu: z.ZodOptional<z.ZodString>;
    duration: z.ZodString;
    description: z.ZodString;
    dates: z.ZodString;
    totalSeats: z.ZodNumber;
    availableSeats: z.ZodNumber;
    price: z.ZodNumber;
    priceKZT: z.ZodOptional<z.ZodNumber>;
    bgImageUrl: z.ZodString;
    isHidden: z.ZodOptional<z.ZodBoolean>;
    instructorIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    order: z.ZodOptional<z.ZodNumber>;
    shortDescription: z.ZodOptional<z.ZodString>;
    shortDescriptionRu: z.ZodOptional<z.ZodString>;
    detailedDescription: z.ZodOptional<z.ZodString>;
    detailedDescriptionRu: z.ZodOptional<z.ZodString>;
    badge: z.ZodOptional<z.ZodString>;
    badgeRu: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodEnum<{
        "": "";
        beginner: "beginner";
        intermediate: "intermediate";
        advanced: "advanced";
        expert: "expert";
    }>>;
    levelLabel: z.ZodOptional<z.ZodString>;
    videoUrl: z.ZodOptional<z.ZodString>;
    benefits: z.ZodOptional<z.ZodArray<z.ZodString>>;
    benefitsRu: z.ZodOptional<z.ZodArray<z.ZodString>>;
    program: z.ZodOptional<z.ZodArray<z.ZodObject<{
        day: z.ZodString;
        title: z.ZodString;
        desc: z.ZodString;
    }, z.core.$strip>>>;
    programRu: z.ZodOptional<z.ZodArray<z.ZodObject<{
        day: z.ZodString;
        title: z.ZodString;
        desc: z.ZodString;
    }, z.core.$strip>>>;
    faq: z.ZodOptional<z.ZodArray<z.ZodObject<{
        q: z.ZodString;
        a: z.ZodString;
    }, z.core.$strip>>>;
    faqRu: z.ZodOptional<z.ZodArray<z.ZodObject<{
        q: z.ZodString;
        a: z.ZodString;
    }, z.core.$strip>>>;
    galleryPhotos: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>;
export declare const UserProfileDocumentSchema: z.ZodObject<{
    uid: z.ZodString;
    email: z.ZodString;
    displayName: z.ZodString;
    phoneNumber: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<{
        user: "user";
        admin: "admin";
    }>;
    systemRole: z.ZodOptional<z.ZodLiteral<"owner">>;
    avatarUrl: z.ZodString;
    balanceUSD: z.ZodNumber;
    walletBalances: z.ZodOptional<z.ZodRecord<z.ZodEnum<{
        USD: "USD";
        KZT: "KZT";
    }>, z.ZodNumber>>;
    pendingWalletCredit: z.ZodOptional<z.ZodNumber>;
    lastRefundBookingId: z.ZodOptional<z.ZodString>;
    instructorId: z.ZodOptional<z.ZodString>;
    isInstructor: z.ZodOptional<z.ZodBoolean>;
    isClientActive: z.ZodOptional<z.ZodBoolean>;
    level: z.ZodOptional<z.ZodNumber>;
    skillScores: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    skillComments: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    hideProgressTracking: z.ZodOptional<z.ZodBoolean>;
    todaySkillItemIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    completedTodayTaskIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    completedTodayDate: z.ZodOptional<z.ZodString>;
    customTodayTasks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        text: z.ZodString;
    }, z.core.$strip>>>;
    dismissedTodayTaskIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    dismissedReviewIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$loose>;
export declare const WalletTransactionDocumentSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    amount: z.ZodNumber;
    balanceAfter: z.ZodNumber;
    currency: z.ZodOptional<z.ZodEnum<{
        USD: "USD";
        KZT: "KZT";
    }>>;
    type: z.ZodEnum<{
        top_up: "top_up";
        starter_credit: "starter_credit";
        lesson_payment: "lesson_payment";
        course_payment: "course_payment";
        refund: "refund";
        admin_adjustment: "admin_adjustment";
    }>;
    subjectName: z.ZodOptional<z.ZodString>;
    bookingId: z.ZodOptional<z.ZodString>;
    courseId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$loose>;
export type BookingDocument = z.infer<typeof BookingDocumentSchema>;
export type CourseDocument = z.infer<typeof CourseDocumentSchema>;
export type UserProfileDocument = z.infer<typeof UserProfileDocumentSchema>;
export type WalletTransactionDocument = z.infer<typeof WalletTransactionDocumentSchema>;
export declare const withDocumentId: <T extends object>(id: string, fields: T) => T & {
    id: string;
};
export declare function createBookingDraft(input: Pick<BookingDocument, 'userId' | 'instructorId' | 'instructorName' | 'date' | 'time' | 'durationHours'> & Partial<Pick<BookingDocument, 'instructorAvatar' | 'difficulty' | 'notes'>>): BookingDocument;
export declare function createUserProfileDefaults(input: Pick<UserProfileDocument, 'uid' | 'email' | 'displayName'>): UserProfileDocument;
