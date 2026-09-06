import {
  CourseCatalogContentInputSchema,
  type AdminCourseEnrollmentRosterItem,
  type AdminCourseListItem,
  type AdminCourseReadModel,
  type CourseCatalogContentInput,
} from '@ski-academy/shared-domain';
import type { Course } from '../../../../types';
import { localDateTimeFromTimestamp } from '../../operations/adminTimeZone';
import { compactCourseCatalogContentInput } from './adminCourseCatalogWrite';

const ACTIVE_ENROLLMENT_STATUSES = new Set([
  'pending',
  'confirmed',
  'pending_cancellation',
  'completed',
  'no_show',
]);

type AdminCourseCatalogRow = AdminCourseListItem | AdminCourseReadModel;

type AdminCourseDayLike = {
  readonly dayOrder: number;
  readonly timeZone: string;
  readonly interval: {
    readonly startsAt: { readonly seconds: number };
    readonly endsAt: { readonly seconds: number };
  };
};

function formatAdminListDateFromIsoLocal(isoLocalDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoLocalDate);
  if (!match) return isoLocalDate;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/**
 * Format one CourseDay local calendar date as DD.MM.YYYY without UTC reinterpretation.
 * Uses the CourseDay timezone + startsAt seconds only.
 */
export function formatAdminCourseDayLocalDate(day: AdminCourseDayLike): string {
  return formatAdminListDateFromIsoLocal(
    localDateTimeFromTimestamp(day.interval.startsAt.seconds, day.timeZone).date
  );
}

/**
 * Admin list/detail date summary: chronological first→last CourseDay local dates.
 * Historical Admin UX used a freeform range string; single day collapses to one value.
 * Never uses catalogContent.dates — that field is presentation-only and can be stale.
 */
export function formatAdminCourseDaysScheduleDates(
  courseDays: readonly AdminCourseDayLike[]
): string {
  if (courseDays.length === 0) return '';
  const ordered = [...courseDays].sort((left, right) => left.dayOrder - right.dayOrder);
  const first = formatAdminCourseDayLocalDate(ordered[0]!);
  const last = formatAdminCourseDayLocalDate(ordered[ordered.length - 1]!);
  return first === last ? first : `${first} – ${last}`;
}

/**
 * Admin list date column: operational scheduleSummary first/last day.
 * Historical table used a freeform dates string; when scheduleSummary is present
 * prefer first→last local calendar dates (single day collapses to one value).
 */
export function formatAdminCourseScheduleSummaryDates(
  scheduleSummary: NonNullable<AdminCourseCatalogRow['scheduleSummary']>
): string {
  const first = formatAdminListDateFromIsoLocal(
    localDateTimeFromTimestamp(scheduleSummary.startsAt.seconds, scheduleSummary.timeZone).date
  );
  const last = formatAdminListDateFromIsoLocal(
    localDateTimeFromTimestamp(scheduleSummary.lastDayStartsAt.seconds, scheduleSummary.timeZone)
      .date
  );
  return first === last ? first : `${first} – ${last}`;
}

export function mapAdminCourseToTableCourse(course: AdminCourseCatalogRow): Course {
  const content = course.catalogContent.content;
  const scheduleSummary = course.scheduleSummary;
  const courseDays = course.courseDays ?? [];
  const fallbackDuration = scheduleSummary
    ? `${Math.max(1, Math.round((scheduleSummary.firstDayEndsAt.seconds - scheduleSummary.startsAt.seconds) / 3600))}h`
    : courseDays[0]
      ? `${Math.max(1, Math.round((courseDays[0].interval.endsAt.seconds - courseDays[0].interval.startsAt.seconds) / 3600))}h`
      : '—';
  // Operational authority: scheduleSummary (list) → courseDays (detail) → catalog last.
  const scheduleDates = scheduleSummary
    ? formatAdminCourseScheduleSummaryDates(scheduleSummary)
    : formatAdminCourseDaysScheduleDates(courseDays);
  return {
    id: course.courseId,
    title: content?.titleRu && content.titleRu.trim() ? course.title : course.title,
    titleRu: content?.titleRu,
    duration: content?.duration || fallbackDuration,
    description: content?.description || course.title,
    // Prefer operational schedule over catalog presentation dates (stale on clones).
    dates: scheduleDates || content?.dates || '',
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
  course: AdminCourseCatalogRow
): CourseCatalogContentInput {
  const mapped = mapAdminCourseToTableCourse(course);
  const content = course.catalogContent.content;
  // Build from supported presentation fields only, then compact to the strict
  // write shape (empty optional strings/arrays omitted). Do not round-trip raw
  // legacy keys that are absent from CourseCatalogContentInputSchema.
  return compactCourseCatalogContentInput(
    CourseCatalogContentInputSchema.parse({
      duration: mapped.duration,
      description: mapped.description,
      // Catalog write-back keeps presentation dates; list display uses scheduleSummary.
      dates: content?.dates || mapped.dates,
      bgImageUrl: mapped.bgImageUrl || 'https://placehold.co/80x80/png?text=Course',
      ...(mapped.isHidden === true ? { isHidden: true } : {}),
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
      ...(mapped.benefits && mapped.benefits.length > 0 ? { benefits: mapped.benefits } : {}),
      ...(mapped.benefitsRu && mapped.benefitsRu.length > 0
        ? { benefitsRu: mapped.benefitsRu }
        : {}),
      ...(mapped.program && mapped.program.length > 0 ? { program: mapped.program } : {}),
      ...(mapped.programRu && mapped.programRu.length > 0 ? { programRu: mapped.programRu } : {}),
      ...(mapped.faq && mapped.faq.length > 0 ? { faq: mapped.faq } : {}),
      ...(mapped.faqRu && mapped.faqRu.length > 0 ? { faqRu: mapped.faqRu } : {}),
      ...(mapped.galleryPhotos && mapped.galleryPhotos.length > 0
        ? { galleryPhotos: mapped.galleryPhotos }
        : {}),
    })
  );
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
