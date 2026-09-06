import {
  CourseCatalogContentInputSchema,
  type AdminCourseReadModel,
  type CourseCatalogContentInput,
} from '@ski-academy/shared-domain';
import { localDateTimeFromTimestamp } from '../../operations/adminTimeZone';
import { compactCourseCatalogContentInput } from './adminCourseCatalogWrite';
import { catalogContentInputFromCourse } from './adminCourseTableMapping';

export interface CanonicalCourseCreateFormState {
  title: string;
  titleRu: string;
  price: string;
  totalSeats: string;
  timeZone: string;
  roster: string;
  days: string;
  duration: string;
  description: string;
  dates: string;
  bgImageUrl: string;
  isHidden: boolean;
  order: string;
  shortDescription: string;
  shortDescriptionRu: string;
  detailedDescription: string;
  detailedDescriptionRu: string;
  badge: string;
  badgeRu: string;
  level: '' | 'beginner' | 'intermediate' | 'advanced' | 'expert';
  levelLabel: string;
  videoUrl: string;
  benefits: string;
  benefitsRu: string;
  program: string;
  programRu: string;
  faq: string;
  faqRu: string;
  galleryPhotos: string;
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

function lines(value: string): string[] | undefined {
  const items = value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function programLines(
  value: string
): Array<{ day: string; title: string; desc: string }> | undefined {
  const items = lines(value)?.map((line, index) => {
    const [day, title, ...description] = line.split('|').map((part) => part.trim());
    return {
      day: day || `Day ${index + 1}`,
      title: title ?? '',
      desc: description.join(' | '),
    };
  });
  return items && items.length > 0 ? items : undefined;
}

function faqLines(value: string): Array<{ q: string; a: string }> | undefined {
  const items = lines(value)?.map((line) => {
    const [question, ...answer] = line.split('|').map((part) => part.trim());
    return { q: question ?? '', a: answer.join(' | ') };
  });
  return items && items.length > 0 ? items : undefined;
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function catalogContentInputFromCreateForm(
  form: CanonicalCourseCreateFormState,
  _base: Partial<CourseCatalogContentInput> = {}
): CourseCatalogContentInput {
  const order = form.order.trim() === '' ? undefined : Number(form.order);
  const titleRu = optional(form.titleRu);
  const shortDescription = optional(form.shortDescription);
  const shortDescriptionRu = optional(form.shortDescriptionRu);
  const detailedDescription = optional(form.detailedDescription);
  const detailedDescriptionRu = optional(form.detailedDescriptionRu);
  const badge = optional(form.badge);
  const badgeRu = optional(form.badgeRu);
  const levelLabel = optional(form.levelLabel);
  const videoUrl = optional(form.videoUrl);
  const benefits = lines(form.benefits);
  const benefitsRu = lines(form.benefitsRu);
  const program = programLines(form.program);
  const programRu = programLines(form.programRu);
  const faq = faqLines(form.faq);
  const faqRu = faqLines(form.faqRu);
  const galleryPhotos = lines(form.galleryPhotos);
  // Form is the sole source of writable presentation fields. Never emit
  // enumerable `undefined` optional keys: Firebase callable encode treats
  // `undefined == null` and serializes them as `null`, which fails the
  // shared-domain CourseCatalogContentInputSchema on the server.
  void _base;
  return compactCourseCatalogContentInput(
    CourseCatalogContentInputSchema.parse({
      duration: form.duration,
      description: form.description,
      dates: form.dates,
      bgImageUrl: form.bgImageUrl,
      ...(form.isHidden ? { isHidden: true } : {}),
      ...(Number.isInteger(order) ? { order } : {}),
      ...(titleRu ? { titleRu } : {}),
      ...(shortDescription ? { shortDescription } : {}),
      ...(shortDescriptionRu ? { shortDescriptionRu } : {}),
      ...(detailedDescription ? { detailedDescription } : {}),
      ...(detailedDescriptionRu ? { detailedDescriptionRu } : {}),
      ...(badge ? { badge } : {}),
      ...(badgeRu ? { badgeRu } : {}),
      ...(form.level ? { level: form.level } : {}),
      ...(levelLabel ? { levelLabel } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(benefits ? { benefits } : {}),
      ...(benefitsRu ? { benefitsRu } : {}),
      ...(program ? { program } : {}),
      ...(programRu ? { programRu } : {}),
      ...(faq ? { faq } : {}),
      ...(faqRu ? { faqRu } : {}),
      ...(galleryPhotos ? { galleryPhotos } : {}),
    })
  );
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
  const presentation = compactCourseCatalogContentInput(
    CourseCatalogContentInputSchema.parse({
      ...basePresentation,
      ...(titleRu ? { titleRu } : {}),
    })
  );

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
      titleRu: presentation.titleRu ?? '',
      price: String(source.price),
      totalSeats: String(source.capacity.totalSeats),
      timeZone: source.courseDays[0]?.timeZone ?? 'Asia/Almaty',
      roster: source.instructorRosterIds.join(','),
      days: dayLines.join('\n'),
      duration: presentation.duration,
      description: presentation.description,
      dates: presentation.dates,
      bgImageUrl: presentation.bgImageUrl,
      isHidden: presentation.isHidden === true,
      order: presentation.order === undefined ? '' : String(presentation.order),
      shortDescription: presentation.shortDescription ?? '',
      shortDescriptionRu: presentation.shortDescriptionRu ?? '',
      detailedDescription: presentation.detailedDescription ?? '',
      detailedDescriptionRu: presentation.detailedDescriptionRu ?? '',
      badge: presentation.badge ?? '',
      badgeRu: presentation.badgeRu ?? '',
      level: presentation.level ?? '',
      levelLabel: presentation.levelLabel ?? '',
      videoUrl: presentation.videoUrl ?? '',
      benefits: presentation.benefits?.join('\n') ?? '',
      benefitsRu: presentation.benefitsRu?.join('\n') ?? '',
      program:
        presentation.program
          ?.map((item) => `${item.day} | ${item.title} | ${item.desc}`)
          .join('\n') ?? '',
      programRu:
        presentation.programRu
          ?.map((item) => `${item.day} | ${item.title} | ${item.desc}`)
          .join('\n') ?? '',
      faq: presentation.faq?.map((item) => `${item.q} | ${item.a}`).join('\n') ?? '',
      faqRu: presentation.faqRu?.map((item) => `${item.q} | ${item.a}`).join('\n') ?? '',
      galleryPhotos: presentation.galleryPhotos?.join('\n') ?? '',
    },
  };
}

export function mergeClonePresentationWithForm(
  draftPresentation: CourseCatalogContentInput,
  form: Pick<CanonicalCourseCreateFormState, 'duration' | 'description' | 'dates' | 'bgImageUrl'>
): CourseCatalogContentInput {
  return compactCourseCatalogContentInput(
    CourseCatalogContentInputSchema.parse({
      ...draftPresentation,
      duration: form.duration,
      description: form.description,
      dates: form.dates,
      bgImageUrl: form.bgImageUrl,
    })
  );
}
