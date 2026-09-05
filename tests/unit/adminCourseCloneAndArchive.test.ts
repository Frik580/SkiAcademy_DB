import { describe, expect, it } from 'vitest';
import {
  AggregateRevisionSchema,
  CourseIdSchema,
  timestampFromDate,
  type AdminCourseListItem,
  type AdminCourseReadModel,
} from '@ski-academy/shared-domain';
import { buildArchiveCourseCommandFromListItem } from '../../src/features/admin/components/courses/adminCourseArchiveCommand';
import {
  buildCanonicalCourseCloneDraft,
  mergeClonePresentationWithForm,
} from '../../src/features/admin/components/courses/adminCourseCloneDraft';

const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const correlationId = 'correlation_admin_course_clone_01';

function compactListRow(overrides: Partial<AdminCourseListItem> = {}): AdminCourseListItem {
  return {
    courseId: CourseIdSchema.parse('course_v2_list_01'),
    title: 'Freeride Camp',
    lifecycle: 'active',
    price: 120_000,
    capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
    revision: AggregateRevisionSchema.parse(5),
    scheduleRevision: AggregateRevisionSchema.parse(2),
    instructorRosterIds: ['instructor_clone_01'],
    instructors: [{ instructorId: 'instructor_clone_01', name: 'Coach' }],
    catalogContent: { status: 'missing' },
    authorizedActions: [
      {
        kind: 'archive_course',
        expectedRevision: AggregateRevisionSchema.parse(5),
      },
    ],
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function detailCourse(overrides: Partial<AdminCourseReadModel> = {}): AdminCourseReadModel {
  return {
    ...compactListRow(),
    courseDays: [
      {
        courseId: CourseIdSchema.parse('course_v2_list_01'),
        courseDayId: 'course_day_v2_list_01',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
          endsAt: { seconds: 1_788_256_800, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        actualInstructorIds: ['instructor_clone_01'],
        revision: 1,
        createdAt,
        updatedAt: createdAt,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId,
        },
      },
    ],
    activeEnrollmentCount: 0,
    totalEnrollmentCount: 0,
    provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
    catalogContent: {
      status: 'present',
      content: {
        courseId: CourseIdSchema.parse('course_v2_list_01'),
        revision: 1,
        duration: '2h',
        description: 'Source description',
        dates: '1 Mar 2026',
        bgImageUrl: 'https://example.com/course.webp',
        titleRu: 'Фрирайд',
        order: 3,
      },
    },
    authorizedActions: [
      {
        kind: 'archive_course',
        expectedRevision: AggregateRevisionSchema.parse(5),
      },
    ],
    ...overrides,
  } as AdminCourseReadModel;
}

describe('adminCourseArchiveCommand', () => {
  it('builds archive_course from compact v2 list revision metadata', () => {
    const submission = buildArchiveCourseCommandFromListItem(compactListRow());
    expect(submission).toEqual({
      kind: 'archive_course',
      expectedRevision: 5,
      intent: {
        courseId: 'course_v2_list_01',
        reasonExplanation: 'Admin course archive',
      },
    });
  });

  it('prefers authorized archive expectedRevision when present', () => {
    const submission = buildArchiveCourseCommandFromListItem(
      compactListRow({
        revision: AggregateRevisionSchema.parse(9),
        authorizedActions: [
          {
            kind: 'archive_course',
            expectedRevision: AggregateRevisionSchema.parse(7),
          },
        ],
      })
    );
    expect(submission.expectedRevision).toBe(7);
  });

  it('rejects archive for non-active lifecycle', () => {
    expect(() =>
      buildArchiveCourseCommandFromListItem(
        compactListRow({
          lifecycle: 'archived',
          authorizedActions: [
            {
              kind: 'reactivate_course',
              expectedRevision: AggregateRevisionSchema.parse(5),
            },
          ],
        })
      )
    ).toThrow(/active Course/i);
  });
});

describe('adminCourseCloneDraft', () => {
  it('builds a client-only draft with copy title and source schedule lines', () => {
    const draft = buildCanonicalCourseCloneDraft(detailCourse());
    expect(draft.sourceCourseId).toBe('course_v2_list_01');
    expect(draft.form.title).toBe('Freeride Camp (copy)');
    expect(draft.presentation.titleRu).toBe('Фрирайд (копия)');
    expect(draft.form.roster).toBe('instructor_clone_01');
    expect(draft.form.totalSeats).toBe('8');
    expect(draft.form.price).toBe('120000');
    expect(draft.form.days.split('\n')).toHaveLength(1);
    expect(draft.form.days).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} 120 instructor_clone_01$/);
  });

  it('does not allocate course or courseDay identities in the draft', () => {
    const draft = buildCanonicalCourseCloneDraft(detailCourse());
    expect(draft.form.days).not.toContain('course_day_');
    expect(JSON.stringify(draft)).not.toContain('course_v2_list_01_clone');
  });

  it('merges edited form presentation over the draft catalog content', () => {
    const draft = buildCanonicalCourseCloneDraft(detailCourse());
    const merged = mergeClonePresentationWithForm(draft.presentation, {
      duration: '3h',
      description: 'Edited description',
      dates: '2 Mar 2026',
      bgImageUrl: 'https://example.com/edited.webp',
    });
    expect(merged.duration).toBe('3h');
    expect(merged.description).toBe('Edited description');
    expect(merged.titleRu).toBe('Фрирайд (копия)');
    expect(merged.order).toBe(3);
  });
});
