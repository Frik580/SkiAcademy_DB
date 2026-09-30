import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationKey } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { CoursesManager } from '../../src/features/admin';
import {
  IanaTimeZoneSchema,
  resolveBookingScheduleFromCalendarInput,
} from '@ski-academy/shared-domain';

const queryAdminCourseReadModels = vi.fn();
const queryAdminCourseEnrollmentReadModels = vi.fn();
const queryAdminIdentityReadModels = vi.fn();
const queryAdminPlannerReadModels = vi.fn();
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
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) =>
    queryAdminCourseEnrollmentReadModels(...args),
  queryAdminIdentityReadModels: (...args: unknown[]) => queryAdminIdentityReadModels(...args),
  queryAdminPlannerReadModels: (...args: unknown[]) => queryAdminPlannerReadModels(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
}));

vi.mock('../../src/features/admin/courses/adminCoursesRevisionCoordinator', () => ({
  registerAdminCoursesRevisionListener: () => () => {},
  registerAdminCoursesRevisionFromCommand: vi.fn(),
  resetAdminCoursesRevisionCoordinatorForTests: vi.fn(),
}));

vi.mock('../../src/features/admin/finance/adminFinanceRevisionCoordinator', () => ({
  registerAdminFinanceRevisionListener: () => () => {},
  registerAdminFinanceRevisionFromCommand: vi.fn(),
  resetAdminFinanceRevisionCoordinatorForTests: vi.fn(),
}));

