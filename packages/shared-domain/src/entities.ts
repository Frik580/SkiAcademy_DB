import { z } from 'zod';
import { LessonDifficultySchema } from './canonical/bookingOccurrenceProposalChange';

export { LessonDifficultySchema };

export const BookingStatusSchema = z.enum([
  'pending',
  'confirmed',
  'cancelled',
  'completed',
  'pending_cancellation',
]);
export const WalletLedgerTypeSchema = z.enum([
  'top_up',
  'starter_credit',
  'lesson_payment',
  'course_payment',
  'refund',
  'admin_adjustment',
  'guest_payment',
]);
export const WalletCurrencySchema = z.enum(['USD', 'KZT']);

export const BookingDocumentSchema = z
  .object({
    userId: z.string(),
    instructorId: z.string(),
    instructorName: z.string(),
    instructorAvatar: z.string(),
    date: z.string(),
    time: z.string(),
    durationHours: z.number().finite().positive(),
    totalPrice: z.number().finite(),
    status: BookingStatusSchema,
    difficulty: LessonDifficultySchema,
    notes: z.string().optional(),
    cancellationReason: z.string().optional(),
    isDeleted: z.boolean().optional(),
    isGuest: z.boolean().optional(),
    guestName: z.string().optional(),
    guestPhone: z.string().optional(),
    guestEmail: z.string().optional(),
    courseId: z.string().optional(),
    recommendations: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
    completedRecommendationIds: z.array(z.string()).optional(),
    endsAt: z.string().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

const CourseProgramSchema = z.object({ day: z.string(), title: z.string(), desc: z.string() });
const CourseFaqSchema = z.object({ q: z.string(), a: z.string() });

export const CourseDocumentSchema = z
  .object({
    title: z.string(),
    titleRu: z.string().optional(),
    duration: z.string(),
    description: z.string(),
    dates: z.string(),
    totalSeats: z.number().finite(),
    availableSeats: z.number().finite(),
    price: z.number().finite(),
    priceKZT: z.number().finite().optional(),
    bgImageUrl: z.string(),
    isHidden: z.boolean().optional(),
    instructorIds: z.array(z.string()).optional(),
    order: z.number().finite().optional(),
    shortDescription: z.string().optional(),
    shortDescriptionRu: z.string().optional(),
    detailedDescription: z.string().optional(),
    detailedDescriptionRu: z.string().optional(),
    badge: z.string().optional(),
    badgeRu: z.string().optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert', '']).optional(),
    levelLabel: z.string().optional(),
    videoUrl: z.string().optional(),
    benefits: z.array(z.string()).optional(),
    benefitsRu: z.array(z.string()).optional(),
    program: z.array(CourseProgramSchema).optional(),
    programRu: z.array(CourseProgramSchema).optional(),
    faq: z.array(CourseFaqSchema).optional(),
    faqRu: z.array(CourseFaqSchema).optional(),
    galleryPhotos: z.array(z.string()).optional(),
  })
  .passthrough();

export const UserProfileDocumentSchema = z
  .object({
    uid: z.string(),
    email: z.string(),
    displayName: z.string(),
    phoneNumber: z.string().optional(),
    role: z.enum(['user', 'admin']),
    systemRole: z.literal('owner').optional(),
    avatarUrl: z.string(),
    balanceUSD: z.number().finite(),
    walletBalances: z.record(WalletCurrencySchema, z.number().finite()).optional(),
    pendingWalletCredit: z.number().finite().optional(),
    lastRefundBookingId: z.string().optional(),
    instructorId: z.string().optional(),
    isInstructor: z.boolean().optional(),
    isClientActive: z.boolean().optional(),
    level: z.number().finite().optional(),
    skillScores: z.record(z.string(), z.number().finite()).optional(),
    skillComments: z.record(z.string(), z.string()).optional(),
    hideProgressTracking: z.boolean().optional(),
    todaySkillItemIds: z.array(z.string()).optional(),
    completedTodayTaskIds: z.array(z.string()).optional(),
    completedTodayDate: z.string().optional(),
    customTodayTasks: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
    dismissedTodayTaskIds: z.array(z.string()).optional(),
    dismissedReviewIds: z.array(z.string()).optional(),
  })
  .passthrough();

export const WalletTransactionDocumentSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    amount: z.number().finite().refine((value) => value !== 0, 'amount must not be zero'),
    balanceAfter: z.number().finite().nonnegative(),
    currency: WalletCurrencySchema.optional(),
    type: WalletLedgerTypeSchema,
    subjectName: z.string().optional(),
    bookingId: z.string().optional(),
    courseId: z.string().optional(),
    createdAt: z.string(),
  })
  .passthrough();

export type BookingDocument = z.infer<typeof BookingDocumentSchema>;
export type CourseDocument = z.infer<typeof CourseDocumentSchema>;
export type UserProfileDocument = z.infer<typeof UserProfileDocumentSchema>;
export type WalletTransactionDocument = z.infer<typeof WalletTransactionDocumentSchema>;

export const withDocumentId = <T extends object>(id: string, fields: T): T & { id: string } => ({
  ...fields,
  id,
});

export function createBookingDraft(
  input: Pick<
    BookingDocument,
    'userId' | 'instructorId' | 'instructorName' | 'date' | 'time' | 'durationHours'
  > &
    Partial<Pick<BookingDocument, 'instructorAvatar' | 'difficulty' | 'notes'>>
): BookingDocument {
  return {
    ...input,
    instructorAvatar: input.instructorAvatar ?? '',
    difficulty: input.difficulty ?? 'beginner',
    totalPrice: 0,
    status: 'pending',
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

export function createUserProfileDefaults(
  input: Pick<UserProfileDocument, 'uid' | 'email' | 'displayName'>
): UserProfileDocument {
  return {
    ...input,
    role: 'user',
    avatarUrl: '',
    balanceUSD: 0,
  };
}
