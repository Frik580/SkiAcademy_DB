import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountIdSchema, InstructorIdSchema } from '@ski-academy/shared-domain';

const {
  mockReads,
  mockAccountReads,
  mockExecute,
  mockSetSearchParams,
  identityReadByDirectory,
} = vi.hoisted(() => ({
  mockReads: {
    accounts: {
      items: [] as Array<Record<string, unknown>>,
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined as string | undefined,
      error: undefined as 'permission-denied' | 'read-failed' | undefined,
    },
    participants: { items: [], loading: false, loadingMore: false, hasMore: false },
    instructors: {
      items: [] as Array<Record<string, unknown>>,
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined as string | undefined,
      error: undefined as 'permission-denied' | 'read-failed' | undefined,
    },
    accountDetail: undefined,
    participantDetail: undefined,
    instructorDetail: undefined as Record<string, unknown> | undefined,
    detailLoading: false,
    detailError: undefined as 'permission-denied' | 'read-failed' | undefined,
    loadMore: vi.fn(),
    refresh: vi.fn(async () => undefined),
  },
  mockAccountReads: {
    accounts: {
      items: [] as Array<Record<string, unknown>>,
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined as string | undefined,
      error: undefined as 'permission-denied' | 'read-failed' | undefined,
    },
    participants: { items: [], loading: false, loadingMore: false, hasMore: false },
    instructors: { items: [], loading: false, loadingMore: false, hasMore: false },
    accountDetail: undefined,
    participantDetail: undefined,
    instructorDetail: undefined,
    detailLoading: false,
    detailError: undefined as 'permission-denied' | 'read-failed' | undefined,
    loadMore: vi.fn(),
    refresh: vi.fn(async () => undefined),
  },
  mockExecute: vi.fn(async () => undefined),
  mockSetSearchParams: vi.fn(),
  identityReadByDirectory: {
    current: {} as Record<string, Record<string, unknown>>,
  },
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('tab=people'), mockSetSearchParams],
  };
});

vi.mock('../../src/features/admin/identity/useAdminIdentityReadModels', () => ({
  useAdminIdentityReadModels: (input: Record<string, unknown>) => {
    const directory = String(input.directory);
    identityReadByDirectory.current[directory] = input;
    if (input.directory === 'accounts') return mockAccountReads;
    return mockReads;
  },
}));

vi.mock('../../src/features/admin/identity/useAdminIdentityCommands', () => ({
  executeAdminIdentityAttempt: (...args: unknown[]) => mockExecute(...args),
}));

vi.mock('../../src/infrastructure/firebase', () => ({
  uploadImage: vi.fn(async () => 'https://example.com/avatar.jpg'),
}));

import { AdminInstructorDirectory } from '../../src/features/admin/people/AdminInstructorDirectory';

const adminId = AccountIdSchema.parse('account_admin_instructor_dir_01');
const linkedAccountId = AccountIdSchema.parse('account_instructor_link_01');
const instructorId = InstructorIdSchema.parse('instructor_catalog_dir_01');

function instructorRow(overrides: Record<string, unknown> = {}) {
  return {
    instructorId,
    name: 'Anna Guide',
    specialty: 'ski',
    isAvailable: true,
    linkedAccountId,
    linkedAccountDisplayName: 'Anna Account',
    pricePerHourKZT: 25000,
    courseRosterCount: 1,
    courseDayAssignmentCount: 0,
    revision: 2,
    authorizedActions: [
      { kind: 'update_instructor_catalog_profile', expectedRevision: 2 },
      { kind: 'deactivate_instructor_catalog', expectedRevision: 2 },
      { kind: 'unlink_account_instructor_catalog', expectedRevision: 2 },
    ],
    ...overrides,
  };
}

