import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslationKey } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { CoursesManager } from '../../src/features/admin';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseDaySchema,
  CourseIdSchema,
  CourseSchema,
  InstructorIdSchema,
  accountCommandActor,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../../functions/src/canonical/commands/commandClock';
import { createProductionCanonicalCommands } from '../../functions/src/canonical/commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../../functions/src/canonical/transactions';
import { buildArchiveCourseCommandFromListItem } from '../../src/features/admin/components/courses/adminCourseArchiveCommand';
import { buildCanonicalCourseCloneDraft } from '../../src/features/admin/components/courses/adminCourseCloneDraft';
import { CourseProvisioningManifestSchema } from '@ski-academy/shared-domain';

const queryAdminCourseReadModels = vi.fn();
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
  queryAdminCourseEnrollmentReadModels: (...args: unknown[]) =>
    queryAdminCourseEnrollmentReadModels(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
}));

const timestamp = { seconds: 1_800_000_000, nanoseconds: 0 };
const listCourse = {
  courseId: 'course_admin_component_01',
  title: 'Canonical Freeride Camp',
  lifecycle: 'active',
  price: 100_000,
  capacity: { totalSeats: 8, availableSeats: 8, occupiedConfirmedSeats: 0 },
  revision: 2,
  scheduleRevision: 1,
  instructorRosterIds: ['instructor_admin_component_01'],
  instructors: [{ instructorId: 'instructor_admin_component_01', name: 'Coach' }],
  catalogContent: {
    status: 'present',
    content: {
      courseId: 'course_admin_component_01',
      revision: 1,
      duration: '2h',
      description: 'Camp description',
      dates: '1–2 Dec',
      bgImageUrl: 'https://example.com/camp.webp',
    },
  },
  authorizedActions: [{ kind: 'archive_course', expectedRevision: 2 }],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const detailCourse = {
  ...listCourse,
  courseDays: [
    {
      courseId: 'course_admin_component_01',
      courseDayId: 'course_day_admin_component_01',
      dayOrder: 1,
      interval: {
        startsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
        endsAt: { seconds: 1_788_256_800, nanoseconds: 0 },
      },
      timeZone: 'Asia/Almaty',
      actualInstructorIds: ['instructor_admin_component_01'],
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId: 'correlation_component_01',
      },
    },
  ],
  activeEnrollmentCount: 0,
  totalEnrollmentCount: 0,
  provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
  authorizedActions: [
    { kind: 'archive_course', expectedRevision: 2 },
    { kind: 'change_course_title', expectedRevision: 2 },
  ],
};

