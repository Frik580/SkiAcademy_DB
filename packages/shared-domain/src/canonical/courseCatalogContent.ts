import { z } from 'zod';
import { CourseIdSchema } from './identifiers';

const CourseProgramSchema = z.object({ day: z.string(), title: z.string(), desc: z.string() });
const CourseFaqSchema = z.object({ q: z.string(), a: z.string() });

/**
 * Presentation-only catalog fields for customer UI.
 * Operational course facts live on the canonical Course aggregate at `/courses/{courseId}`.
 */
export const CourseCatalogContentSchema = z
  .object({
    courseId: CourseIdSchema,
    duration: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000),
    dates: z.string().trim().max(500),
    bgImageUrl: z.string().trim().min(1).max(2_000),
    isHidden: z.boolean().optional(),
    order: z.number().finite().int().min(0).max(10_000).optional(),
    titleRu: z.string().trim().max(200).optional(),
    shortDescription: z.string().trim().max(2_000).optional(),
    shortDescriptionRu: z.string().trim().max(2_000).optional(),
    detailedDescription: z.string().trim().max(20_000).optional(),
    detailedDescriptionRu: z.string().trim().max(20_000).optional(),
    badge: z.string().trim().max(500).optional(),
    badgeRu: z.string().trim().max(500).optional(),
    level: z.enum(['beginner', 'intermediate', 'advanced', 'expert', '']).optional(),
    levelLabel: z.string().trim().max(200).optional(),
    videoUrl: z.string().trim().max(2_000).optional(),
    benefits: z.array(z.string().trim().min(1).max(500)).max(32).optional(),
    benefitsRu: z.array(z.string().trim().min(1).max(500)).max(32).optional(),
    program: z.array(CourseProgramSchema).max(64).optional(),
    programRu: z.array(CourseProgramSchema).max(64).optional(),
    faq: z.array(CourseFaqSchema).max(32).optional(),
    faqRu: z.array(CourseFaqSchema).max(32).optional(),
    galleryPhotos: z.array(z.string().trim().min(1).max(2_000)).max(32).optional(),
  })
  .strict();

export type CourseCatalogContent = Readonly<z.output<typeof CourseCatalogContentSchema>>;

export const CourseCatalogContentInputSchema = CourseCatalogContentSchema.omit({
  courseId: true,
}).strict();

export type CourseCatalogContentInput = Readonly<z.output<typeof CourseCatalogContentInputSchema>>;
