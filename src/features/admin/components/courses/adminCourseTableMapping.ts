import {
  CourseCatalogContentInputSchema,
  type AdminCourseEnrollmentRosterItem,
  type AdminCourseReadModel,
  type CourseCatalogContentInput,
} from '@ski-academy/shared-domain';
import type { Course } from '../../../../types';
import { localDateTimeFromTimestamp } from '../../operations/adminTimeZone';

const ACTIVE_ENROLLMENT_STATUSES = new Set([
  'pending',
  'confirmed',
  'pending_cancellation',
  'completed',
  'no_show',
]);

export function mapAdminCourseToTableCourse(course: AdminCourseReadModel): Course {
  const content = course.catalogContent.content;
  const first = course.courseDays[0];
  const last = course.courseDays[course.courseDays.length - 1];
  const fallbackDuration = first
    ? `${Math.max(1, Math.round((first.interval.endsAt.seconds - first.interval.startsAt.seconds) / 3600))}h`
    : '—';
  const fallbackDates =
    first && last
      ? `${localDateTimeFromTimestamp(first.interval.startsAt.seconds, first.timeZone).date} – ${localDateTimeFromTimestamp(last.interval.startsAt.seconds, last.timeZone).date}`
      : '';
  return {
    id: course.courseId,
    title: content?.titleRu && content.titleRu.trim() ? course.title : course.title,
    titleRu: content?.titleRu,
    duration: content?.duration || fallbackDuration,
    description: content?.description || course.title,
    dates: content?.dates || fallbackDates,
    totalSeats: course.capacity.totalSeats,
    availableSeats: course.capacity.availableSeats,
    price: 0,
    priceKZT: course.price,
    bgImageUrl: content?.bgImageUrl || '',
    isHidden: content?.isHidden === true || course.lifecycle === 'archived',
    instructorIds: [...course.instructorRosterIds],
    order: content?.order,
    shortDescription: content?.shortDescription,
    shortDescriptionRu: content?.shortDescriptionRu,
    detailedDescription: content?.detailedDescription,
    detailedDescriptionRu: content?.detailedDescriptionRu,
    badge: content?.badge,
    badgeRu: content?.badgeRu,
    level: content?.level,
    levelLabel: content?.levelLabel,
    videoUrl: content?.videoUrl,
    benefits: content?.benefits ? [...content.benefits] : undefined,
    benefitsRu: content?.benefitsRu ? [...content.benefitsRu] : undefined,
    program: content?.program ? content.program.map((item) => ({ ...item })) : undefined,
    programRu: content?.programRu ? content.programRu.map((item) => ({ ...item })) : undefined,
    faq: content?.faq ? content.faq.map((item) => ({ ...item })) : undefined,
    faqRu: content?.faqRu ? content.faqRu.map((item) => ({ ...item })) : undefined,
    galleryPhotos: content?.galleryPhotos ? [...content.galleryPhotos] : undefined,
  };
}

export function catalogContentInputFromCourse(
  course: AdminCourseReadModel
): CourseCatalogContentInput {
  const mapped = mapAdminCourseToTableCourse(course);
  const content = course.catalogContent.content;
  return CourseCatalogContentInputSchema.parse({
    duration: mapped.duration,
    description: mapped.description,
    dates: mapped.dates,
    bgImageUrl: mapped.bgImageUrl || 'https://placehold.co/80x80/png?text=Course',
    ...(mapped.isHidden !== undefined ? { isHidden: mapped.isHidden } : {}),
    ...(mapped.order !== undefined ? { order: mapped.order } : {}),
    ...(mapped.titleRu ? { titleRu: mapped.titleRu } : {}),
    ...(mapped.shortDescription ? { shortDescription: mapped.shortDescription } : {}),
    ...(mapped.shortDescriptionRu ? { shortDescriptionRu: mapped.shortDescriptionRu } : {}),
    ...(mapped.detailedDescription ? { detailedDescription: mapped.detailedDescription } : {}),
    ...(mapped.detailedDescriptionRu
      ? { detailedDescriptionRu: mapped.detailedDescriptionRu }
      : {}),
    ...(mapped.badge ? { badge: mapped.badge } : {}),
    ...(mapped.badgeRu ? { badgeRu: mapped.badgeRu } : {}),
    ...(mapped.level ? { level: mapped.level } : {}),
    ...(mapped.levelLabel ? { levelLabel: mapped.levelLabel } : {}),
    ...(mapped.videoUrl ? { videoUrl: mapped.videoUrl } : {}),
    ...(mapped.benefits ? { benefits: mapped.benefits } : {}),
    ...(mapped.benefitsRu ? { benefitsRu: mapped.benefitsRu } : {}),
    ...(mapped.program ? { program: mapped.program } : {}),
    ...(mapped.programRu ? { programRu: mapped.programRu } : {}),
    ...(mapped.faq ? { faq: mapped.faq } : {}),
    ...(mapped.faqRu ? { faqRu: mapped.faqRu } : {}),
    ...(mapped.galleryPhotos ? { galleryPhotos: mapped.galleryPhotos } : {}),
    ...(content && 'isHidden' in content && mapped.isHidden === undefined
      ? { isHidden: content.isHidden }
      : {}),
  });
}

export function enrolledNamesByCourseId(
  roster: readonly AdminCourseEnrollmentRosterItem[]
): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const item of roster) {
    if (!ACTIVE_ENROLLMENT_STATUSES.has(item.lifecycleStatus)) continue;
    const current = names.get(item.course.courseId) ?? [];
    current.push(item.participant.displayName);
    names.set(item.course.courseId, current);
  }
  return names;
}