const timestamp = { seconds: 1_800_000_000, nanoseconds: 0 };
const course = {
  courseId: 'course_admin_component_01',
  title: 'Canonical Freeride Camp',
  lifecycle: 'active',
  price: 100_000,
  capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
  revision: 2,
  scheduleRevision: 1,
  instructorRosterIds: ['instructor_admin_component_01'],
  instructors: [{ instructorId: 'instructor_admin_component_01', name: 'Coach' }],
  courseDays: [],
  activeEnrollmentCount: 0,
  totalEnrollmentCount: 0,
  provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
  catalogContent: { status: 'missing' },
  authorizedActions: [{ kind: 'archive_course', expectedRevision: 2 }],
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe('Canonical CoursesManager', () => {
  const onRequestConfirm = vi.fn((_message: string, onConfirm: () => void | Promise<void>) => {
    void onConfirm();
  });

  const openCreateForm = async () => {
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add Course' }));
    await screen.findByLabelText('title');
    return user;
  };

  const fillValidCreateFields = async (
    user: ReturnType<typeof userEvent.setup>,
    overrides: {
      readonly title?: string;
      readonly bgImageUrl?: string;
      readonly date?: string;
      readonly endDate?: string;
      readonly startTime?: string;
      readonly endTime?: string;
      readonly assignInstructor?: boolean;
    } = {}
  ) => {
    const fill = (label: string | RegExp, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    fill('title', overrides.title ?? 'Canonical Create Validation Course');
    fill('price (KZT)', '50000');
    await user.click(await screen.findByLabelText(/Coach/));
    fill('bgImageUrl', overrides.bgImageUrl ?? 'https://example.com/course.webp');
    fireEvent.change(screen.getByLabelText('Period starts'), {
      target: { value: overrides.date ?? '2026-12-01' },
    });
    fireEvent.change(screen.getByLabelText('Period ends'), {
      target: { value: overrides.endDate ?? overrides.date ?? '2026-12-01' },
    });
    fireEvent.change(screen.getByLabelText('Starts'), {
      target: { value: overrides.startTime ?? '10:00' },
    });
    fireEvent.change(screen.getByLabelText('Ends'), {
      target: { value: overrides.endTime ?? '12:00' },
    });
    const instructorSelect = await screen.findByLabelText(/Available instructor/);
    await waitFor(() => expect(instructorSelect).not.toBeDisabled());
    if (overrides.assignInstructor !== false) {
      await user.selectOptions(instructorSelect, 'instructor_admin_component_01');
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryAdminCourseReadModels.mockResolvedValue({
      scope: 'admin_course_list',
      items: [course],
    });
    queryAdminCourseEnrollmentReadModels.mockResolvedValue({
      scope: 'admin_course_roster',
      items: [],
      hasMore: false,
    });
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_instructor_list',
      items: [
        {
          instructorId: 'instructor_admin_component_01',
          name: 'Coach',
          specialty: 'ski',
          isAvailable: true,
          revision: 1,
          authorizedActions: [],
        },
      ],
      hasMore: false,
    });
    queryAdminPlannerReadModels.mockImplementation(
      async (input: { localDate: string; timeZone: string }) => ({
        scope: 'admin_planner',
        item: {
          view: 'day',
          localDate: input.localDate,
          timeZone: input.timeZone,
          window: {
            startsAt: { seconds: 0, nanoseconds: 0 },
            endsAt: { seconds: 10_000_000_000, nanoseconds: 0 },
          },
          instructors: [
            {
              instructorId: 'instructor_admin_component_01',
              name: 'Coach',
              isAvailable: true,
            },
          ],
          occupancy: [],
          truncated: false,
        },
      })
    );
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'archive_course',
      correlationId: 'correlation_component_01',
    });
    vi.spyOn(window, 'prompt').mockReturnValue('Retire obsolete course');
  });

  it('loads the server projection and archives through an intent command', async () => {
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[]}
        onRequestConfirm={onRequestConfirm}
      />
    );

    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Archive course' }));

    expect(onRequestConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Archive course "Canonical Freeride Camp"?'),
      expect.any(Function)
    );
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalled());
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'archive_course',
      expectedRevision: 2,
      intent: {
        courseId: 'course_admin_component_01',
        reasonExplanation: 'Admin course archive',
      },
    });
  });

  it('shows permission errors from the server read boundary', async () => {
    queryAdminCourseReadModels.mockRejectedValueOnce(new Error('permission-denied'));
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Administrator permission required.'
    );
  });

  it('shows command failures instead of leaving an unhandled mutation', async () => {
    executeAuthenticatedCanonicalCommand.mockRejectedValueOnce(new Error('network-unavailable'));
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Archive course' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent?.length).toBeGreaterThan(0);
  });

  it('reuses the same creation identity after an unconfirmed attempt', async () => {
    executeAuthenticatedCanonicalCommand
      .mockResolvedValueOnce({
        status: 'error',
        kind: 'apply_canonical_course_provisioning_manifest',
        correlationId: 'correlation_component_create_01',
        error: { code: 'internal' },
      })
      .mockResolvedValueOnce({
        status: 'success',
        kind: 'apply_canonical_course_provisioning_manifest',
        correlationId: 'correlation_component_create_01',
      });
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add Course' }));
    // This test exercises retry identity, not per-keystroke input behavior.
    const fill = (label: string | RegExp, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    };
    fill('title', 'Canonical Retry Course');
    fill('price (KZT)', '50000');
    await user.click(await screen.findByLabelText(/Coach/));
    fill('bgImageUrl', 'https://example.com/retry.webp');
    fill('description', 'Canonical retry description');
    fireEvent.change(screen.getByLabelText('Period starts'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Period ends'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '12:00' } });
    const instructorSelect = await screen.findByLabelText('Available instructor');
    await waitFor(() => expect(instructorSelect).not.toBeDisabled());
    await user.selectOptions(instructorSelect, 'instructor_admin_component_01');

    const submit = screen.getByRole('button', { name: 'Create canonical course' });
    await user.click(submit);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(
      within(screen.getByRole('form', { name: 'Create canonical course' })).getByRole('alert')
    ).toBeInTheDocument();
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(2));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].idempotencyKey).toBe(
      executeAuthenticatedCanonicalCommand.mock.calls[1]?.[1].idempotencyKey
    );
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].intent.manifest.courseId).toBe(
      executeAuthenticatedCanonicalCommand.mock.calls[1]?.[1].intent.manifest.courseId
    );
  });

  it('creates a new canonical course through provisioning with an empty optional Russian title', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user);

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    const command = executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1];
    expect(command.kind).toBe('apply_canonical_course_provisioning_manifest');
    expect(command.intent.manifest.title).toBe('Canonical Create Validation Course');
    expect(command.intent.manifest.presentation).not.toHaveProperty('titleRu');
    expect(command.intent.manifest.days[0]).toMatchObject({
      localDate: '2026-12-01',
      localTime: '10:00',
      durationMinutes: 120,
      instructorId: 'instructor_admin_component_01',
    });
  });

  it('automatically creates one CourseDay for every calendar date in the selected period', async () => {
    await openCreateForm();
    fireEvent.change(screen.getByLabelText('Period starts'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Period ends'), { target: { value: '2026-12-03' } });

    expect(screen.getByText('Day 1 · 2026-12-01')).toBeInTheDocument();
    expect(screen.getByText('Day 2 · 2026-12-02')).toBeInTheDocument();
    expect(screen.getByText('Day 3 · 2026-12-03')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Starts')).toHaveLength(3);
    expect(screen.getAllByLabelText('Ends')).toHaveLength(3);
    await waitFor(() => expect(screen.queryByText('Checking schedule…')).not.toBeInTheDocument());
  });

  it('requires the course period to end on or after its start date', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user);
    fireEvent.change(screen.getByLabelText('Period starts'), { target: { value: '2026-12-03' } });
    fireEvent.change(screen.getByLabelText('Period ends'), { target: { value: '2026-12-01' } });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    const form = screen.getByRole('form', { name: 'Create canonical course' });
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Course period: The period end cannot be earlier than its start.'
    );
    expect(document.activeElement).toBe(document.getElementById('canonical-course-period-end'));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('calculates each CourseDay duration from its start and end times', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user, { startTime: '10:00', endTime: '15:00' });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].intent.manifest.days[0]).toMatchObject({
      localDate: '2026-12-01',
      localTime: '10:00',
      durationMinutes: 300,
    });
  });

  it('shows when an end time earlier than the start continues into the next day', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user, { startTime: '22:00', endTime: '02:00' });

    expect(screen.getByText('Duration: 240 min · ends the next day')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].intent.manifest.days[0]).toMatchObject({
      localTime: '22:00',
      durationMinutes: 240,
    });
  });

  it('filters out an instructor whose planner occupancy overlaps the selected time range', async () => {
    const busyInterval = resolveBookingScheduleFromCalendarInput(
      {
        localDate: '2026-12-01',
        localTime: '14:00',
        durationMinutes: 60,
      },
      IanaTimeZoneSchema.parse('Asia/Almaty')
    ).interval;
    queryAdminPlannerReadModels.mockImplementation(
      async (input: { localDate: string; timeZone: string }) => ({
        scope: 'admin_planner',
        item: {
          view: 'day',
          localDate: input.localDate,
          timeZone: input.timeZone,
          window: {
            startsAt: { seconds: 0, nanoseconds: 0 },
            endsAt: { seconds: 10_000_000_000, nanoseconds: 0 },
          },
          instructors: [
            {
              instructorId: 'instructor_admin_component_01',
              name: 'Coach',
              isAvailable: true,
            },
          ],
          occupancy: [
            {
              occupancyKind: 'lesson_booking',
              occupancyId: 'booking_busy_component_01',
              instructorId: 'instructor_admin_component_01',
              interval: busyInterval,
              timeZone: input.timeZone,
              localDate: '2026-12-01',
              localTime: '14:00',
              durationMinutes: 60,
              displayTitle: 'Busy lesson',
              lifecycleStatus: 'confirmed',
            },
          ],
          truncated: false,
        },
      })
    );
    const user = await openCreateForm();
    await fillValidCreateFields(user, {
      startTime: '10:00',
      endTime: '15:00',
      assignInstructor: false,
    });

    expect(await screen.findByText('No instructors are free for this time range.')).toBeInTheDocument();
    expect(within(screen.getByLabelText(/Available instructor/)).queryByRole('option', { name: 'Coach' })).not.toBeInTheDocument();
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('shows a field-specific error and focuses a missing required field', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user);
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '' } });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    const form = screen.getByRole('form', { name: 'Create canonical course' });
    expect(within(form).getByRole('alert')).toHaveTextContent('Title: Enter a course title.');
    expect(document.activeElement).toBe(document.getElementById('canonical-course-title'));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('shows a visible validation error for an invalid background image URL', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user, { bgImageUrl: 'not-a-url' });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    const form = screen.getByRole('form', { name: 'Create canonical course' });
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Background image URL: Enter a valid image URL.'
    );
    expect(document.activeElement).toBe(document.getElementById('canonical-course-bgImageUrl'));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('shows a visible error for an invalid CourseDay time range', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user, { endTime: '10:10' });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    const form = screen.getByRole('form', { name: 'Create canonical course' });
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Day 1 end time: The daily time range must be from 15 minutes to 24 hours.'
    );
    expect((document.activeElement as HTMLElement).id).toMatch(/-end$/);
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('requires a date selected from the calendar for every CourseDay', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user);
    fireEvent.change(screen.getByLabelText('Period ends'), { target: { value: '' } });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    const form = screen.getByRole('form', { name: 'Create canonical course' });
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Course period: Choose the course period start and end dates from the calendar.'
    );
    expect(document.activeElement).toBe(document.getElementById('canonical-course-period-end'));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('shows the specific shared-schema field issue instead of swallowing it', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user);
    fireEvent.change(screen.getByLabelText('titleRu'), {
      target: { value: 'Русское название'.repeat(15) },
    });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    const form = screen.getByRole('form', { name: 'Create canonical course' });
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Russian title: Russian title must be at most 200 characters.'
    );
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('shows a field-specific CourseProvisioningManifestSchema validation issue', async () => {
    const user = await openCreateForm();
    await fillValidCreateFields(user, { title: 'A'.repeat(201) });

    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));

    const form = screen.getByRole('form', { name: 'Create canonical course' });
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'Title: Title is required and must be at most 200 characters.'
    );
    expect(document.activeElement).toBe(document.getElementById('canonical-course-title'));
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('does not start two provisioning commands for repeated create submits', async () => {
    let resolveCommand!: (value: {
      status: string;
      kind: string;
      correlationId: string;
    }) => void;
    executeAuthenticatedCanonicalCommand.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCommand = resolve;
        })
    );
    const user = await openCreateForm();
    await fillValidCreateFields(user);
    const form = screen.getByRole('form', { name: 'Create canonical course' });

    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].kind).toBe(
      'apply_canonical_course_provisioning_manifest'
    );

    await act(async () => {
      resolveCommand({
        status: 'success',
        kind: 'apply_canonical_course_provisioning_manifest',
        correlationId: 'correlation_component_create_single_submit_01',
      });
    });
  });
});
