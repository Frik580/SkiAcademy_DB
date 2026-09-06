import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationKey } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { CoursesManager } from '../../src/features/admin';

const queryAdminCourseReadModels = vi.fn();
const queryAdminIdentityReadModels = vi.fn();
const queryAdminCourseEnrollmentReadModels = vi.fn();
const executeAuthenticatedCanonicalCommand = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/providers/LanguageContext')>();
  return {
    ...actual,
    useLanguage: () => ({
      t: (key: TranslationKey) => translations.en[key] ?? key,
      language: 'en' as const,
    }),
  };
});

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminCourseReadModels: (...args: unknown[]) => queryAdminCourseReadModels(...args),
  queryAdminIdentityReadModels: (...args: unknown[]) => queryAdminIdentityReadModels(...args),
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) =>
    queryAdminCourseEnrollmentReadModels(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
}));

vi.mock('../../src/features/admin/components/courses/CourseBackgroundImageField', () => ({
  CourseBackgroundImageField: ({ onChange }: { onChange: (value: string) => void }) => (
    <div>
      <button type="button" onClick={() => onChange('https://example.com/uploaded.webp')}>
        Finish image upload
      </button>
      <button type="button">Fail image upload</button>
    </div>
  ),
}));

const courseId = 'course_structured_edit_01';
const instructorA = 'instructor_structured_a';
const instructorB = 'instructor_structured_b';
const dayId = 'course_day_structured_01';
const stamp = { seconds: 1_800_000_000, nanoseconds: 0 };
const dayStart = { seconds: 1_790_128_800, nanoseconds: 0 };

function actions(revision: number) {
  return [
    'change_course_title',
    'change_course_price',
    'change_course_capacity',
    'add_course_roster_instructor',
    'remove_course_roster_instructor',
    'update_course_catalog_content',
    'create_course_day',
    'reassign_course_day_instructor',
    'reschedule_course_day',
    'remove_course_day',
    'archive_course',
  ].map((kind) => ({ kind, expectedRevision: revision }));
}

