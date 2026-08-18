import { z } from 'zod';
import type { Booking, Course, UserProfile } from '../../types';

export type ValidationResult<T> = { success: true; data: T } | { success: false; reason: string };

const bookingSchema = z
  .object({
    userId: z.string(),
    instructorId: z.string(),
    instructorName: z.string(),
    instructorAvatar: z.string(),
    date: z.string(),
    time: z.string(),
    durationHours: z.number().finite().positive(),
    totalPrice: z.number().finite(),
    status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'pending_cancellation']),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'freeride', 'freestyle']),
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

const courseProgramSchema = z.object({ day: z.string(), title: z.string(), desc: z.string() });
const courseFaqSchema = z.object({ q: z.string(), a: z.string() });
const courseSchema = z
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
    program: z.array(courseProgramSchema).optional(),
    programRu: z.array(courseProgramSchema).optional(),
    faq: z.array(courseFaqSchema).optional(),
    faqRu: z.array(courseFaqSchema).optional(),
    galleryPhotos: z.array(z.string()).optional(),
  })
  .passthrough();

const userProfileSchema = z
  .object({
    uid: z.string(),
    email: z.string(),
    displayName: z.string(),
    phoneNumber: z.string().optional(),
    role: z.enum(['user', 'admin']),
    systemRole: z.literal('owner').optional(),
    avatarUrl: z.string(),
    balanceUSD: z.number().finite(),
    walletBalances: z.record(z.string(), z.number().finite()).optional(),
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

function toValidationResult<T>(result: z.ZodSafeParseResult<unknown>): ValidationResult<T> {
  if (result.success) return { success: true, data: result.data as T };
  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'document';
  return { success: false, reason: `${field}: ${issue?.message ?? 'invalid value'}` };
}

export const parseBooking = (fields: unknown, id: string): ValidationResult<Booking> => {
  const result = toValidationResult<Booking>(bookingSchema.safeParse(fields));
  return result.success ? { success: true, data: { ...result.data, id } } : result;
};

export const parseCourse = (fields: unknown, id: string): ValidationResult<Course> => {
  const result = toValidationResult<Course>(courseSchema.safeParse(fields));
  return result.success ? { success: true, data: { ...result.data, id } } : result;
};

export const parseUserProfile = (fields: unknown): ValidationResult<UserProfile> =>
  toValidationResult<UserProfile>(userProfileSchema.safeParse(fields));
