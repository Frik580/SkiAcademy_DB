"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withDocumentId = exports.WalletTransactionDocumentSchema = exports.UserProfileDocumentSchema = exports.CourseDocumentSchema = exports.BookingDocumentSchema = exports.WalletCurrencySchema = exports.WalletLedgerTypeSchema = exports.BookingStatusSchema = exports.LessonDifficultySchema = void 0;
exports.createBookingDraft = createBookingDraft;
exports.createUserProfileDefaults = createUserProfileDefaults;
const zod_1 = require("zod");
exports.LessonDifficultySchema = zod_1.z.enum([
    'beginner',
    'intermediate',
    'advanced',
    'freeride',
    'freestyle',
]);
exports.BookingStatusSchema = zod_1.z.enum([
    'pending',
    'confirmed',
    'cancelled',
    'completed',
    'pending_cancellation',
]);
exports.WalletLedgerTypeSchema = zod_1.z.enum([
    'top_up',
    'starter_credit',
    'lesson_payment',
    'course_payment',
    'refund',
    'admin_adjustment',
]);
exports.WalletCurrencySchema = zod_1.z.enum(['USD', 'KZT']);
exports.BookingDocumentSchema = zod_1.z
    .object({
    userId: zod_1.z.string(),
    instructorId: zod_1.z.string(),
    instructorName: zod_1.z.string(),
    instructorAvatar: zod_1.z.string(),
    date: zod_1.z.string(),
    time: zod_1.z.string(),
    durationHours: zod_1.z.number().finite().positive(),
    totalPrice: zod_1.z.number().finite(),
    status: exports.BookingStatusSchema,
    difficulty: exports.LessonDifficultySchema,
    notes: zod_1.z.string().optional(),
    cancellationReason: zod_1.z.string().optional(),
    isDeleted: zod_1.z.boolean().optional(),
    isGuest: zod_1.z.boolean().optional(),
    guestName: zod_1.z.string().optional(),
    guestPhone: zod_1.z.string().optional(),
    guestEmail: zod_1.z.string().optional(),
    courseId: zod_1.z.string().optional(),
    recommendations: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string(), text: zod_1.z.string() })).optional(),
    completedRecommendationIds: zod_1.z.array(zod_1.z.string()).optional(),
    endsAt: zod_1.z.string().optional(),
    createdAt: zod_1.z.string().optional(),
})
    .passthrough();
const CourseProgramSchema = zod_1.z.object({ day: zod_1.z.string(), title: zod_1.z.string(), desc: zod_1.z.string() });
const CourseFaqSchema = zod_1.z.object({ q: zod_1.z.string(), a: zod_1.z.string() });
exports.CourseDocumentSchema = zod_1.z
    .object({
    title: zod_1.z.string(),
    titleRu: zod_1.z.string().optional(),
    duration: zod_1.z.string(),
    description: zod_1.z.string(),
    dates: zod_1.z.string(),
    totalSeats: zod_1.z.number().finite(),
    availableSeats: zod_1.z.number().finite(),
    price: zod_1.z.number().finite(),
    priceKZT: zod_1.z.number().finite().optional(),
    bgImageUrl: zod_1.z.string(),
    isHidden: zod_1.z.boolean().optional(),
    instructorIds: zod_1.z.array(zod_1.z.string()).optional(),
    order: zod_1.z.number().finite().optional(),
    shortDescription: zod_1.z.string().optional(),
    shortDescriptionRu: zod_1.z.string().optional(),
    detailedDescription: zod_1.z.string().optional(),
    detailedDescriptionRu: zod_1.z.string().optional(),
    badge: zod_1.z.string().optional(),
    badgeRu: zod_1.z.string().optional(),
    level: zod_1.z.enum(['beginner', 'intermediate', 'advanced', 'expert', '']).optional(),
    levelLabel: zod_1.z.string().optional(),
    videoUrl: zod_1.z.string().optional(),
    benefits: zod_1.z.array(zod_1.z.string()).optional(),
    benefitsRu: zod_1.z.array(zod_1.z.string()).optional(),
    program: zod_1.z.array(CourseProgramSchema).optional(),
    programRu: zod_1.z.array(CourseProgramSchema).optional(),
    faq: zod_1.z.array(CourseFaqSchema).optional(),
    faqRu: zod_1.z.array(CourseFaqSchema).optional(),
    galleryPhotos: zod_1.z.array(zod_1.z.string()).optional(),
})
    .passthrough();
exports.UserProfileDocumentSchema = zod_1.z
    .object({
    uid: zod_1.z.string(),
    email: zod_1.z.string(),
    displayName: zod_1.z.string(),
    phoneNumber: zod_1.z.string().optional(),
    role: zod_1.z.enum(['user', 'admin']),
    systemRole: zod_1.z.literal('owner').optional(),
    avatarUrl: zod_1.z.string(),
    balanceUSD: zod_1.z.number().finite(),
    walletBalances: zod_1.z.record(exports.WalletCurrencySchema, zod_1.z.number().finite()).optional(),
    pendingWalletCredit: zod_1.z.number().finite().optional(),
    lastRefundBookingId: zod_1.z.string().optional(),
    instructorId: zod_1.z.string().optional(),
    isInstructor: zod_1.z.boolean().optional(),
    isClientActive: zod_1.z.boolean().optional(),
    level: zod_1.z.number().finite().optional(),
    skillScores: zod_1.z.record(zod_1.z.string(), zod_1.z.number().finite()).optional(),
    skillComments: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    hideProgressTracking: zod_1.z.boolean().optional(),
    todaySkillItemIds: zod_1.z.array(zod_1.z.string()).optional(),
    completedTodayTaskIds: zod_1.z.array(zod_1.z.string()).optional(),
    completedTodayDate: zod_1.z.string().optional(),
    customTodayTasks: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string(), text: zod_1.z.string() })).optional(),
    dismissedTodayTaskIds: zod_1.z.array(zod_1.z.string()).optional(),
    dismissedReviewIds: zod_1.z.array(zod_1.z.string()).optional(),
})
    .passthrough();
exports.WalletTransactionDocumentSchema = zod_1.z
    .object({
    id: zod_1.z.string(),
    userId: zod_1.z.string(),
    amount: zod_1.z.number().finite().refine((value) => value !== 0, 'amount must not be zero'),
    balanceAfter: zod_1.z.number().finite().nonnegative(),
    currency: exports.WalletCurrencySchema.optional(),
    type: exports.WalletLedgerTypeSchema,
    subjectName: zod_1.z.string().optional(),
    bookingId: zod_1.z.string().optional(),
    courseId: zod_1.z.string().optional(),
    createdAt: zod_1.z.string(),
})
    .passthrough();
const withDocumentId = (id, fields) => ({
    ...fields,
    id,
});
exports.withDocumentId = withDocumentId;
function createBookingDraft(input) {
    return {
        ...input,
        instructorAvatar: input.instructorAvatar ?? '',
        difficulty: input.difficulty ?? 'beginner',
        totalPrice: 0,
        status: 'pending',
        ...(input.notes ? { notes: input.notes } : {}),
    };
}
function createUserProfileDefaults(input) {
    return {
        ...input,
        role: 'user',
        avatarUrl: '',
        balanceUSD: 0,
    };
}