describe('AdminInstructorDirectory canonical identity UX', () => {
  beforeEach(() => {
    mockReads.instructors = {
      items: [instructorRow()],
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined,
      error: undefined,
    };
    mockReads.instructorDetail = undefined;
    mockReads.detailLoading = false;
    mockReads.detailError = undefined;
    mockReads.loadMore.mockReset();
    mockReads.refresh.mockClear();
    mockAccountReads.accounts = {
      items: [],
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined,
      error: undefined,
    };
    mockExecute.mockClear();
    mockSetSearchParams.mockClear();
    identityReadByDirectory.current = {};
  });

  it('renders canonical instructor rows without delete wording or USD authority', () => {
    const { container } = render(<AdminInstructorDirectory adminAccountId={adminId} />);
    expect(screen.getByText('Anna Guide')).toBeInTheDocument();
    expect(screen.getByText('Accepting bookings')).toBeInTheDocument();
    expect(screen.getByText('Anna Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add instructor' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Delete instructor|balanceUSD|\$/);
    expect(identityReadByDirectory.current.instructors).toMatchObject({
      directory: 'instructors',
      enabled: true,
    });
  });

  it('uses canonical server search for instructors', async () => {
    vi.useFakeTimers();
    render(<AdminInstructorDirectory adminAccountId={adminId} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search instructors'), {
        target: { value: 'Anna' },
      });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(identityReadByDirectory.current.instructors?.search).toBe('Anna');
    vi.useRealTimers();
  });

  it('opens detail actions from authorizedActions and navigates planner without hard delete', async () => {
    mockReads.instructorDetail = {
      ...instructorRow(),
      bio: 'Alpine guide',
      languages: ['English'],
      experienceYears: 8,
      futureLessonCommitmentCount: 2,
      futureCourseDayAssignmentCount: 1,
      unlinkBlockedByCommitments: false,
      diagnostics: [],
    };
    render(<AdminInstructorDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Pause new bookings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop being instructor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open planner' }));
    expect(mockSetSearchParams).toHaveBeenCalled();
  });

  it('sends expectedRevision 0 when saving a profile whose detail revision is 0', async () => {
    mockReads.instructorDetail = {
      ...instructorRow({
        revision: 0,
        authorizedActions: [
          { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
          { kind: 'deactivate_instructor_catalog', expectedRevision: 0 },
        ],
      }),
      languages: ['Русский'],
      experienceYears: 1,
      futureLessonCommitmentCount: 0,
      futureCourseDayAssignmentCount: 0,
      unlinkBlockedByCommitments: false,
      diagnostics: [],
    };
    render(<AdminInstructorDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    });
    expect(mockExecute).toHaveBeenCalledWith(
      adminId,
      expect.objectContaining({
        kind: 'update_instructor_catalog_profile',
        expectedRevision: 0,
      })
    );
  });

  it('keeps expectedRevision 0 after avatar URL is set in the draft before save', async () => {
    const storageUrl =
      'https://firebasestorage.googleapis.com/v0/b/bucket/o/instructors%2Fx.jpg?alt=media&token=t';
    mockReads.instructorDetail = {
      ...instructorRow({
        revision: 0,
        authorizedActions: [
          { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
          { kind: 'deactivate_instructor_catalog', expectedRevision: 0 },
        ],
      }),
      languages: ['English'],
      experienceYears: 2,
      futureLessonCommitmentCount: 0,
      futureCourseDayAssignmentCount: 0,
      unlinkBlockedByCommitments: false,
      diagnostics: [],
    };
    render(<AdminInstructorDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByLabelText('Avatar URL'), {
      target: { value: storageUrl },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    });
    expect(mockExecute).toHaveBeenCalledWith(
      adminId,
      expect.objectContaining({
        kind: 'update_instructor_catalog_profile',
        expectedRevision: 0,
        avatarUrl: storageUrl,
      })
    );
  });

  it('uses refreshed revision for the second profile save after a successful update', async () => {
    mockReads.instructorDetail = {
      ...instructorRow({
        revision: 0,
        authorizedActions: [
          { kind: 'update_instructor_catalog_profile', expectedRevision: 0 },
          { kind: 'deactivate_instructor_catalog', expectedRevision: 0 },
        ],
      }),
      languages: ['English'],
      experienceYears: 2,
      futureLessonCommitmentCount: 0,
      futureCourseDayAssignmentCount: 0,
      unlinkBlockedByCommitments: false,
      diagnostics: [],
    };
    mockReads.refresh.mockImplementation(async () => {
      mockReads.instructorDetail = {
        ...instructorRow({
          revision: 1,
          authorizedActions: [
            { kind: 'update_instructor_catalog_profile', expectedRevision: 1 },
            { kind: 'deactivate_instructor_catalog', expectedRevision: 1 },
          ],
        }),
        languages: ['English'],
        experienceYears: 2,
        futureLessonCommitmentCount: 0,
        futureCourseDayAssignmentCount: 0,
        unlinkBlockedByCommitments: false,
        diagnostics: [],
      };
    });
    const { rerender } = render(<AdminInstructorDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    });
    expect(mockExecute).toHaveBeenLastCalledWith(
      adminId,
      expect.objectContaining({
        kind: 'update_instructor_catalog_profile',
        expectedRevision: 0,
      })
    );
    rerender(<AdminInstructorDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    });
    expect(mockExecute).toHaveBeenLastCalledWith(
      adminId,
      expect.objectContaining({
        kind: 'update_instructor_catalog_profile',
        expectedRevision: 1,
      })
    );
  });
});
