import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';

const queryEmailDeliverySettingsReadModel = vi.fn();
const executeAuthenticatedCanonicalCommand = vi.fn();

vi.mock('../../src/infrastructure/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/firebase')>()),
  auth: { currentUser: { uid: 'account_email_admin_01' } },
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryEmailDeliverySettingsReadModel: (...args: unknown[]) =>
    queryEmailDeliverySettingsReadModel(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
}));

import { EmailDeliverySettingsSection } from '../../src/features/admin/components/settings/EmailDeliverySettingsSection';

function state(input: {
  providerConfigured: boolean;
  deliveryEnabled: boolean;
  revision?: number;
}) {
  const deliveryEnabled = input.providerConfigured && input.deliveryEnabled;
  return {
    scope: 'email_delivery_settings' as const,
    email: {
      providerConfigured: input.providerConfigured,
      deliveryEnabled: input.deliveryEnabled,
      effectiveDeliveryEnabled: deliveryEnabled,
      revision: input.revision ?? 1,
    },
  };
}

function renderSection(language: 'en' | 'ru') {
  localStorage.setItem('alpine_glide_lang', language);
  return render(
    <LanguageProvider>
      <EmailDeliverySettingsSection />
    </LanguageProvider>
  );
}

describe('Admin email delivery control', () => {
  beforeEach(() => {
    queryEmailDeliverySettingsReadModel.mockReset();
    executeAuthenticatedCanonicalCommand.mockReset();
  });

  it('shows an unavailable English control when no provider is configured', async () => {
    queryEmailDeliverySettingsReadModel.mockResolvedValue(
      state({ providerConfigured: false, deliveryEnabled: false, revision: 0 })
    );
    renderSection('en');
    expect(
      await screen.findByText(translations.en.emailDeliveryProviderNotConfigured)
    ).toBeInTheDocument();
    expect(screen.getByText(translations.en.emailDeliveryTitle)).toBeInTheDocument();
    expect(screen.getByText(translations.en.emailDeliveryToggleLabel)).toBeInTheDocument();
    expect(screen.getByText(translations.en.emailDeliveryUnavailable)).toBeInTheDocument();
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
  });

  it('shows an unavailable Russian control when no provider is configured', async () => {
    queryEmailDeliverySettingsReadModel.mockResolvedValue(
      state({ providerConfigured: false, deliveryEnabled: true, revision: 2 })
    );
    renderSection('ru');
    expect(
      await screen.findByText(translations.ru.emailDeliveryProviderNotConfigured)
    ).toBeInTheDocument();
    expect(screen.getByText(translations.ru.emailDeliveryTitle)).toBeInTheDocument();
    expect(screen.getByText(translations.ru.emailDeliveryToggleLabel)).toBeInTheDocument();
    expect(screen.getByText(translations.ru.emailDeliveryUnavailable)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('renders the configured English and Russian states', async () => {
    queryEmailDeliverySettingsReadModel.mockResolvedValue(
      state({ providerConfigured: true, deliveryEnabled: true })
    );
    const english = renderSection('en');
    expect(
      await screen.findByText(translations.en.emailDeliveryProviderConfigured)
    ).toBeInTheDocument();
    expect(screen.getByText(translations.en.emailDeliveryEnabledHint)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    english.unmount();

    queryEmailDeliverySettingsReadModel.mockResolvedValue(
      state({ providerConfigured: true, deliveryEnabled: false })
    );
    renderSection('ru');
    expect(
      await screen.findByText(translations.ru.emailDeliveryProviderConfigured)
    ).toBeInTheDocument();
    expect(screen.getByText(translations.ru.emailDeliveryDisabledHint)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('saves through the canonical command and restores the previous value on failure', async () => {
    queryEmailDeliverySettingsReadModel.mockResolvedValue(
      state({ providerConfigured: true, deliveryEnabled: true, revision: 4 })
    );
    let resolveSave: (value: { status: 'error' }) => void = () => undefined;
    executeAuthenticatedCanonicalCommand.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        })
    );
    renderSection('en');
    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledWith(
      'account_email_admin_01',
      expect.objectContaining({
        kind: 'set_email_delivery_enabled',
        administratorContext: true,
        expectedRevision: 4,
        intent: expect.objectContaining({ enabled: false }),
      })
    );
    expect(await screen.findByText(translations.en.emailDeliverySaving)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    resolveSave({ status: 'error' });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      translations.en.emailDeliverySaveFailed
    );
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('shows success only after the authoritative reload', async () => {
    queryEmailDeliverySettingsReadModel
      .mockResolvedValueOnce(
        state({ providerConfigured: true, deliveryEnabled: false, revision: 1 })
      )
      .mockResolvedValueOnce(
        state({ providerConfigured: true, deliveryEnabled: true, revision: 2 })
      );
    executeAuthenticatedCanonicalCommand.mockResolvedValue({ status: 'success' });
    renderSection('en');
    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    expect(await screen.findByText(translations.en.emailDeliverySaved)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledWith(
      'account_email_admin_01',
      expect.objectContaining({
        kind: 'set_email_delivery_enabled',
        intent: expect.objectContaining({ enabled: true }),
      })
    );
  });
});
