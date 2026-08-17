import { Course } from '../../types';

/** Firestore rejects documents containing undefined field values. */
export function stripUndefinedFields<T extends Record<string, unknown>>(data: T): T {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) as T;
}

/** Build a new course document from an existing one (no client bookings are copied). */
export function buildClonedCourse(source: Course, order: number): Course {
  const cloned: Course = {
    id: `course_${Date.now()}`,
    title: `${source.title} (copy)`.trim(),
    duration: source.duration,
    description: source.description ?? '',
    dates: source.dates,
    totalSeats: source.totalSeats,
    availableSeats: source.totalSeats,
    price: source.price,
    bgImageUrl: source.bgImageUrl,
    isHidden: source.isHidden ?? false,
    order,
  };

  if (source.titleRu?.trim()) {
    cloned.titleRu = `${source.titleRu} (копия)`.trim();
  }
  if (source.instructorIds?.length) {
    cloned.instructorIds = [...source.instructorIds];
  }
  if (source.shortDescription) cloned.shortDescription = source.shortDescription;
  if (source.shortDescriptionRu) cloned.shortDescriptionRu = source.shortDescriptionRu;
  if (source.detailedDescription) cloned.detailedDescription = source.detailedDescription;
  if (source.detailedDescriptionRu) cloned.detailedDescriptionRu = source.detailedDescriptionRu;
  if (source.badge) cloned.badge = source.badge;
  if (source.badgeRu) cloned.badgeRu = source.badgeRu;
  if (source.level) cloned.level = source.level;
  if (source.videoUrl?.trim()) cloned.videoUrl = source.videoUrl.trim();
  if (source.benefits?.length) cloned.benefits = [...source.benefits];
  if (source.benefitsRu?.length) cloned.benefitsRu = [...source.benefitsRu];
  if (source.program?.length) cloned.program = source.program.map((day) => ({ ...day }));
  if (source.programRu?.length) cloned.programRu = source.programRu.map((day) => ({ ...day }));
  if (source.faq?.length) cloned.faq = source.faq.map((item) => ({ ...item }));
  if (source.faqRu?.length) cloned.faqRu = source.faqRu.map((item) => ({ ...item }));
  if (source.galleryPhotos?.length) cloned.galleryPhotos = [...source.galleryPhotos];

  return stripUndefinedFields(cloned as unknown as Record<string, unknown>) as unknown as Course;
}