describe('Canonical CoursesManager delete/clone from compact v2', () => {
  const onRequestConfirm = vi.fn((_message: string, onConfirm: () => void | Promise<void>) => {
    void onConfirm();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    queryAdminCourseReadModels.mockImplementation(async (input: { scope: string }) => {
      if (input.scope === 'admin_course_detail') {
        return { scope: 'admin_course_detail', item: detailCourse };
      }
      return { scope: 'admin_course_list', items: [listCourse] };
    });
    queryAdminCourseEnrollmentReadModels.mockResolvedValue({
      scope: 'admin_course_roster',
      items: [],
      hasMore: false,
    });
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'archive_course',
      correlationId: 'correlation_component_01',
    });
  });

  it('archives using compact v2 courseId and expectedRevision', async () => {
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    expect(queryAdminCourseReadModels).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin_course_list',
        readModelVersion: 2,
      })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Archive course' }));
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

  it('opens a clone draft form without provisioning immediately', async () => {
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[{ instructorId: 'instructor_admin_component_01', name: 'Coach' }]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Clone course' }));

    await waitFor(() => {
      expect(queryAdminCourseReadModels).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'admin_course_detail',
          courseId: 'course_admin_component_01',
        })
      );
    });
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Canonical Freeride Camp (copy)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create course copy' })).toBeInTheDocument();
    expect(
      screen.getByText(/Clone draft from detail\. Review the schedule before saving\./i)
    ).toBeInTheDocument();
  });

  it('submits new identities only after explicit clone save', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'apply_canonical_course_provisioning_manifest',
      correlationId: 'correlation_component_clone_01',
    });
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[{ instructorId: 'instructor_admin_component_01', name: 'Coach' }]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Clone course' }));
    await screen.findByDisplayValue('Canonical Freeride Camp (copy)');

    const daysField = screen.getByLabelText(/CourseDays/);
    fireEvent.change(daysField, {
      target: { value: '2026-12-15 10:00 120 instructor_admin_component_01' },
    });
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    const submission = executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1];
    expect(submission.kind).toBe('apply_canonical_course_provisioning_manifest');
    expect(submission.idempotencyKey).toMatch(/^admin-course:clone:/);
    expect(submission.intent.manifest.courseId).not.toBe('course_admin_component_01');
    expect(submission.intent.manifest.courseId).toMatch(/^course_/);
    expect(submission.intent.manifest.days[0].courseDayId).not.toBe(
      'course_day_admin_component_01'
    );
    expect(submission.intent.manifest.days[0].localDate).toBe('2026-12-15');
    expect(submission.intent.manifest.title).toBe('Canonical Freeride Camp (copy)');
  });

  it('starts exactly one provisioning command for repeated submit events while save is pending', async () => {
    let resolveCommand!: (value: { status: string; kind: string; correlationId: string }) => void;
    executeAuthenticatedCanonicalCommand.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCommand = resolve;
        })
    );
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[{ instructorId: 'instructor_admin_component_01', name: 'Coach' }]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Clone course' }));
    await screen.findByDisplayValue('Canonical Freeride Camp (copy)');
    fireEvent.change(screen.getByLabelText(/CourseDays/), {
      target: { value: '2026-12-15 10:00 120 instructor_admin_component_01' },
    });

    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveCommand({
        status: 'success',
        kind: 'apply_canonical_course_provisioning_manifest',
        correlationId: 'correlation_component_clone_single_submit_01',
      });
    });
  });

  it('reuses the same clone attempt identity after a failed save', async () => {
    executeAuthenticatedCanonicalCommand
      .mockResolvedValueOnce({
        status: 'error',
        kind: 'apply_canonical_course_provisioning_manifest',
        correlationId: 'correlation_component_clone_retry_01',
        error: { code: 'instructor_conflict' },
      })
      .mockResolvedValueOnce({
        status: 'success',
        kind: 'apply_canonical_course_provisioning_manifest',
        correlationId: 'correlation_component_clone_retry_01',
      });
    render(
      <CoursesManager
        currentAccountId="account_admin_component_01"
        instructors={[{ instructorId: 'instructor_admin_component_01', name: 'Coach' }]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect((await screen.findAllByText('Canonical Freeride Camp')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Clone course' }));
    await screen.findByDisplayValue('Canonical Freeride Camp (copy)');
    fireEvent.change(screen.getByLabelText(/CourseDays/), {
      target: { value: '2026-12-15 10:00 120 instructor_admin_component_01' },
    });
    const form = document.querySelector('form')!;
    fireEvent.submit(form);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(2));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].idempotencyKey).toBe(
      executeAuthenticatedCanonicalCommand.mock.calls[1]?.[1].idempotencyKey
    );
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].intent.manifest.courseId).toBe(
      executeAuthenticatedCanonicalCommand.mock.calls[1]?.[1].intent.manifest.courseId
    );
  });
});

