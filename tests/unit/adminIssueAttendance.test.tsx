import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingIdSchema, type LessonBookingReadModel } from '@ski-academy/shared-domain';
import {
  prepareAdminIssueAttendance,
  BULK_ATTENDANCE_REASON,
} from '../../src/features/admin/issues/adminIssueAttendance';
import { translations } from '../../src/lib/i18n/translations';

const executeMock = vi.fn();
const queryMock = vi.fn();
let language: 'en' | 'ru' = 'en';
vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeMock(...args),
}));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryMock(...args),
}));
vi.mock('../../src/features/admin/lesson-bookings/adminLessonBookingsRevisionCoordinator', () => ({
  registerAdminLessonBookingsRevisionListener: () => () => {},
  registerAdminLessonBookingsRevisionFromCommand: vi.fn(),
}));
vi.mock('../../src/features/admin/finance/adminFinanceRevisionCoordinator', () => ({
  registerAdminFinanceRevisionListener: () => () => {},
  registerAdminFinanceRevisionFromCommand: vi.fn(),
}));
vi.mock('../../src/features/admin/issues/adminIssueInboxRevisionCoordinator', () => ({
  registerAdminIssueInboxRevisionFromCommand: vi.fn(),
}));
vi.mock('../../src/features/admin/issues/useAdminIssueTranslations', () => ({
  useAdminIssueTranslations: () => ({
    language,
    t: (key: keyof typeof translations.en) => translations[language][key],
  }),
}));

import { useAdminIssueAttendance } from '../../src/features/admin/issues/useAdminIssueAttendance';
import { AdminIssueAttendancePanel } from '../../src/features/admin/issues/AdminIssueAttendancePanel';
import { subscribeAdminIssueInboxLocalPatches } from '../../src/features/admin/issues/adminIssueInboxLocalSync';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

function booking(
  statuses: Array<'present' | 'absent' | undefined> = [undefined]
): LessonBookingReadModel {
  const ids = statuses.map((_, index) => `participant_bulk_${index}`);
  return {
    bookingId: 'booking_bulk_01',
    revision: 7,
    participantIds: ['participant_not_in_service'],
    serviceParticipantIds: ids,
    lifecycle: { status: 'confirmed' },
    occurrence: { startsAt: { seconds: 1, nanoseconds: 0 }, timeZone: 'Asia/Almaty' },
    admin: {
      participants: ids.map((participantId, index) => ({
        participantId,
        displayName: `Person ${index}`,
      })),
      serviceParticipantIds: ids,
      authorizedActions: { canFinalizeAttendance: true },
      attendance: statuses.map((attendanceStatus, index) => ({
        participantId: ids[index],
        attendanceStatus,
        ...(attendanceStatus ? { revision: index + 2 } : {}),
        authorizedActions: {
          canRecordPresent: attendanceStatus !== 'present',
          canRecordAbsent: attendanceStatus !== 'absent',
        },
      })),
    },
  } as unknown as LessonBookingReadModel;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const refreshIssues = vi.fn().mockResolvedValue({ status: 'success' });
  const input = {
    adminAccountId: 'account_bulk_admin',
    selectedIssueId: 'admin_issue_bulk_01',
    bookingId: BookingIdSchema.parse('booking_bulk_01'),
    locale: 'en-US',
    refreshIssues,
  };
  const hook = renderHook((props) => useAdminIssueAttendance(props), { initialProps: input });
  return { ...hook, input, refreshIssues };
}

