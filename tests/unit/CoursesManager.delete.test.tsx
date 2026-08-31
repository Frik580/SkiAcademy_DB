import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoursesManager } from '../../src/features/admin';

const queryAdminCourseReadModels = vi.fn();
const executeAuthenticatedCanonicalCommand = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminCourseReadModels: (...args: unknown[]) => queryAdminCourseReadModels(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
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

  beforeEach(() => {
    vi.clearAllMocks();
    queryAdminCourseReadModels.mockResolvedValue({
      scope: 'admin_course_list',
      items: [course],
    });
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

    expect(await screen.findByText('Canonical Freeride Camp')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'archive course' }));

    expect(onRequestConfirm).toHaveBeenCalledWith(
      'archive course: Canonical Freeride Camp?',
      expect.any(Function)
    );
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalled());
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1]).toMatchObject({
      kind: 'archive_course',
      expectedRevision: 2,
      intent: {
        courseId: 'course_admin_component_01',
        reasonExplanation: 'Retire obsolete course',
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
    expect(await screen.findByText('Canonical Freeride Camp')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'archive course' }));
    expect(await screen.findByText('network-unavailable')).toBeInTheDocument();
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
        instructors={[
          {
            instructorId: 'instructor_admin_component_01',
            name: 'Coach',
          },
        ]}
        onRequestConfirm={onRequestConfirm}
      />
    );
    expect(await screen.findByText('Canonical Freeride Camp')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create canonical course' }));
    await user.type(screen.getByLabelText('title'), 'Canonical Retry Course');
    await user.type(screen.getByLabelText('price'), '50000');
    await user.type(
      screen.getByLabelText('roster'),
      'instructor_admin_component_01'
    );
    await user.type(screen.getByLabelText('duration'), 'Two days');
    await user.type(screen.getByLabelText('dates'), '1–2 December 2026');
    await user.type(screen.getByLabelText('bgImageUrl'), 'https://example.com/retry.webp');
    await user.type(screen.getByLabelText('description'), 'Canonical retry description');
    await user.type(
      screen.getByLabelText(/CourseDays/),
      '2026-12-01 10:00 120 instructor_admin_component_01'
    );

    const submit = screen.getAllByRole('button', { name: 'Create canonical course' })[1]!;
    await user.click(submit);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1));
    await user.click(submit);
    await waitFor(() => expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(2));
    expect(executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].idempotencyKey).toBe(
      executeAuthenticatedCanonicalCommand.mock.calls[1]?.[1].idempotencyKey
    );
    expect(
      executeAuthenticatedCanonicalCommand.mock.calls[0]?.[1].intent.manifest.courseId
    ).toBe(executeAuthenticatedCanonicalCommand.mock.calls[1]?.[1].intent.manifest.courseId);
  });
});