function detail(revision = 7) {
  return {
    courseId,
    title: 'Course A',
    lifecycle: 'active',
    price: 10_000,
    capacity: { totalSeats: 10, availableSeats: 10, occupiedConfirmedSeats: 0 },
    revision,
    scheduleRevision: 1,
    instructorRosterIds: [instructorA, instructorB],
    instructors: [
      { instructorId: instructorA, name: 'Active Coach', isAvailable: true },
      { instructorId: instructorB, name: 'Inactive Coach', isAvailable: false },
    ],
    courseDays: [
      {
        courseId,
        courseDayId: dayId,
        dayOrder: 1,
        interval: {
          startsAt: dayStart,
          endsAt: { seconds: dayStart.seconds + 7_200, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        actualInstructorIds: [instructorA],
        revision: 3,
        createdAt: stamp,
        updatedAt: stamp,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId: 'correlation_structured_edit_01',
        },
      },
    ],
    activeEnrollmentCount: 0,
    totalEnrollmentCount: 0,
    provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
    catalogContent: {
      status: 'present',
      content: {
        courseId,
        revision: 2,
        duration: '5 дней (20 ч.)',
        description: 'Original description',
        dates: '2 - 6 Декабря 2026, 09:00 - 13:00',
        bgImageUrl: 'https://example.com/original.webp',
        isHidden: false,
        order: 3,
        titleRu: 'Курс A',
        shortDescription: 'Short EN',
        shortDescriptionRu: 'Кратко RU',
        detailedDescription: 'Detailed EN',
        detailedDescriptionRu: 'Подробно RU',
        badge: '',
        badgeRu: '',
        level: 'beginner',
        levelLabel: '',
        videoUrl: '',
        benefits: ['Benefit 1', 'Benefit 2'],
        benefitsRu: ['Плюс 1'],
        program: [{ day: 'Day 1', title: 'Intro', desc: 'Basics' }],
        programRu: [{ day: 'День 1', title: 'Ввод', desc: 'Основы' }],
        faq: [],
        faqRu: [],
        galleryPhotos: [],
      },
    },
    authorizedActions: actions(revision),
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function listItem() {
  const item = detail();
  const {
    courseDays: _days,
    activeEnrollmentCount: _active,
    totalEnrollmentCount: _total,
    provisioning: _provisioning,
    ...list
  } = item;
  return list;
}

const onRequestConfirm = vi.fn((_message: string, onConfirm: () => void | Promise<void>) => {
  void onConfirm();
});

async function openEdit() {
  render(
    <CoursesManager
      currentAccountId="account_structured_edit_01"
      onRequestConfirm={onRequestConfirm}
    />
  );
  await screen.findAllByText('Course A');
  await userEvent.click(screen.getByRole('button', { name: 'Edit course' }));
  await screen.findByRole('button', { name: 'Save changes' });
}

function editForm() {
  return screen.getByRole('button', { name: 'Save changes' }).closest('form')!;
}

function commandSubmissions() {
  return executeAuthenticatedCanonicalCommand.mock.calls.map((call) => call[1]);
}

describe('CanonicalCoursesManager structured edit regressions', () => {
  let authoritative = detail();

  beforeEach(() => {
    vi.clearAllMocks();
    authoritative = detail();
    queryAdminCourseReadModels.mockImplementation(async (input: { scope: string }) =>
      input.scope === 'admin_course_detail'
        ? { scope: 'admin_course_detail', item: authoritative }
        : { scope: 'admin_course_list', items: [listItem()] }
    );
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_instructor_list',
      items: [
        {
          instructorId: instructorA,
          name: 'Active Coach',
          specialty: 'ski',
          isAvailable: true,
          revision: 1,
          authorizedActions: [],
        },
        {
          instructorId: instructorB,
          name: 'Inactive Coach',
          specialty: 'snowboard',
          isAvailable: false,
          revision: 1,
          authorizedActions: [],
        },
      ],
      hasMore: false,
    });
    executeAuthenticatedCanonicalCommand.mockImplementation(async (_accountId, submission) => {
      authoritative = {
        ...authoritative,
        ...(submission.kind === 'change_course_title'
          ? { title: submission.intent.title }
          : submission.kind === 'change_course_price'
            ? { price: submission.intent.price }
            : submission.kind === 'change_course_capacity'
              ? {
                  capacity: {
                    ...authoritative.capacity,
                    totalSeats: submission.intent.totalSeats,
                    availableSeats: submission.intent.totalSeats,
                  },
                }
              : {}),
        revision: authoritative.revision + 1,
        authorizedActions: actions(authoritative.revision + 1),
      };
      return {
        status: 'success',
        kind: submission.kind,
        correlationId: 'correlation_structured_success',
      };
    });
  });

  it.each([
    ['title', 'Title', 'Course B', 'change_course_title'],
    ['price', 'Price (KZT)', '15000', 'change_course_price'],
    ['presentation', 'Description', 'Changed description', 'update_course_catalog_content'],
  ])('sends only the changed %s command', async (_caseName, label, value, expectedKind) => {
    await openEdit();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Regression test' },
    });
    fireEvent.submit(editForm());

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(commandSubmissions().map((submission) => submission.kind)).toEqual([expectedKind]);
  });

  it('keeps Description only inside Presentation / Catalog, not in Course core fields', async () => {
    await openEdit();
    const description = screen.getByLabelText('Description');
    const presentation = screen.getByText('Presentation / catalog').closest('details');
    expect(presentation).toBeTruthy();
    expect(presentation).toContainElement(description);
    expect(screen.getByLabelText('Title').closest('details')).toBeNull();
    expect(screen.getByLabelText('Price (KZT)').closest('details')).toBeNull();
    expect(screen.getByLabelText('Capacity').closest('details')).toBeNull();
  });

  it('shows Подробнее schedule dates from CourseDays, not stale catalogContent.dates', async () => {
    const dayAStart = {
      seconds: Math.floor(Date.parse('2026-09-20T05:00:00.000Z') / 1000),
      nanoseconds: 0,
    };
    const dayBStart = {
      seconds: Math.floor(Date.parse('2026-09-22T05:00:00.000Z') / 1000),
      nanoseconds: 0,
    };
    authoritative = {
      ...detail(),
      catalogContent: {
        status: 'present',
        content: {
          ...detail().catalogContent.content!,
          dates: '01.09.2026 – 05.09.2026',
        },
      },
      courseDays: [
        {
          ...detail().courseDays[0]!,
          courseDayId: `${dayId}_a`,
          dayOrder: 1,
          interval: {
            startsAt: dayAStart,
            endsAt: { seconds: dayAStart.seconds + 7_200, nanoseconds: 0 },
          },
        },
        {
          ...detail().courseDays[0]!,
          courseDayId: `${dayId}_b`,
          dayOrder: 2,
          interval: {
            startsAt: dayBStart,
            endsAt: { seconds: dayBStart.seconds + 7_200, nanoseconds: 0 },
          },
        },
      ],
    };

    await openEdit();
    const detailDates = screen.getByTestId('admin-course-detail-dates');
    expect(detailDates).toHaveTextContent('20.09.2026 – 22.09.2026');
    expect(detailDates).not.toHaveTextContent('01.09.2026');
    expect(screen.getByText('20.09.2026')).toBeInTheDocument();
    expect(screen.getByText('22.09.2026')).toBeInTheDocument();
  });

  it('A. title-only change with rich catalog sends exactly change_course_title', async () => {
    await openEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Course B' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'проверка' },
    });
    fireEvent.submit(editForm());

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(commandSubmissions().map((submission) => submission.kind)).toEqual([
      'change_course_title',
    ]);
    expect(commandSubmissions()[0].intent).toMatchObject({
      courseId,
      title: 'Course B',
      reasonExplanation: 'проверка',
    });
  });

  it('B. no-op Edit with rich catalog sends zero mutations', async () => {
    await openEdit();
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'No-op verification' },
    });
    fireEvent.submit(editForm());
    await waitFor(() => expect(screen.getByLabelText('Reason for change')).toHaveValue(''));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('C/D. genuine presentation edit sends one catalog command that matches real schema', async () => {
    const {
      CourseCatalogContentInputSchema,
      parseCommandEnvelope,
      AccountIdSchema,
      accountCommandActor,
      IdempotencyKeySchema,
      CorrelationIdSchema,
    } = await import('@ski-academy/shared-domain');
    await openEdit();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Changed description' },
    });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Presentation edit' },
    });
    fireEvent.submit(editForm());

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    const submission = commandSubmissions()[0];
    expect(submission.kind).toBe('update_course_catalog_content');
    expect(CourseCatalogContentInputSchema.safeParse(submission.intent.content).success).toBe(true);
    expect(Object.values(submission.intent.content).some((value) => value === undefined)).toBe(
      false
    );
    expect(submission.intent.content).not.toHaveProperty('faq');
    expect(submission.intent.content).not.toHaveProperty('galleryPhotos');
    expect(submission.intent.content).not.toHaveProperty('badge');
    const envelope = parseCommandEnvelope({
      kind: 'update_course_catalog_content',
      context: {
        actor: accountCommandActor(AccountIdSchema.parse('account_structured_edit_01')),
        exercisedCapability: 'administrator',
        idempotencyKey: IdempotencyKeySchema.parse(
          'admin-course:update_course_catalog_content:structured01'
        ),
        correlationId: CorrelationIdSchema.parse('correlation_structured_schema_01'),
        expectedRevision: submission.expectedRevision,
        source: 'admin_callable',
        transportMetadata: { transport: 'firebase_callable' },
      },
      intent: submission.intent,
    });
    expect(envelope.success).toBe(true);
  });

  it('G. title success + catalog failure keeps persisted title and does not claim full success', async () => {
    executeAuthenticatedCanonicalCommand.mockImplementation(async (_accountId, submission) => {
      if (submission.kind === 'change_course_title') {
        authoritative = {
          ...authoritative,
          title: submission.intent.title,
          revision: authoritative.revision + 1,
          authorizedActions: actions(authoritative.revision + 1),
        };
        return {
          status: 'success',
          kind: submission.kind,
          correlationId: 'correlation_partial_title',
        };
      }
      return {
        status: 'error',
        kind: submission.kind,
        correlationId: 'correlation_partial_catalog',
        error: { code: 'validation', details: { reason: 'malformed' } },
      };
    });

    await openEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Course B' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Changed description' },
    });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Partial catalog failure' },
    });
    fireEvent.submit(editForm());

    await screen.findByText(/Check the entered values and Course state/i);
    expect(commandSubmissions().map((submission) => submission.kind)).toEqual([
      'change_course_title',
      'update_course_catalog_content',
    ]);
    expect(screen.getByLabelText('Title')).toHaveValue('Course B');
    expect(screen.getByLabelText('Reason for change')).toHaveValue('Partial catalog failure');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(authoritative.title).toBe('Course B');
  });

  it('sends zero commands when the authoritative form is unchanged', async () => {
    await openEdit();
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'No-op verification' },
    });
    fireEvent.submit(editForm());
    await waitFor(() => expect(screen.getByLabelText('Reason for change')).toHaveValue(''));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('uses the current command order and authoritative revision after every successful command', async () => {
    await openEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Course B' } });
    fireEvent.change(screen.getByLabelText('Price (KZT)'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Changed description' },
    });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Multi edit' },
    });
    fireEvent.submit(editForm());

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(4));
    expect(commandSubmissions().map(({ kind }) => kind)).toEqual([
      'change_course_title',
      'change_course_price',
      'change_course_capacity',
      'update_course_catalog_content',
    ]);
    expect(commandSubmissions().map(({ expectedRevision }) => expectedRevision)).toEqual([
      7, 8, 9, 10,
    ]);
    expect(
      queryAdminCourseReadModels.mock.calls.filter(
        ([input]) => input.scope === 'admin_course_detail'
      ).length
    ).toBeGreaterThan(4);
  });

  it('stops queued commands on stale_version, refreshes authority, and keeps the edit unsaved', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'error',
      kind: 'change_course_title',
      correlationId: 'correlation_stale',
      error: { code: 'stale_version' },
    });
    await openEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Course B' } });
    fireEvent.change(screen.getByLabelText('Price (KZT)'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Stale test' },
    });
    fireEvent.submit(editForm());

    await screen.findByText(/Course changed\. Authoritative data was refreshed/i);
    expect(commandSubmissions().map(({ kind }) => kind)).toEqual(['change_course_title']);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reason for change')).toHaveValue('Stale test');
  });

  it('reports a partial multi-command failure without executing the remaining queue', async () => {
    executeAuthenticatedCanonicalCommand
      .mockImplementationOnce(async (_accountId, submission) => {
        authoritative = {
          ...authoritative,
          title: submission.intent.title,
          revision: 8,
          authorizedActions: actions(8),
        };
        return { status: 'success', kind: submission.kind, correlationId: 'correlation_partial' };
      })
      .mockResolvedValueOnce({
        status: 'error',
        kind: 'change_course_price',
        correlationId: 'correlation_partial',
        error: { code: 'resource_conflict' },
      });
    await openEdit();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Course B' } });
    fireEvent.change(screen.getByLabelText('Price (KZT)'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Partial test' },
    });
    fireEvent.submit(editForm());

    await screen.findByText(/conflicts with an occupied resource/i);
    expect(commandSubmissions().map(({ kind }) => kind)).toEqual([
      'change_course_title',
      'change_course_price',
    ]);
    expect(screen.getByLabelText('Reason for change')).toHaveValue('Partial test');
  });

  it('uses a bounded canonical instructor picker and preserves existing CourseDays', async () => {
    await openEdit();
    await waitFor(() =>
      expect(queryAdminIdentityReadModels).toHaveBeenCalledWith({
        scope: 'admin_instructor_list',
        pageSize: 50,
      })
    );
    expect(screen.getAllByText(/Inactive Coach.*inactive/i).length).toBeGreaterThan(0);
    expect(screen.getByText(dayId)).toBeInTheDocument();
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('keeps the compact list free of detail, instructor, enrollment, and attendance fan-out', async () => {
    render(
      <CoursesManager
        currentAccountId="account_structured_edit_01"
        onRequestConfirm={onRequestConfirm}
      />
    );
    await screen.findAllByText('Course A');
    expect(queryAdminCourseReadModels).toHaveBeenCalledTimes(1);
    expect(queryAdminCourseReadModels).toHaveBeenCalledWith({
      scope: 'admin_course_list',
      pageSize: 50,
      readModelVersion: 2,
      lifecycle: 'active',
    });
    expect(queryAdminIdentityReadModels).not.toHaveBeenCalled();
    expect(queryAdminCourseEnrollmentReadModels).not.toHaveBeenCalled();
  });

  it('keeps an uploaded URL local until explicit Save and remains retryable after failure', async () => {
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Upload image' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fail image upload' }));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Finish image upload' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Finish image upload' }));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason for change'), {
      target: { value: 'Image test' },
    });
    fireEvent.submit(editForm());
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(commandSubmissions()[0]).toMatchObject({
      kind: 'update_course_catalog_content',
      intent: { content: { bgImageUrl: 'https://example.com/uploaded.webp' } },
    });
  });
});