describe('Attention Center bulk attendance', () => {
  beforeEach(() => {
    language = 'en';
    executeMock.mockReset().mockResolvedValue({ status: 'success' });
    queryMock.mockReset().mockResolvedValue({ scope: 'admin_detail', items: [booking()] });
  });

  it.each([[undefined], [undefined, undefined], [undefined, 'present', 'absent']] as Array<
    Array<'present' | 'absent' | undefined>
  >)(
    'submits the complete service party once with preserved statuses/revisions: %j',
    async (...statuses) => {
      const model = booking(statuses);
      queryMock.mockResolvedValue({ scope: 'admin_detail', items: [model] });
      const { result, refreshIssues } = setup();
      await waitFor(() => expect(result.current.panel).toBeDefined());
      await act(() => result.current.submit());
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(executeMock.mock.calls[0]).toEqual([
        'account_bulk_admin',
        expect.objectContaining({
          kind: 'finalize_booking_attendance',
          administratorContext: true,
          expectedRevision: 7,
          idempotencyKey: expect.stringMatching(/^admin_lesson:attention_attendance:/),
          intent: {
            bookingId: model.bookingId,
            reasonExplanation: BULK_ATTENDANCE_REASON,
            attendance: model.admin!.attendance.map((record) => ({
              participantId: record.participantId,
              attendanceStatus: record.attendanceStatus ?? 'present',
              ...(record.revision === undefined
                ? {}
                : { expectedAttendanceRevision: record.revision }),
            })),
          },
        }),
      ]);
      expect(queryMock).toHaveBeenCalledWith({ scope: 'admin_detail', bookingId: model.bookingId });
      expect(refreshIssues).toHaveBeenCalledTimes(1);
      expect(result.current.notice?.key).toBe('adminIssueAttendanceSaved');
    }
  );

  it('falls back to participantIds when serviceParticipantIds is absent', () => {
    const model = booking();
    delete model.serviceParticipantIds;
    model.participantIds = model.admin!.serviceParticipantIds;
    expect(prepareAdminIssueAttendance(model, 'en-US').draft?.attendance[0].participantId).toBe(
      'participant_bulk_0'
    );
  });

  it('blocks double clicks synchronously and disables the pending button', async () => {
    const command = deferred<{ status: string }>();
    executeMock.mockReturnValue(command.promise);
    const { result } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    let saving!: Promise<void>;
    act(() => {
      saving = result.current.submit();
      void result.current.submit();
    });
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toBeUndefined();
    render(
      <AdminIssueAttendancePanel
        input={result.current.panel!}
        pending={result.current.pending}
        onSubmit={() => void result.current.submit()}
      />
    );
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    await act(async () => {
      command.resolve({ status: 'success' });
      await saving;
    });
  });

  it('retains the same key/payload after an uncertain error and selection changes', async () => {
    executeMock.mockRejectedValueOnce(new Error('network timeout'));
    const { result, rerender, input } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    await act(() => result.current.submit());
    expect(result.current.notice?.key).toBe('adminIssueAttendanceSaveFailed');
    const first = executeMock.mock.calls[0][1];
    rerender({
      ...input,
      selectedIssueId: 'admin_issue_bulk_02',
      bookingId: BookingIdSchema.parse('booking_bulk_02'),
    });
    rerender(input);
    await waitFor(() => expect(result.current.panel).toBeDefined());
    await act(() => result.current.submit());
    expect(executeMock.mock.calls[1][1]).toEqual(first);
  });

  it('refreshes a stale version without replay and uses new revisions only on a new click', async () => {
    executeMock.mockRejectedValueOnce(
      new CanonicalCommandClientError('stale_version', { correlationId: 'correlation_bulk_01' })
    );
    const { result } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    const changed = booking([undefined, 'absent']);
    changed.revision = 8;
    queryMock.mockResolvedValue({ scope: 'admin_detail', items: [changed] });
    await act(() => result.current.submit());
    expect(result.current.notice?.key).toBe('adminIssueAttendanceStale');
    expect(executeMock).toHaveBeenCalledTimes(1);
    await act(() => result.current.submit());
    expect(executeMock.mock.calls[1][1].expectedRevision).toBe(8);
    expect(executeMock.mock.calls[1][1].idempotencyKey).not.toBe(
      executeMock.mock.calls[0][1].idempotencyKey
    );
  });

  it('reports saved attendance separately from refresh failure', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    queryMock.mockRejectedValue(new Error('read unavailable'));
    await act(() => result.current.submit());
    expect(result.current.notice).toMatchObject({
      key: 'adminIssueAttendanceSaved',
      refreshFailed: true,
    });
    expect(result.current.panel).toBeUndefined();
  });

  it('warns after confirmed save when the inbox refresh reports failure', async () => {
    const { result, refreshIssues } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    refreshIssues.mockResolvedValue({ status: 'failure' });
    await act(() => result.current.submit());
    expect(result.current.notice).toMatchObject({
      key: 'adminIssueAttendanceSaved',
      refreshFailed: true,
    });
  });

  it('does not claim stale data was refreshed when the refresh failed', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    executeMock.mockRejectedValue(
      new CanonicalCommandClientError('stale_version', { correlationId: 'correlation_bulk_01' })
    );
    queryMock.mockRejectedValue(new Error('read unavailable'));
    await act(() => result.current.submit());
    expect(result.current.notice?.key).toBe('adminIssueAttendanceStaleRefreshFailed');
  });

  it('emits inbox resolution only from a successful server payload', async () => {
    const patch = vi.fn();
    const unsubscribe = subscribeAdminIssueInboxLocalPatches(patch);
    const { result } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    executeMock.mockRejectedValueOnce(
      new CanonicalCommandClientError('forbidden', { correlationId: 'correlation_bulk_01' })
    );
    await act(() => result.current.submit());
    expect(patch).not.toHaveBeenCalled();
    executeMock.mockResolvedValue({
      status: 'success',
      payload: { resolvedAdminIssueIds: ['admin_issue_bulk_01'] },
    });
    await act(() => result.current.submit());
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedAdminIssueIds: ['admin_issue_bulk_01'] })
    );
    unsubscribe();
  });

  it('ignores a late booking response after selection changes', async () => {
    const oldRead = deferred<{ scope: string; items: LessonBookingReadModel[] }>();
    queryMock.mockReturnValueOnce(oldRead.promise);
    const { result, rerender, input } = setup();
    const next = booking(['absent', undefined]);
    next.bookingId = BookingIdSchema.parse('booking_bulk_02');
    queryMock.mockResolvedValue({ scope: 'admin_detail', items: [next] });
    rerender({ ...input, selectedIssueId: 'admin_issue_bulk_02', bookingId: next.bookingId });
    await waitFor(() => expect(result.current.panel?.participants).toHaveLength(2));
    await act(async () => {
      oldRead.resolve({ scope: 'admin_detail', items: [booking()] });
    });
    expect(result.current.panel?.participants).toHaveLength(2);
    expect(result.current.notice).toBeUndefined();
  });

  it('ignores the old operation notice after switching issues', async () => {
    const command = deferred<{ status: string }>();
    executeMock.mockReturnValue(command.promise);
    const { result, rerender, input } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    let saving!: Promise<void>;
    act(() => {
      saving = result.current.submit();
    });
    rerender({ ...input, selectedIssueId: 'admin_issue_bulk_02' });
    await act(async () => {
      command.resolve({ status: 'success' });
      await saving;
    });
    expect(result.current.notice).toBeUndefined();
  });

  it('does not cancel the new booking read when an old booking save finishes', async () => {
    const command = deferred<{ status: string }>();
    const nextRead = deferred<{ scope: string; items: LessonBookingReadModel[] }>();
    executeMock.mockReturnValue(command.promise);
    const { result, rerender, input } = setup();
    await waitFor(() => expect(result.current.panel).toBeDefined());
    let saving!: Promise<void>;
    act(() => {
      saving = result.current.submit();
    });
    const next = booking(['absent', undefined]);
    next.bookingId = BookingIdSchema.parse('booking_bulk_02');
    queryMock.mockReturnValueOnce(nextRead.promise);
    rerender({ ...input, selectedIssueId: 'admin_issue_bulk_02', bookingId: next.bookingId });
    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => {
      command.resolve({ status: 'success' });
      await saving;
    });
    await act(async () => {
      nextRead.resolve({ scope: 'admin_detail', items: [next] });
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.panel?.participants).toHaveLength(2);
  });

  it('does not load or save without a selected actionable booking', async () => {
    const { result } = renderHook(() =>
      useAdminIssueAttendance({
        adminAccountId: 'account_bulk_admin',
        locale: 'en-US',
        refreshIssues: vi.fn(),
      })
    );
    await act(() => result.current.submit());
    expect(queryMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'completed', 'no_show', 'pending'])('blocks lifecycle %s', (status) => {
    const model = booking();
    model.lifecycle = { status } as LessonBookingReadModel['lifecycle'];
    expect(prepareAdminIssueAttendance(model, 'en-US').draft).toBeUndefined();
  });
  it('blocks missing authorization, inconsistent rosters/evidence and disallowed participant actions', () => {
    const models = [booking(), booking(), booking(), booking(), booking()];
    models[0].admin!.authorizedActions.canFinalizeAttendance = false;
    models[1].admin!.serviceParticipantIds = [];
    models[2].admin!.attendance = [];
    models[3].admin!.attendance[0].authorizedActions.canRecordPresent = false;
    models[4].admin!.attendance[0].attendanceStatus = 'absent';
    for (const model of models)
      expect(prepareAdminIssueAttendance(model, 'en-US').draft).toBeUndefined();
    expect(
      prepareAdminIssueAttendance(booking(['present', 'absent']), 'en-US').panel.unavailableReason
    ).toBe('adminIssueAttendanceComplete');
  });

  it.each(['en', 'ru'] as const)(
    'renders translated statuses and a single action in %s',
    (locale) => {
      language = locale;
      const onSubmit = vi.fn();
      render(
        <AdminIssueAttendancePanel
          input={
            prepareAdminIssueAttendance(booking([undefined, 'present', 'absent']), locale).panel
          }
          pending={false}
          onSubmit={onSubmit}
        />
      );
      expect(
        screen.getByText(translations[locale].adminLessonAttendanceAbsent)
      ).toBeInTheDocument();
      expect(
        screen.getByText(translations[locale].adminLessonAttendancePresent)
      ).toBeInTheDocument();
      expect(
        screen.getByText(translations[locale].adminLessonAttendanceMissing)
      ).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: translations[locale].adminIssueAttendanceAllPresent })
      );
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('button')).toHaveLength(1);
    }
  );
});
