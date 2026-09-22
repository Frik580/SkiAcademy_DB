import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeTestSessionLifecycle } = vi.hoisted(() => ({
  executeTestSessionLifecycle: vi.fn(),
}));

vi.mock('../../src/lib/canonical/testSessionLifecycleClient', () => ({
  executeTestSessionLifecycle,
  lifecycleErrorCode: (error: unknown) =>
    error instanceof Error ? error.message : 'TEST_MAINTENANCE_FAILED',
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'ru',
    t: (key: string) => key,
  }),
}));

import { TestSessionResetSection } from '../../src/features/admin/testing/TestSessionResetSection';

const session = {
  testSessionId: 'test_session_alpha_01',
  status: 'active' as const,
  label: 'Alpha',
  createdByAccountId: 'account_admin_01',
  startingBalanceKzt: 100_000,
  inventoryRevision: 2,
  revision: 2,
  createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  updatedAt: { seconds: 1_700_000_000, nanoseconds: 0 },
};

function futureManifest(overrides: Record<string, unknown> = {}) {
  const created = new Date();
  const expires = new Date(created.getTime() + 10 * 60_000);
  return {
    manifestId: 'manifest_alpha',
    manifestHash: 'abcdefabcdefabcdefabcdefabcdefab',
    inventoryRevision: 2,
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
    counts: { bookings: 5, payments: 2 },
    preserve: ['test_session', 'test_actors'],
    warnings: [],
    ...overrides,
  };
}

describe('TestSessionResetSection', () => {
  beforeEach(() => {
    executeTestSessionLifecycle.mockReset();
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-fixed' });
  });

  it('shows preview before execute control', async () => {
    render(
      <TestSessionResetSection
        testSession={session}
        maintenanceLocked={false}
        onAfterReset={async () => {}}
      />
    );
    expect(screen.getByTestId('reset-preview-button')).toBeInTheDocument();
    expect(screen.queryByTestId('reset-open-confirm')).not.toBeInTheDocument();
  });

  it('renders manifest after preview and executes with server manifest id', async () => {
    const user = userEvent.setup();
    const manifest = futureManifest();
    executeTestSessionLifecycle
      .mockResolvedValueOnce({
        command: 'preview_test_session_reset',
        outcome: 'preview',
        manifest,
      })
      .mockResolvedValueOnce({
        command: 'execute_test_session_reset',
        outcome: 'executed',
        status: 'active',
        verifier: { ok: true, failedChecks: [] },
      });

    const onAfterReset = vi.fn(async () => {});
    render(
      <TestSessionResetSection
        testSession={session}
        maintenanceLocked={false}
        onAfterReset={onAfterReset}
      />
    );

    await user.click(screen.getByTestId('reset-preview-button'));
    await waitFor(() => expect(screen.getByText('manifest_alpha')).toBeInTheDocument());
    expect(screen.getByTestId('reset-live-targets')).toHaveTextContent('0');
    expect(screen.getByTestId('reset-foreign-targets')).toHaveTextContent('0');

    await user.click(screen.getByTestId('reset-open-confirm'));
    expect(screen.getByTestId('reset-confirm-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('reset-confirm-execute'));

    await waitFor(() => expect(executeTestSessionLifecycle).toHaveBeenCalledTimes(2));
    expect(executeTestSessionLifecycle.mock.calls[1][0]).toMatchObject({
      command: 'execute_test_session_reset',
      testSessionId: session.testSessionId,
      manifestId: manifest.manifestId,
      confirmation: 'RESET TEST DATA',
    });
    await waitFor(() => expect(screen.getByTestId('reset-complete')).toBeInTheDocument());
    expect(onAfterReset).toHaveBeenCalled();
  });

  it('hides execute when LIVE targets are reported in warnings', async () => {
    const user = userEvent.setup();
    executeTestSessionLifecycle.mockResolvedValueOnce({
      command: 'preview_test_session_reset',
      outcome: 'preview',
      manifest: futureManifest({ warnings: ['live_targets:1'] }),
    });

    render(
      <TestSessionResetSection
        testSession={session}
        maintenanceLocked={false}
        onAfterReset={async () => {}}
      />
    );
    await user.click(screen.getByTestId('reset-preview-button'));
    await waitFor(() => expect(screen.getByTestId('reset-live-targets')).toHaveTextContent('1'));
    expect(screen.queryByTestId('reset-open-confirm')).not.toBeInTheDocument();
  });

  it('cancel modal does not execute', async () => {
    const user = userEvent.setup();
    executeTestSessionLifecycle.mockResolvedValueOnce({
      command: 'preview_test_session_reset',
      outcome: 'preview',
      manifest: futureManifest(),
    });

    render(
      <TestSessionResetSection
        testSession={session}
        maintenanceLocked={false}
        onAfterReset={async () => {}}
      />
    );
    await user.click(screen.getByTestId('reset-preview-button'));
    await waitFor(() => screen.getByTestId('reset-open-confirm'));
    await user.click(screen.getByTestId('reset-open-confirm'));
    await user.click(screen.getByTestId('reset-confirm-cancel'));
    expect(executeTestSessionLifecycle).toHaveBeenCalledTimes(1);
  });

  it('clears preview when session changes', async () => {
    const user = userEvent.setup();
    executeTestSessionLifecycle.mockResolvedValue({
      command: 'preview_test_session_reset',
      outcome: 'preview',
      manifest: futureManifest(),
    });

    const { rerender } = render(
      <TestSessionResetSection
        testSession={session}
        maintenanceLocked={false}
        onAfterReset={async () => {}}
      />
    );
    await user.click(screen.getByTestId('reset-preview-button'));
    await waitFor(() => expect(screen.getByText('manifest_alpha')).toBeInTheDocument());

    rerender(
      <TestSessionResetSection
        testSession={{ ...session, testSessionId: 'test_session_beta_02' }}
        maintenanceLocked={false}
        onAfterReset={async () => {}}
      />
    );
    expect(screen.queryByText('manifest_alpha')).not.toBeInTheDocument();
  });
});
