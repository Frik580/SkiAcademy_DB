import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryAdminIssueReadModels, queryTestSessionReadModels, executeTestSessionLifecycle } =
  vi.hoisted(() => ({
    queryAdminIssueReadModels: vi.fn(),
    queryTestSessionReadModels: vi.fn(),
    executeTestSessionLifecycle: vi.fn(),
  }));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIssueReadModels,
  queryTestSessionReadModels,
}));
vi.mock('../../src/lib/canonical/testSessionLifecycleClient', () => ({
  executeTestSessionLifecycle,
  lifecycleErrorCode: () => 'TEST_MAINTENANCE_FAILED',
}));
vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ru', t: (key: string) => key }),
}));

import { AdminTestingPanel } from '../../src/features/admin/testing';

const activeSession = {
  testSessionId: 'test_session_alpha_01',
  status: 'active',
  label: 'Alpha',
  createdByAccountId: 'account_admin_01',
  startingBalanceKzt: 1_000_000,
  inventoryRevision: 1,
  revision: 1,
  createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  updatedAt: { seconds: 1_700_000_000, nanoseconds: 0 },
};

function renderPanel(initialEntry = '/?tab=system') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminTestingPanel />
    </MemoryRouter>
  );
}

describe('AdminTestingPanel', () => {
  beforeEach(() => {
    queryTestSessionReadModels.mockReset();
    queryAdminIssueReadModels.mockReset();
    executeTestSessionLifecycle.mockReset();
    executeTestSessionLifecycle.mockResolvedValue({
      command: 'create_test_session',
      outcome: 'activated',
      testSessionId: 'test_session_created',
      status: 'provisioning',
    });
    queryAdminIssueReadModels.mockResolvedValue({ scope: 'admin_open', items: [], hasMore: false });
    queryTestSessionReadModels.mockImplementation(({ scope }: { scope: string }) => {
      if (scope === 'test_session_list') return Promise.resolve({ scope, items: [activeSession] });
      if (scope === 'test_actor_directory') {
        return Promise.resolve({
          scope,
          items: [
            {
              accountId: 'account_test_parent_01',
              kind: 'test_parent',
              allowed: true,
              participantIds: ['participant_child_01'],
              activeTestSessionId: activeSession.testSessionId,
              displayName: 'Synthetic Test Parent',
            },
            {
              accountId: 'account_test_instructor_01',
              kind: 'test_instructor',
              allowed: true,
              participantIds: [],
              instructorId: 'instructor_test_01',
              displayName: 'Synthetic Test Instructor',
            },
          ],
        });
      }
      if (scope === 'live_course_templates') {
        return Promise.resolve({
          scope,
          items: [
            {
              courseId: 'course_live_01',
              title: 'LIVE source course',
              lifecycle: 'active',
              revision: 1,
            },
          ],
        });
      }
      return Promise.resolve({
        scope,
        item: {
          ...activeSession,
          clonedCourseIds: [],
          assignedAccountIds: ['account_test_parent_01'],
          counts: {
            bookings: 2,
            courseClones: 1,
            enrollments: 1,
            payments: 1,
            attendance: 1,
            issues: 0,
            assignedActors: 1,
          },
        },
      });
    });
  });

  it('renders isolated session inventory, actor directory, and LIVE source templates', async () => {
    renderPanel();

    expect((await screen.findAllByText('Alpha')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Synthetic Test Parent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('LIVE source course').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\s?000\s?000\s?₸/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });

  it('opens an explicit URL-local Test context and returns to LIVE', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'adminTestingOpen' }));
    expect(screen.getAllByText('adminTestingBanner').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(queryAdminIssueReadModels).toHaveBeenCalledWith({
        scope: 'admin_open',
        pageSize: 20,
        requestedTestSessionId: activeSession.testSessionId,
      })
    );
    await user.click(screen.getByRole('button', { name: 'adminTestingReturnLive' }));
    expect(screen.queryAllByText('adminTestingBanner')).toHaveLength(0);
  });

  it('uses only bounded TestSession management reads before a Test context is opened', async () => {
    renderPanel();
    await screen.findAllByText('Alpha');
    await waitFor(() =>
      expect(queryTestSessionReadModels).toHaveBeenCalledWith({
        scope: 'test_session_inventory',
        testSessionId: activeSession.testSessionId,
      })
    );
    for (const [input] of queryTestSessionReadModels.mock.calls) {
      expect(input).not.toHaveProperty('dataScope');
      expect(input).not.toHaveProperty('requestedTestSessionId');
    }
  });

  it('sends bounded create intent and keeps session authority on the server', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findAllByText('Alpha');

    await user.click(screen.getAllByText('adminTestingCreate')[0]);
    await user.type(screen.getByRole('textbox', { name: 'adminTestingTitle' }), 'Winter check');
    await user.click(screen.getByRole('checkbox', { name: 'LIVE source course' }));
    await user.click(screen.getByRole('checkbox', { name: 'Synthetic Test Parent' }));
    await user.click(screen.getByRole('radio', { name: 'Synthetic Test Instructor' }));
    await user.click(screen.getByRole('button', { name: 'adminTestingCreate' }));

    await waitFor(() => expect(executeTestSessionLifecycle).toHaveBeenCalledTimes(1));
    const [input] = executeTestSessionLifecycle.mock.calls[0];
    expect(input).toMatchObject({
      command: 'create_test_session',
      label: 'Winter check',
      startingBalanceKzt: 1_000_000,
      actorAccountIds: ['account_test_parent_01'],
      testInstructorAccountId: 'account_test_instructor_01',
      sourceCourseIds: ['course_live_01'],
    });
    expect(input).not.toHaveProperty('dataScope');
    expect(input).not.toHaveProperty('testSessionId');
    expect(input).not.toHaveProperty('status');
    expect(input).not.toHaveProperty('manifestId');
  });
});