describe('CanonicalCoursesManager structured CourseDay regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryAdminCourseReadModels.mockImplementation(async (input: { scope: string }) =>
      input.scope === 'admin_course_detail'
        ? { scope: 'admin_course_detail', item: detail() }
        : { scope: 'admin_course_list', items: [listItem()] }
    );
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_instructor_list',
      items: [
        {
          instructorId: instructorA,
          name: 'Active Coach',
          isAvailable: true,
          revision: 1,
          authorizedActions: [],
        },
        {
          instructorId: instructorB,
          name: 'Second Coach',
          isAvailable: true,
          revision: 1,
          authorizedActions: [],
        },
      ],
      hasMore: false,
    });
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'create_course_day',
      correlationId: 'correlation_day_success',
    });
  });

  it('adds a CourseDay with exact local calendar input and canonical roster instructor', async () => {
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Add day' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-20' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByLabelText('Duration (minutes)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Actual day instructor'), {
      target: { value: instructorA },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));

    const submission = commandSubmissions()[0];
    expect(submission).toMatchObject({
      kind: 'create_course_day',
      expectedRevision: 7,
      calendarInput: { localDate: '2026-09-20', localTime: '10:30', durationMinutes: 90 },
      timezone: 'Asia/Almaty',
      intent: { courseId, instructorId: instructorA },
    });
    expect(submission.intent.courseDayId).toMatch(/^course_day_/);
  });

  it('reschedules using Course and CourseDay revisions while preserving duration', async () => {
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule day 1' }));
    expect(screen.getByLabelText('Duration (minutes)')).toHaveValue(120);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-20' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '11:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));

    expect(commandSubmissions()[0]).toMatchObject({
      kind: 'reschedule_course_day',
      expectedRevision: 7,
      calendarInput: { localDate: '2026-09-20', localTime: '11:00', durationMinutes: 120 },
      intent: { courseId, courseDayId: dayId, expectedCourseDayRevision: 3 },
    });
  });

  it('reassigns actual instructor without changing the Course roster', async () => {
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Day 1 instructor' }));
    fireEvent.change(screen.getByLabelText('Actual day instructor'), {
      target: { value: instructorB },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));

    expect(commandSubmissions()[0]).toMatchObject({
      kind: 'reassign_course_day_instructor',
      expectedRevision: 3,
      intent: { courseId, courseDayId: dayId, instructorId: instructorB },
    });
    expect(commandSubmissions().some(({ kind }) => kind.includes('roster'))).toBe(false);
  });

  it('removes only when authorized, confirms, and sends both authoritative revisions', async () => {
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Remove day 1' }));
    await waitFor(() => expect(onRequestConfirm).toHaveBeenCalledTimes(1));
    expect(commandSubmissions()[0]).toMatchObject({
      kind: 'remove_course_day',
      expectedRevision: 7,
      intent: { courseId, courseDayId: dayId, expectedCourseDayRevision: 3 },
    });
  });

  it('keeps the structured day editor open and shows an instructor conflict', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'error',
      kind: 'reschedule_course_day',
      correlationId: 'correlation_day_conflict',
      error: { code: 'instructor_conflict' },
    });
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Reschedule day 1' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-20' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save day' }));
    await screen.findByText(/instructor is already occupied/i);
    expect(screen.getByRole('button', { name: 'Save day' })).toBeInTheDocument();
  });

  it('surfaces stale removal, refreshes authority, and does not fabricate a retry', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'error',
      kind: 'remove_course_day',
      correlationId: 'correlation_day_stale',
      error: { code: 'stale_version' },
    });
    await openEdit();
    const detailReadsBefore = queryAdminCourseReadModels.mock.calls.filter(
      ([input]) => input.scope === 'admin_course_detail'
    ).length;
    await userEvent.click(screen.getByRole('button', { name: 'Remove day 1' }));
    await screen.findByText(/Course changed\. Authoritative data was refreshed/i);
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1);
    expect(
      queryAdminCourseReadModels.mock.calls.filter(
        ([input]) => input.scope === 'admin_course_detail'
      ).length
    ).toBeGreaterThan(detailReadsBefore);
  });

  it('does not expose removal when remove_course_day is unauthorized', async () => {
    const unauthorized = detail();
    unauthorized.authorizedActions = unauthorized.authorizedActions.filter(
      ({ kind }) => kind !== 'remove_course_day'
    );
    queryAdminCourseReadModels.mockImplementation(async (input: { scope: string }) =>
      input.scope === 'admin_course_detail'
        ? { scope: 'admin_course_detail', item: unauthorized }
        : { scope: 'admin_course_list', items: [listItem()] }
    );
    await openEdit();
    expect(screen.queryByRole('button', { name: 'Remove day 1' })).not.toBeInTheDocument();
  });
});
