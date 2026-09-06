import { act, render, screen } from '@testing-library/react';
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

const timestamp = { seconds: 1_800_000_000, nanoseconds: 0 };

function course(input: {
  id: string;
  title: string;
  lifecycle?: 'active' | 'archived';
  authorizedActions?: Array<{ kind: string; expectedRevision: number }>;
}) {
  return {
    courseId: input.id,
    title: input.title,
    lifecycle: input.lifecycle ?? 'active',
    price: 100_000,
    capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
    revision: 11,
    scheduleRevision: 1,
    instructorRosterIds: [],
    instructors: [],
    catalogContent: {
      status: 'present',
      content: {
        courseId: input.id,
        revision: 1,
        duration: 'One day',
        description: `${input.title} description`,
        dates: '',
        bgImageUrl: 'https://example.com/course.webp',
      },
    },
    authorizedActions: input.authorizedActions ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function detail(row: ReturnType<typeof course>) {
  return {
    ...row,
    courseDays: [
      {
        courseId: row.courseId,
        courseDayId: `course_day_${row.courseId}`,
        dayOrder: 1,
        interval: {
          startsAt: {
            seconds: Math.floor(Date.parse('2026-09-20T05:00:00Z') / 1000),
            nanoseconds: 0,
          },
          endsAt: {
            seconds: Math.floor(Date.parse('2026-09-20T07:00:00Z') / 1000),
            nanoseconds: 0,
          },
        },
        timeZone: 'Asia/Almaty',
        actualInstructorIds: [],
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId: 'correlation_seed',
        },
      },
    ],
    activeEnrollmentCount: 0,
    totalEnrollmentCount: 0,
    provisioning: { status: 'complete' },
    catalogContent: {
      status: 'present',
      content: {
        courseId: row.courseId,
        revision: 1,
        duration: 'One day',
        description: 'Archived detail',
        dates: 'stale catalog date',
        bgImageUrl: '',
      },
    },
  };
}

const activeA = course({ id: 'course_admin_active_a', title: 'Active A' });
const activeB = course({ id: 'course_admin_active_b', title: 'Active B' });
const archivedA = {
  ...course({
    id: 'course_admin_archived_a',
    title: 'Archived A',
    lifecycle: 'archived',
    authorizedActions: [{ kind: 'reactivate_course', expectedRevision: 7 }],
  }),
  scheduleSummary: {
    courseDayCount: 1,
    startsAt: {
      seconds: Math.floor(Date.parse('2026-09-20T05:00:00Z') / 1000),
      nanoseconds: 0,
    },
    firstDayEndsAt: {
      seconds: Math.floor(Date.parse('2026-09-20T07:00:00Z') / 1000),
      nanoseconds: 0,
    },
    lastDayStartsAt: {
      seconds: Math.floor(Date.parse('2026-09-20T05:00:00Z') / 1000),
      nanoseconds: 0,
    },
    timeZone: 'Asia/Almaty',
  },
  catalogContent: {
    status: 'present' as const,
    content: {
      courseId: 'course_admin_archived_a',
      revision: 1,
      duration: 'One day',
      description: 'Archived A description',
      dates: 'stale catalog date',
      bgImageUrl: 'https://example.com/course.webp',
    },
  },
};

const onRequestConfirm = vi.fn((_message: string, onConfirm: () => void | Promise<void>) => {
  void onConfirm();
});

function renderManager() {
  return render(
    <CoursesManager
      currentAccountId="account_admin_pagination_01"
      instructors={[]}
      onRequestConfirm={onRequestConfirm}
    />
  );
}

describe('CanonicalCoursesManager lifecycle pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_instructor_list',
      items: [],
      hasMore: false,
    });
    queryAdminCourseEnrollmentReadModels.mockResolvedValue({
      scope: 'admin_course_roster',
      items: [],
      hasMore: false,
    });
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'reactivate_course',
      correlationId: 'correlation_restore_success',
    });
    queryAdminCourseReadModels.mockImplementation(
      async (input: { scope: string; lifecycle?: string; cursor?: string }) => {
        if (input.scope === 'admin_course_detail') {
          return { scope: 'admin_course_detail', item: detail(archivedA) };
        }
        if (input.lifecycle === 'archived') {
          return { scope: 'admin_course_list', items: [archivedA], hasMore: false };
        }
        if (input.cursor) {
          return {
            scope: 'admin_course_list',
            items: [activeB, activeA],
            hasMore: false,
          };
        }
        return {
          scope: 'admin_course_list',
          items: [activeA],
          hasMore: true,
          nextCursor: 'active-page-1',
        };
      }
    );
  });

  it('loads one active page, explicitly loads more, and lazily keeps tab states separate', async () => {
    renderManager();

    await screen.findByText('Active A');
    expect(queryAdminCourseReadModels).toHaveBeenCalledTimes(1);
    expect(queryAdminCourseReadModels).toHaveBeenCalledWith({
      scope: 'admin_course_list',
      pageSize: 50,
      readModelVersion: 2,
      lifecycle: 'active',
    });
    expect(queryAdminCourseEnrollmentReadModels).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Active B');
    expect(queryAdminCourseReadModels).toHaveBeenCalledWith({
      scope: 'admin_course_list',
      pageSize: 50,
      readModelVersion: 2,
      lifecycle: 'active',
      cursor: 'active-page-1',
    });
    expect(screen.getAllByText('Active A')).toHaveLength(1);

    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Archived A');
    expect(screen.queryByText('Active A')).not.toBeInTheDocument();
    expect(queryAdminCourseReadModels).toHaveBeenCalledWith({
      scope: 'admin_course_list',
      pageSize: 50,
      readModelVersion: 2,
      lifecycle: 'archived',
    });

    await userEvent.click(screen.getByRole('tab', { name: 'Active' }));
    expect(await screen.findByText('Active B')).toBeInTheDocument();
    expect(queryAdminCourseReadModels).toHaveBeenCalledTimes(3);
  });

  it('shows lifecycle-specific empty states', async () => {
    queryAdminCourseReadModels.mockResolvedValue({
      scope: 'admin_course_list',
      items: [],
      hasMore: false,
    });
    renderManager();
    await screen.findByText('No active courses yet.');
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('No archived courses yet.');
  });

  it('never lets a late Active response populate the Archived tab', async () => {
    let resolveActive!: (value: unknown) => void;
    const activeRequest = new Promise((resolve) => {
      resolveActive = resolve;
    });
    queryAdminCourseReadModels.mockImplementation((input: { lifecycle?: string }) =>
      input.lifecycle === 'archived'
        ? Promise.resolve({
            scope: 'admin_course_list',
            items: [archivedA],
            hasMore: false,
          })
        : activeRequest
    );
    renderManager();
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Archived A');
    await act(async () => {
      resolveActive({ scope: 'admin_course_list', items: [activeA], hasMore: false });
      await activeRequest;
    });
    expect(screen.queryByText('Active A')).not.toBeInTheDocument();
    expect(screen.getByText('Archived A')).toBeInTheDocument();
  });

  it('preserves existing rows on Load More failure and retries the same cursor', async () => {
    let failLoadMore = true;
    queryAdminCourseReadModels.mockImplementation(async (input: { cursor?: string }) => {
      if (!input.cursor)
        return {
          scope: 'admin_course_list',
          items: [activeA],
          hasMore: true,
          nextCursor: 'active-page-1',
        };
      if (failLoadMore) throw new Error('load more failed');
      return { scope: 'admin_course_list', items: [activeB], hasMore: false };
    });
    renderManager();
    await screen.findByText('Active A');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('load more failed');
    expect(screen.getByText('Active A')).toBeInTheDocument();
    failLoadMore = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Active B');
    expect(queryAdminCourseReadModels).toHaveBeenLastCalledWith({
      scope: 'admin_course_list',
      pageSize: 50,
      readModelVersion: 2,
      lifecycle: 'active',
      cursor: 'active-page-1',
    });
  });

  it('reactivates with authorized OCC, removes the row, and invalidates Active lazily', async () => {
    let activeReads = 0;
    queryAdminCourseReadModels.mockImplementation(
      async (input: { scope: string; lifecycle?: string }) => {
        if (input.scope === 'admin_course_detail')
          return { scope: 'admin_course_detail', item: detail(archivedA) };
        if (input.lifecycle === 'archived')
          return { scope: 'admin_course_list', items: [archivedA], hasMore: false };
        activeReads += 1;
        return {
          scope: 'admin_course_list',
          items: activeReads === 1 ? [activeA] : [{ ...archivedA, lifecycle: 'active' }],
          hasMore: false,
        };
      }
    );
    renderManager();
    await screen.findByText('Active A');
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Archived A');
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await screen.findByText('No archived courses yet.');
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1);
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]![1]).toMatchObject({
      kind: 'reactivate_course',
      expectedRevision: 7,
      intent: {
        courseId: archivedA.courseId,
        reasonExplanation: 'Admin course reactivation',
      },
    });
    expect(activeReads).toBe(1);

    await userEvent.click(screen.getByRole('tab', { name: 'Active' }));
    await screen.findByText('Archived A');
    expect(activeReads).toBe(2);
  });

  it('archives with authorized OCC, removes the row, and invalidates Archived lazily', async () => {
    const archivable = course({
      id: 'course_admin_archivable',
      title: 'Archivable course',
      authorizedActions: [{ kind: 'archive_course', expectedRevision: 13 }],
    });
    let archivedReads = 0;
    queryAdminCourseReadModels.mockImplementation(async (input: { lifecycle?: string }) => {
      if (input.lifecycle === 'archived') {
        archivedReads += 1;
        return {
          scope: 'admin_course_list',
          items: [{ ...archivable, lifecycle: 'archived' }],
          hasMore: false,
        };
      }
      return { scope: 'admin_course_list', items: [archivable], hasMore: false };
    });
    renderManager();
    await screen.findByText('Archivable course');
    await userEvent.click(screen.getByTitle('Archive course'));

    await screen.findByText('No active courses yet.');
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]![1]).toMatchObject({
      kind: 'archive_course',
      expectedRevision: 13,
      intent: { courseId: archivable.courseId },
    });
    expect(archivedReads).toBe(0);

    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Archivable course');
    expect(archivedReads).toBe(1);
  });

  it('keeps action visibility lifecycle- and authorization-driven', async () => {
    const unauthorizedArchived = { ...archivedA, authorizedActions: [] };
    queryAdminCourseReadModels.mockImplementation(async (input: { lifecycle?: string }) => ({
      scope: 'admin_course_list',
      items: input.lifecycle === 'archived' ? [unauthorizedArchived] : [activeA],
      hasMore: false,
    }));
    renderManager();
    await screen.findByText('Active A');
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Archived A');
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.queryByTitle('Archive course')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Clone course')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Course details' })).toBeInTheDocument();
  });

  it('keeps an archived Course after stale OCC and never retries the command', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'error',
      kind: 'reactivate_course',
      correlationId: 'correlation_restore_stale',
      error: { code: 'stale_version' },
    });
    renderManager();
    await screen.findByText('Active A');
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Archived A');
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await screen.findByText(/Course changed\. Authoritative data was refreshed/i);
    expect(screen.getByText('Archived A')).toBeInTheDocument();
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1);
    expect(
      queryAdminCourseReadModels.mock.calls.filter(
        ([input]) => input.scope === 'admin_course_list' && input.lifecycle === 'archived'
      )
    ).toHaveLength(2);
  });

  it('opens archived detail read-only and shows CourseDay-derived dates', async () => {
    renderManager();
    await screen.findByText('Active A');
    await userEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Archived A');
    expect(screen.getByText(/September 20, 2026/)).toBeInTheDocument();
    expect(screen.queryByText('stale catalog date')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Course details' }));

    const schedule = await screen.findByTestId('admin-course-detail-dates');
    expect(schedule).toHaveTextContent('20.09.2026');
    expect(schedule).not.toHaveTextContent('stale catalog date');
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Restore' }).length).toBeGreaterThan(0);
  });
});
