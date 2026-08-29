import { CourseCatalogContentSchema } from '@ski-academy/shared-domain';
import { CourseDocumentSchema } from '@ski-academy/shared-domain/entities';
import type { Course } from '../../types';

const DEFAULT_COURSE_IMAGE =
  'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800';

function parseCanonicalAggregateFields(fields: Record<string, unknown>): {
  title: string;
  price: number;
  totalSeats: number;
  availableSeats: number;
} | null {
  const title = typeof fields.title === 'string' ? fields.title.trim() : '';
  const price = typeof fields.price === 'number' ? fields.price : undefined;
  const capacity =
    fields.capacity && typeof fields.capacity === 'object'
      ? (fields.capacity as Record<string, unknown>)
      : undefined;
  const totalSeats = typeof capacity?.totalSeats === 'number' ? capacity.totalSeats : undefined;
  const availableSeats =
    typeof capacity?.availableSeats === 'number' ? capacity.availableSeats : undefined;
  if (!title || price === undefined || totalSeats === undefined || availableSeats === undefined) {
    return null;
  }
  return { title, price, totalSeats, availableSeats };
}

export function buildCourseFromCanonicalAggregateAndContent(
  id: string,
  aggregate: Record<string, unknown>,
  content?: Record<string, unknown> | null
): Course | null {
  const canonical = parseCanonicalAggregateFields(aggregate);
  if (!canonical) {
    return null;
  }

  const contentFields = content ?? {};
  const parsedContent = CourseCatalogContentSchema.safeParse({ courseId: id, ...contentFields });
  const catalog = parsedContent.success ? parsedContent.data : null;

  return {
    id,
    title: canonical.title,
    titleRu: catalog?.titleRu,
    duration: catalog?.duration ?? '',
    description: catalog?.description ?? canonical.title,
    dates: catalog?.dates ?? '',
    totalSeats: canonical.totalSeats,
    availableSeats: canonical.availableSeats,
    price: canonical.price,
    priceKZT: canonical.price,
    bgImageUrl: catalog?.bgImageUrl ?? DEFAULT_COURSE_IMAGE,
    isHidden: catalog?.isHidden,
    order: catalog?.order,
    shortDescription: catalog?.shortDescription,
    shortDescriptionRu: catalog?.shortDescriptionRu,
    detailedDescription: catalog?.detailedDescription,
    detailedDescriptionRu: catalog?.detailedDescriptionRu,
    badge: catalog?.badge,
    badgeRu: catalog?.badgeRu,
    level: catalog?.level,
    levelLabel: catalog?.levelLabel,
    videoUrl: catalog?.videoUrl,
    benefits: catalog?.benefits,
    benefitsRu: catalog?.benefitsRu,
    program: catalog?.program,
    programRu: catalog?.programRu,
    faq: catalog?.faq,
    faqRu: catalog?.faqRu,
    galleryPhotos: catalog?.galleryPhotos,
  };
}

export function resolveCourseDocument(
  id: string,
  aggregate: Record<string, unknown>,
  catalogContent?: Record<string, unknown> | null
): Course | null {
  const legacy = CourseDocumentSchema.safeParse(aggregate);
  if (legacy.success) {
    return { ...legacy.data, id };
  }
  return buildCourseFromCanonicalAggregateAndContent(id, aggregate, catalogContent);
}

export function isLegacyCourseDocument(fields: Record<string, unknown>): boolean {
  return CourseDocumentSchema.safeParse(fields).success;
}
