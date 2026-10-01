import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { OutboxDeadLetterSection } from '../../src/features/admin/components/settings/OutboxDeadLetterSection';

const queryOutboxDeadLetterReadModel = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryOutboxDeadLetterReadModel: (...args: unknown[]) => queryOutboxDeadLetterReadModel(...args),
}));

function renderSection() {
  return render(
    <LanguageProvider>
      <OutboxDeadLetterSection />
    </LanguageProvider>
  );
}

describe('OutboxDeadLetterSection', () => {
  it('shows one dead-letter signal and no contact details', async () => {
    queryOutboxDeadLetterReadModel.mockResolvedValue({
      scope: 'outbox_dead_letters',
      items: [
        {
          outboxId: 'domain_outbox_visible_01',
          templateId: 'guest_booking_confirmed',
          channel: 'email',
          attemptCount: 2,
          errorCode: 'INVALID_DESTINATION',
          createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
          deadLetteredAt: { seconds: 1_700_000_100, nanoseconds: 0 },
        },
      ],
    });
    renderSection();
    expect(await screen.findByText('guest_booking_confirmed')).toBeTruthy();
    expect(screen.getByText('domain_outbox_visible_01')).toBeTruthy();
    expect(screen.getByText(/INVALID_DESTINATION/)).toBeTruthy();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(queryOutboxDeadLetterReadModel).toHaveBeenCalledWith({ scope: 'outbox_dead_letters' });
  });

  it('shows the empty state', async () => {
    queryOutboxDeadLetterReadModel.mockResolvedValue({
      scope: 'outbox_dead_letters',
      items: [],
    });
    renderSection();
    expect(await screen.findByText('No permanent delivery failures.')).toBeTruthy();
  });

  it('shows a load failure', async () => {
    queryOutboxDeadLetterReadModel.mockRejectedValue(new Error('unavailable'));
    renderSection();
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Could not load delivery failures.');
    });
  });
});
