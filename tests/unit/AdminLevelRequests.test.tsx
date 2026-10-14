import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantProgressReadModelSchema } from '@ski-academy/shared-domain';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { DEFAULT_SKILL_CONFIG } from '../../src/domain/achievements';
import { AdminLevelRequests } from '../../src/features/admin/issues/AdminLevelRequests';

const { query, manage } = vi.hoisted(() => ({ query: vi.fn(), manage: vi.fn() }));
// Keep the real container, manager, panel and translations; isolate network boundaries.
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryParticipantProgressReadModels: query,
}));
vi.mock('../../src/features/participant-progress/participantProgressService', () => ({
  manageCanonicalParticipantLevel: manage,
  refreshInstructorParticipantProgress: vi.fn(),
}));
vi.mock('../../src/features/settings/settingsStore', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ skillConfig: DEFAULT_SKILL_CONFIG }),
}));

const accountId = 'account_admin_level_requests';
function pendingItem(participantId = 'participant_level_request_01') {
  return ParticipantProgressReadModelSchema.parse({
    participantId,
    participantName: 'Alex Student',
    instructorName: 'Coach Anna',
    level: 2,
    skillScores: { l1_1: 10 },
    skillComments: {},
    revision: 7,
    levelState: {
      levelRevision: 2,
      method: 'historical',
      qualifications: [],
      request: {
        requestId: 'command_level_request_01',
        status: 'pending',
        fromLevel: 2,
        proposedLevel: 3,
        baseLevelRevision: 2,
        instructorId: 'instructor_level_request_01',
        accountId: 'account_instructor_level_request_01',
        reason: { category: 'expert_assessment', text: 'Observed qualification' },
        comment: 'Ready for Performance',
        createdAt: { seconds: 1, nanoseconds: 0 },
      },
    },
  });
}
function renderInbox() {
  return render(
    <LanguageProvider>
      <AdminLevelRequests accountId={accountId} />
    </LanguageProvider>
  );
}
beforeEach(() => {
  localStorage.setItem('alpine_glide_lang', 'en');
  query.mockReset().mockResolvedValue({ scope: 'admin', items: [] });
  manage.mockReset().mockResolvedValue(undefined);
});

describe('AdminLevelRequests canonical inbox', () => {
  it.each([
    ['en', 'Level change requests', 'No pending requests', 'Refresh'],
    ['ru', 'Запросы на изменение уровня', 'Нет ожидающих запросов', 'Обновить'],
  ])('renders an accessible empty inbox in %s', async (language, heading, empty, refresh) => {
    localStorage.setItem('alpine_glide_lang', language);
    renderInbox();
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(await screen.findByText(empty)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: refresh })).toBeEnabled();
    expect(query).toHaveBeenCalledWith({ scope: 'admin' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(manage).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'Approve'],
    ['ru', 'Одобрить'],
  ])(
    'approves a pending request in %s through the canonical workflow',
    async (language, approve) => {
      localStorage.setItem('alpine_glide_lang', language);
      const item = pendingItem();
      query.mockResolvedValueOnce({ scope: 'admin', items: [item] });
      renderInbox();
      const button = await screen.findByRole('button', { name: approve });
      expect(screen.getByText('Alex Student')).toBeInTheDocument();
      expect(screen.getByText('Coach Anna')).toBeInTheDocument();
      expect(screen.getByText('Observed qualification')).toBeInTheDocument();
      expect(screen.getByText('Ready for Performance')).toBeInTheDocument();
      // Initial items seed the manager, so mounting adds no per-participant reads.
      expect(query).toHaveBeenCalledTimes(1);
      fireEvent.click(button);
      await waitFor(() =>
        expect(manage).toHaveBeenCalledWith({
          accountId,
          participantId: item.participantId,
          expectedRevision: 7,
          administrator: true,
          operation: { action: 'approve', requestId: item.levelState!.request!.requestId },
        })
      );
      await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
      expect(manage).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[1][0]).toEqual({
        scope: 'admin',
        participantIds: [item.participantId],
      });
      expect(query.mock.calls[2][0]).toEqual({ scope: 'admin' });
      expect(item).toMatchObject({ level: 2, skillScores: { l1_1: 10 } });
    }
  );

  it('requires an accessible reason before rejecting and locks mutations while submitting', async () => {
    const item = pendingItem();
    query.mockResolvedValue({ scope: 'admin', items: [item] });
    let finish!: () => void;
    manage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    renderInbox();
    const reject = await screen.findByRole('button', { name: 'Reject with reason' });
    expect(reject).toBeDisabled();
    fireEvent.click(reject);
    expect(manage).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Required reason' }), {
      target: { value: '  More evidence needed  ' },
    });
    fireEvent.click(reject);
    expect(manage).toHaveBeenCalledWith({
      accountId,
      participantId: item.participantId,
      expectedRevision: 7,
      administrator: true,
      operation: {
        action: 'reject',
        requestId: item.levelState!.request!.requestId,
        reason: { category: 'expert_assessment', text: 'More evidence needed' },
      },
    });
    expect(manage).toHaveBeenCalledTimes(1);
    expect(reject).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await act(async () => finish());
    await waitFor(() => expect(reject).toBeEnabled());
  });

  it('shows a mutation failure as an alert, refreshes evidence and allows retry', async () => {
    const item = pendingItem();
    query.mockResolvedValue({ scope: 'admin', items: [item] });
    manage.mockRejectedValueOnce(new Error('Revision conflict'));
    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Revision conflict');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled());
    expect(query.mock.lastCall?.[0]).toEqual({
      scope: 'admin',
      participantIds: [item.participantId],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(manage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(4));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports read errors accessibly and retries without a mutation', async () => {
    query.mockRejectedValueOnce(new Error('Read failed'));
    renderInbox();
    expect(await screen.findByRole('alert')).toHaveTextContent('Read failed');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('No pending requests')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(query).toHaveBeenCalledTimes(2);
    expect(manage).not.toHaveBeenCalled();
  });

  it('loads the next bounded page only on demand and refreshes the first page', async () => {
    const item = pendingItem();
    query.mockResolvedValueOnce({ scope: 'admin', items: [item], nextCursor: item.participantId });
    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('No pending requests')).toBeInTheDocument();
    expect(query.mock.lastCall?.[0]).toEqual({ scope: 'admin', cursor: item.participantId });
    fireEvent.click(screen.getAllByRole('button', { name: 'Refresh' })[1]);
    await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
    expect(query.mock.lastCall?.[0]).toEqual({ scope: 'admin' });
    expect(manage).not.toHaveBeenCalled();
  });
});