describe('archive/clone command semantics with canonical executor', () => {
  const correlationId = CorrelationIdSchema.parse('correlation_course_v2_actions_01');
  const adminAccountId = AccountIdSchema.parse('account_course_v2_actions_01');
  const courseId = CourseIdSchema.parse('course_v2_actions_01');
  const courseDayId = CourseDayIdSchema.parse('course_day_v2_actions_01');
  const instructorId = InstructorIdSchema.parse('instructor_v2_actions_01');
  const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

  function environment() {
    return { clock: createAuthoritativeCommandClock(new Date('2026-02-01T00:00:00.000Z')) };
  }

  function baseDocs() {
    const account = AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId,
      },
    });
    return {
      [`users/${adminAccountId}`]: {
        ...account,
        role: 'admin',
      },
      [`instructors/${instructorId}`]: {
        id: instructorId,
        name: 'Coach',
        pricePerHourKZT: 10_000,
        isAvailable: true,
      },
    };
  }

  function adminContext(idempotencyKey: string, expectedRevision?: number) {
    return {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator' as const,
      idempotencyKey,
      correlationId,
      source: 'admin_callable' as const,
      ...(expectedRevision === undefined
        ? {}
        : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    };
  }

  it('archives successfully with compact-list revision and rejects stale revision', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseDocs());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const provisioned = await commands.execute({
      kind: 'apply_canonical_course_provisioning_manifest',
      context: adminContext('idem-v2-archive-seed'),
      intent: {
        dryRun: false,
        manifest: CourseProvisioningManifestSchema.parse({
          courseId,
          title: 'V2 Actions Course',
          price: 50_000,
          totalSeats: 8,
          capacityPolicy: { kind: 'seed_full' },
          instructorRosterIds: [instructorId],
          timeZone: 'Asia/Almaty',
          days: [
            {
              courseDayId,
              dayOrder: 1,
              localDate: '2026-03-01',
              localTime: '09:00',
              durationMinutes: 120,
              instructorId,
            },
          ],
          presentation: {
            duration: '2h',
            description: 'Source',
            dates: '1 Mar',
            bgImageUrl: 'https://example.com/a.webp',
          },
        }),
      },
    });
    expect(provisioned.status).toBe('success');

    const submission = buildArchiveCourseCommandFromListItem({
      courseId,
      revision: AggregateRevisionSchema.parse(1),
      lifecycle: 'active',
      authorizedActions: [
        {
          kind: 'archive_course',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      ],
    });
    const archived = await commands.execute({
      kind: submission.kind,
      context: adminContext('idem-v2-archive-ok', submission.expectedRevision),
      intent: submission.intent,
    });
    expect(archived.status).toBe('success');

    const stale = await commands.execute({
      kind: 'archive_course',
      context: adminContext('idem-v2-archive-stale', 1),
      intent: {
        courseId,
        reasonExplanation: 'Stale archive retry',
      },
    });
    expect(stale.status).toBe('error');
    if (stale.status === 'error') expect(stale.error.code).toBe('stale_version');
  });

  it('keeps source course unchanged when clone draft is built and only valid slots provision', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(baseDocs());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const sourceManifest = CourseProvisioningManifestSchema.parse({
      courseId,
      title: 'V2 Actions Course',
      price: 50_000,
      totalSeats: 8,
      capacityPolicy: { kind: 'seed_full' },
      instructorRosterIds: [instructorId],
      timeZone: 'Asia/Almaty',
      days: [
        {
          courseDayId,
          dayOrder: 1,
          localDate: '2026-03-01',
          localTime: '09:00',
          durationMinutes: 120,
          instructorId,
        },
      ],
      presentation: {
        duration: '2h',
        description: 'Source',
        dates: '1 Mar',
        bgImageUrl: 'https://example.com/a.webp',
      },
    });
    expect(
      (
        await commands.execute({
          kind: 'apply_canonical_course_provisioning_manifest',
          context: adminContext('idem-v2-clone-source'),
          intent: { dryRun: false, manifest: sourceManifest },
        })
      ).status
    ).toBe('success');

    const sourceCourse = CourseSchema.parse(
      executor.snapshot().docs.get(`courses/${courseId}`)?.data
    );
    const sourceDay = CourseDaySchema.parse(
      executor.snapshot().docs.get(`courses/${courseId}/days/${courseDayId}`)?.data
    );
    const draft = buildCanonicalCourseCloneDraft({
      courseId,
      title: sourceCourse.title,
      lifecycle: sourceCourse.lifecycle,
      price: sourceCourse.price,
      capacity: {
        totalSeats: sourceCourse.capacity.totalSeats,
        availableSeats: sourceCourse.capacity.availableSeats,
        occupiedConfirmedSeats: 0,
      },
      revision: sourceCourse.revision,
      scheduleRevision: sourceCourse.scheduleProjection.courseScheduleRevision,
      instructorRosterIds: sourceCourse.instructorRosterIds,
      instructors: [{ instructorId, name: 'Coach' }],
      courseDays: [sourceDay],
      activeEnrollmentCount: 0,
      totalEnrollmentCount: 0,
      provisioning: { status: 'complete', fingerprint: 'a'.repeat(64) },
      catalogContent: {
        status: 'present',
        content: {
          courseId,
          revision: 1,
          duration: '2h',
          description: 'Source',
          dates: '1 Mar',
          bgImageUrl: 'https://example.com/a.webp',
        },
      },
      authorizedActions: [],
      createdAt,
      updatedAt: createdAt,
    } as never);

    expect(draft.sourceCourseId).toBe(courseId);
    expect(draft.form.title).toBe('V2 Actions Course (copy)');
    expect(draft.form.days).toContain('09:00');

    const conflicting = await commands.execute({
      kind: 'apply_canonical_course_provisioning_manifest',
      context: adminContext('idem-v2-clone-conflict'),
      intent: {
        dryRun: false,
        manifest: CourseProvisioningManifestSchema.parse({
          courseId: 'course_v2_clone_conflict_01',
          title: draft.form.title,
          price: 50_000,
          totalSeats: 8,
          capacityPolicy: { kind: 'seed_full' },
          instructorRosterIds: [instructorId],
          timeZone: 'Asia/Almaty',
          days: [
            {
              courseDayId: 'course_day_v2_clone_conflict_01',
              dayOrder: 1,
              localDate: '2026-03-01',
              localTime: '09:00',
              durationMinutes: 120,
              instructorId,
            },
          ],
          presentation: draft.presentation,
        }),
      },
    });
    expect(conflicting.status).toBe('error');
    if (conflicting.status === 'error') {
      expect(conflicting.error.code).toBe('instructor_conflict');
    }
    expect(executor.snapshot().docs.has('courses/course_v2_clone_conflict_01')).toBe(false);
    expect(
      executor
        .snapshot()
        .docs.has('courses/course_v2_clone_conflict_01/days/course_day_v2_clone_conflict_01')
    ).toBe(false);
    expect(executor.snapshot().docs.get(`courses/${courseId}`)?.data.title).toBe(
      'V2 Actions Course'
    );
    expect(executor.snapshot().docs.get(`courses/${courseId}`)?.data.revision).toBe(
      sourceCourse.revision
    );

    const valid = await commands.execute({
      kind: 'apply_canonical_course_provisioning_manifest',
      context: adminContext('idem-v2-clone-valid'),
      intent: {
        dryRun: false,
        manifest: CourseProvisioningManifestSchema.parse({
          courseId: 'course_v2_clone_valid_01',
          title: draft.form.title,
          price: 50_000,
          totalSeats: 8,
          capacityPolicy: { kind: 'seed_full' },
          instructorRosterIds: [instructorId],
          timeZone: 'Asia/Almaty',
          days: [
            {
              courseDayId: 'course_day_v2_clone_valid_01',
              dayOrder: 1,
              localDate: '2026-04-01',
              localTime: '09:00',
              durationMinutes: 120,
              instructorId,
            },
          ],
          presentation: draft.presentation,
        }),
      },
    });
    expect(valid.status).toBe('success');
    expect(executor.snapshot().docs.has('courses/course_v2_clone_valid_01')).toBe(true);
    expect(
      executor
        .snapshot()
        .docs.has('courses/course_v2_clone_valid_01/days/course_day_v2_clone_valid_01')
    ).toBe(true);

    const secondIntentionalClone = await commands.execute({
      kind: 'apply_canonical_course_provisioning_manifest',
      context: adminContext('idem-v2-clone-second'),
      intent: {
        dryRun: false,
        manifest: CourseProvisioningManifestSchema.parse({
          courseId: 'course_v2_clone_second_01',
          title: `${draft.form.title} 2`,
          price: 50_000,
          totalSeats: 8,
          capacityPolicy: { kind: 'seed_full' },
          instructorRosterIds: [instructorId],
          timeZone: 'Asia/Almaty',
          days: [
            {
              courseDayId: 'course_day_v2_clone_second_01',
              dayOrder: 1,
              localDate: '2026-05-01',
              localTime: '09:00',
              durationMinutes: 120,
              instructorId,
            },
          ],
          presentation: draft.presentation,
        }),
      },
    });
    expect(secondIntentionalClone.status).toBe('success');
    expect(executor.snapshot().docs.has('courses/course_v2_clone_second_01')).toBe(true);
    expect(executor.snapshot().docs.get(`courses/${courseId}`)?.data.revision).toBe(
      sourceCourse.revision
    );
  });
});
