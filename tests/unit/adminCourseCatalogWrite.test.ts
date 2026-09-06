import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  CourseCatalogContentInputSchema,
  CorrelationIdSchema,
  IdempotencyKeySchema,
  accountCommandActor,
  parseCommandEnvelope,
} from '@ski-academy/shared-domain';
import {
  catalogContentInputsEqual,
  compactCourseCatalogContentInput,
} from '../../src/features/admin/components/courses/adminCourseCatalogWrite';
import { catalogContentInputFromCourse } from '../../src/features/admin/components/courses/adminCourseTableMapping';
import {
  catalogContentInputFromCreateForm,
  type CanonicalCourseCreateFormState,
} from '../../src/features/admin/components/courses/adminCourseCloneDraft';

const stamp = { seconds: 1_800_000_000, nanoseconds: 0 };
const dayStart = { seconds: 1_790_128_800, nanoseconds: 0 };
const courseId = 'course_44347d3b4e8742df9d7a72f2d6f22c84';

/** Mirrors @firebase/functions encode: `undefined == null` → null. */
function firebaseEncode(data: unknown): unknown {
  if (data == null) return null;
  if (typeof data === 'number' && Number.isFinite(data)) return data;
  if (data === true || data === false) return data;
  if (Object.prototype.toString.call(data) === '[object String]') return data;
  if (Array.isArray(data)) return data.map((item) => firebaseEncode(item));
  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(data as object)) {
      result[key] = firebaseEncode((data as Record<string, unknown>)[key]);
    }
    return result;
  }
  throw new Error('Data cannot be encoded in JSON');
}

const richContent = {
  courseId,
  revision: 1,
  duration: '5 дней (20 ч.)',
  description: 'Learn to ski confidently from scratch.',
  dates: '2 - 6 Декабря 2026, 09:00 - 13:00',
  bgImageUrl: 'https://storage.yandexcloud.net/carve/courses/beginners.jpg',
  isHidden: false,
  order: 3,
  titleRu: 'BASE — Первые повороты',
  shortDescription: 'Short EN',
  shortDescriptionRu: 'Кратко RU',
  detailedDescription: 'Detailed EN',
  detailedDescriptionRu: 'Подробно RU',
  badge: '',
  badgeRu: '',
  level: 'beginner' as const,
  levelLabel: '',
  videoUrl: '',
  benefits: ['Benefit 1', 'Benefit 2'],
  benefitsRu: ['Плюс 1'],
  program: [{ day: 'Day 1', title: 'Intro', desc: 'Basics' }],
  programRu: [{ day: 'День 1', title: 'Ввод', desc: 'Основы' }],
  faq: [] as Array<{ q: string; a: string }>,
  faqRu: [] as Array<{ q: string; a: string }>,
  galleryPhotos: [] as string[],
};

const legacyTolerantContent = {
  courseId,
  revision: 1,
  duration: '3 days',
  description: 'Camp',
  dates: '1–3 Jan',
  bgImageUrl: 'https://example.com/c.png',
  isHidden: false,
  order: 2,
  badge: '',
  videoUrl: '',
  benefits: [],
  galleryPhotos: [],
  level: '' as const,
};

