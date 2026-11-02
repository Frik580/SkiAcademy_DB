import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KaspiConfigurationAdmin } from '../../src/features/kaspi-payments/KaspiConfigurationAdmin';
import { translations } from '../../src/lib/i18n/translations';
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  language: 'en' as 'en' | 'ru',
}));
vi.mock('../../src/features/kaspi-payments/kaspiService', () => ({ queryKaspi: mocks.query }));
vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: mocks.execute,
}));
vi.mock('../../src/features/kaspi-payments/useKaspiTranslations', () => ({
  useKaspiTranslations: () => ({
    t: (key: keyof typeof translations.en) => translations[mocks.language][key],
  }),
}));
const config = { enabled: false, revision: 0, ready: true, merchantName: 'TEST RECIPIENT' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.language = 'en';
  mocks.query.mockResolvedValue(config);
  mocks.execute.mockResolvedValue({ status: 'success' });
});
describe('Kaspi configuration Administrator UI', () => {
  it.each(['en', 'ru'] as const)(
    'shows OFF and confirms before non-optimistic enable in %s',
    async (language) => {
      mocks.language = language;
      const t = translations[language];
      let finish!: (result: { status: string }) => void;
      mocks.execute.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      render(<KaspiConfigurationAdmin accountId="admin" />);
      const toggle = await screen.findByRole('switch', { name: t.kaspiAllowPayments });
      expect(screen.getByText(t.kaspiDisabled)).toBeInTheDocument();
      expect(screen.getByText('TEST RECIPIENT')).toBeInTheDocument();
      fireEvent.click(toggle);
      expect(toggle).not.toBeChecked();
      expect(screen.getByRole('dialog', { name: t.kaspiEnableTitle })).toBeInTheDocument();
      expect(screen.getByText(t.kaspiAgreementConfirmation)).toBeInTheDocument();
      expect(mocks.execute).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: t.confirm, exact: true }));
      expect(toggle).toBeDisabled();
      expect(toggle).not.toBeChecked();
      mocks.query.mockResolvedValue({ ...config, enabled: true, revision: 1 });
      finish({ status: 'success' });
      await waitFor(() => expect(toggle).toBeChecked());
      expect(await screen.findByText(t.kaspiSettingsSaved)).toBeInTheDocument();
      expect(mocks.execute).toHaveBeenCalledWith(
        'admin',
        expect.objectContaining({
          kind: 'set_kaspi_payment_enabled',
          intent: { enabled: true },
          expectedRevision: 0,
        })
      );
    }
  );
  it('allows disabling incomplete enabled configuration after confirmation', async () => {
    mocks.query.mockResolvedValue({ ...config, enabled: true, ready: false });
    render(<KaspiConfigurationAdmin accountId="admin" />);
    const toggle = await screen.findByRole('switch');
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(
      screen.getByRole('dialog', { name: translations.en.kaspiDisableTitle })
    ).toBeInTheDocument();
    expect(screen.getByText(translations.en.kaspiDisableExplanation)).toBeInTheDocument();
    mocks.query.mockResolvedValue({ ...config, revision: 1, ready: false });
    fireEvent.click(screen.getByRole('button', { name: translations.en.confirm, exact: true }));
    await waitFor(() => expect(toggle).not.toBeChecked());
  });
  it('blocks activation with incomplete technical configuration', async () => {
    mocks.query.mockResolvedValue({ ...config, ready: false });
    render(<KaspiConfigurationAdmin accountId="admin" />);
    expect(await screen.findByRole('switch')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(translations.en.kaspiConfigurationMissing);
  });
  it('shows loading and handles read failure with explicit retry', async () => {
    mocks.query.mockRejectedValueOnce(new Error('unavailable'));
    render(<KaspiConfigurationAdmin accountId="admin" />);
    expect(screen.getByRole('status')).toHaveTextContent(translations.en.processing);
    expect(await screen.findByRole('alert')).toHaveTextContent(translations.en.kaspiSettingsError);
    fireEvent.click(screen.getByRole('button', { name: translations.en.guestCheckStatus }));
    expect(await screen.findByRole('switch')).not.toBeChecked();
  });
  it('refreshes stale state after command failure without displaying success', async () => {
    mocks.execute.mockResolvedValue({ status: 'error' });
    render(<KaspiConfigurationAdmin accountId="admin" />);
    fireEvent.click(await screen.findByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: translations.en.confirm, exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(translations.en.kaspiSettingsError);
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.queryByText(translations.en.kaspiSettingsSaved)).not.toBeInTheDocument();
  });
  it('does not claim successful synchronization if the post-save read fails', async () => {
    render(<KaspiConfigurationAdmin accountId="admin" />);
    fireEvent.click(await screen.findByRole('switch'));
    mocks.query.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: translations.en.confirm, exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent(translations.en.kaspiSettingsError);
    expect(screen.queryByText(translations.en.kaspiSettingsSaved)).not.toBeInTheDocument();
  });
  it('refreshes other administrator changes on focus', async () => {
    render(<KaspiConfigurationAdmin accountId="admin" />);
    await screen.findByRole('switch');
    mocks.query.mockResolvedValue({ ...config, enabled: true, revision: 2 });
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
  });
});
