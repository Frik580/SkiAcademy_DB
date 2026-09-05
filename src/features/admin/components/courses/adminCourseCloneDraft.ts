import {
  CourseCatalogContentInputSchema,
  type AdminCourseReadModel,
  type CourseCatalogContentInput,
} from '@ski-academy/shared-domain';
import { localDateTimeFromTimestamp } from '../../operations/adminTimeZone';
import { catalogContentInputFromCourse } from './adminCourseTableMapping';

export interface CanonicalCourseCreateFormState {
  title: string;
  price: string;
  totalSeats: string;
  timeZone: string;
  roster: string;
  days: string;
  duration: string;
  description: string;
  dates: string;
  bgImageUrl: string;
}

export interface CanonicalCourseCloneDraft {
  readonly form: CanonicalCourseCreateFormState;
  readonly presentation: CourseCatalogContentInput;
  readonly sourceCourseId: string;
}

function withCopyTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.endsWith('(copy)') ? trimmed : `${trimmed} (copy)`.trim();
}

function withCopyTitleRu(titleRu: string | undefined): string | undefined {
  if (!titleRu?.trim()) return undefined;
  const trimmed = titleRu.trim();
  return trimmed.endsWith('(копия)') ? trimmed : `${trimmed} (копия)`.trim();
}

function formatCourseDayLine(day: AdminCourseReadModel['courseDays'][number]): string | undefined {
  const instructorId = day.actualInstructorIds[0];
  if (!instructorId) return undefined;
  const local = localDateTimeFromTimestamp(day.interval.startsAt.seconds, day.timeZone);
  const durationMinutes = Math.max(
    15,
    Math.round((day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60)
  );
  return `${local.date} ${local.time} ${durationMinutes} ${instructorId}`;
}

/**
 * Client-only clone draft from authoritative Course detail.
 * Does not allocate course/courseDay identities or submit provisioning.
 */
export function buildCanonicalCourseCloneDraft(
  source: AdminCourseReadModel
): CanonicalCourseCloneDraft {
  if (source.courseDays.length === 0) {
    throw new Error('Clone requires at least one CourseDay on the source Course.');
  }

  const basePresentation = catalogContentInputFromCourse(source);
  const titleRu = withCopyTitleRu(basePresentation.titleRu);
  const presentation = CourseCatalogContentInputSchema.parse({
    ...basePresentation,
    ...(titleRu ? { titleRu } : {}),
  });

  const dayLines = [...source.courseDays]
    .sort((left, right) => left.dayOrder - right.dayOrder)
    .map(formatCourseDayLine)
    .filter((line): line is string => Boolean(line));

  if (dayLines.length === 0) {
    throw new Error('Clone requires CourseDay instructor assignments.');
  }

  return {
    sourceCourseId: source.courseId,
    presentation,
    form: {
      title: withCopyTitle(source.title),
      price: String(source.price),
      totalSeats: String(source.capacity.totalSeats),
      timeZone: source.courseDays[0]?.timeZone ?? 'Asia/Almaty',
      roster: source.instructorRosterIds.join(','),
      days: dayLines.join('\n'),
      duration: presentation.duration,
      description: presentation.description,
      dates: presentation.dates,
      bgImageUrl: presentation.bgImageUrl,
    },
  };
}

export function mergeClonePresentationWithForm(
  draftPresentation: CourseCatalogContentInput,
  form: Pick<CanonicalCourseCreateFormState, 'duration' | 'description' | 'dates' | 'bgImageUrl'>
): CourseCatalogContentInput {
  return CourseCatalogContentInputSchema.parse({
    ...draftPresentation,
    duration: form.duration,
    description: form.description,
    dates: form.dates,
    bgImageUrl: form.bgImageUrl,
  });
}