function detail(content: Record<string, unknown>) {
  return {
    courseId,
    title: 'BASE — First Turns',
    lifecycle: 'active' as const,
    price: 250_000,
    capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
    revision: 3,
    scheduleRevision: 1,
    instructorRosterIds: ['instructor_a'],
    instructors: [{ instructorId: 'instructor_a', name: 'Coach' }],
    courseDays: [
      {
        courseId,
        courseDayId: 'course_day_1',
        dayOrder: 1,
        interval: {
          startsAt: dayStart,
          endsAt: { seconds: dayStart.seconds + 14_400, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        actualInstructorIds: ['instructor_a'],
        revision: 1,
        createdAt: stamp,
        updatedAt: stamp,
        audit: {
          createdByCommandId: 'c',
          lastChangedByCommandId: 'c',
          correlationId: 'correlation_x',
        },
      },
    ],
    activeEnrollmentCount: 0,
    totalEnrollmentCount: 0,
    provisioning: { status: 'complete' as const, fingerprint: 'a'.repeat(64) },
    catalogContent: { status: 'present' as const, content },
    authorizedActions: [{ kind: 'update_course_catalog_content' as const, expectedRevision: 1 }],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function formFrom(course: ReturnType<typeof detail>): CanonicalCourseCreateFormState {
  const content = catalogContentInputFromCourse(course as never);
  return {
    title: course.title,
    titleRu: content.titleRu ?? '',
    price: String(course.price),
    totalSeats: String(course.capacity.totalSeats),
    timeZone: 'Asia/Almaty',
    roster: course.instructorRosterIds.join(','),
    days: '',
    duration: content.duration,
    description: content.description,
    dates: content.dates,
    bgImageUrl: content.bgImageUrl,
    isHidden: content.isHidden === true,
    order: content.order === undefined ? '' : String(content.order),
    shortDescription: content.shortDescription ?? '',
    shortDescriptionRu: content.shortDescriptionRu ?? '',
    detailedDescription: content.detailedDescription ?? '',
    detailedDescriptionRu: content.detailedDescriptionRu ?? '',
    badge: content.badge ?? '',
    badgeRu: content.badgeRu ?? '',
    level: (content.level ?? '') as CanonicalCourseCreateFormState['level'],
    levelLabel: content.levelLabel ?? '',
    videoUrl: content.videoUrl ?? '',
    benefits: content.benefits?.join('\n') ?? '',
    benefitsRu: content.benefitsRu?.join('\n') ?? '',
    program:
      content.program?.map((item) => `${item.day} | ${item.title} | ${item.desc}`).join('\n') ?? '',
    programRu:
      content.programRu?.map((item) => `${item.day} | ${item.title} | ${item.desc}`).join('\n') ??
      '',
    faq: content.faq?.map((item) => `${item.q} | ${item.a}`).join('\n') ?? '',
    faqRu: content.faqRu?.map((item) => `${item.q} | ${item.a}`).join('\n') ?? '',
    galleryPhotos: content.galleryPhotos?.join('\n') ?? '',
  };
}

function assertRealSchemaWrite(content: unknown) {
  const parsed = CourseCatalogContentInputSchema.safeParse(content);
  expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
  const encoded = firebaseEncode(content);
  const afterEncode = CourseCatalogContentInputSchema.safeParse(encoded);
  expect(afterEncode.success, JSON.stringify((afterEncode as { error?: unknown }).error)).toBe(
    true
  );
  const envelope = parseCommandEnvelope({
    kind: 'update_course_catalog_content',
    context: {
      actor: accountCommandActor(AccountIdSchema.parse('account_admin_01')),
      exercisedCapability: 'administrator',
      idempotencyKey: IdempotencyKeySchema.parse(
        'admin-course:update_course_catalog_content:schema01'
      ),
      correlationId: CorrelationIdSchema.parse('correlation_catalog_schema_01'),
      expectedRevision: 1,
      source: 'admin_callable',
      transportMetadata: { transport: 'firebase_callable' },
    },
    intent: {
      courseId,
      content,
      reasonExplanation: 'проверка',
    },
  });
  expect(envelope.success, JSON.stringify((envelope as { error?: unknown }).error)).toBe(true);
}

describe('admin course catalog strict write DTO', () => {
  it('D. rich untouched form normalizes equal and survives Firebase encode + real schema', () => {
    const course = detail(richContent);
    const original = catalogContentInputFromCourse(course as never);
    const fromForm = catalogContentInputFromCreateForm(formFrom(course));
    expect(catalogContentInputsEqual(original, fromForm)).toBe(true);
    expect(Object.values(fromForm).some((value) => value === undefined)).toBe(false);
    assertRealSchemaWrite(fromForm);
  });

  it('E. legacy empty arrays/strings open without malformed round-trip', () => {
    const course = detail(legacyTolerantContent);
    const original = catalogContentInputFromCourse(course as never);
    const fromForm = catalogContentInputFromCreateForm(formFrom(course));
    expect(catalogContentInputsEqual(original, fromForm)).toBe(true);
    expect(fromForm).not.toHaveProperty('benefits');
    expect(fromForm).not.toHaveProperty('badge');
    expect(fromForm).not.toHaveProperty('videoUrl');
    expect(fromForm).not.toHaveProperty('level');
    assertRealSchemaWrite(fromForm);
  });

  it('F. changing one supported presentation field yields a strict valid write DTO', () => {
    const course = detail(richContent);
    const form = formFrom(course);
    form.description = 'Changed description only';
    const content = catalogContentInputFromCreateForm(form);
    expect(catalogContentInputsEqual(content, catalogContentInputFromCourse(course as never))).toBe(
      false
    );
    expect(content.description).toBe('Changed description only');
    assertRealSchemaWrite(content);
  });

  it('compacts empty optional strings and arrays out of write payloads', () => {
    const compacted = compactCourseCatalogContentInput(
      CourseCatalogContentInputSchema.parse({
        duration: '2h',
        description: 'd',
        dates: '',
        bgImageUrl: 'https://example.com/x.png',
        isHidden: false,
        badge: '',
        videoUrl: '',
        benefits: [],
        faq: [],
        level: '',
      })
    );
    expect(compacted).toEqual({
      duration: '2h',
      description: 'd',
      dates: '',
      bgImageUrl: 'https://example.com/x.png',
    });
  });
});
