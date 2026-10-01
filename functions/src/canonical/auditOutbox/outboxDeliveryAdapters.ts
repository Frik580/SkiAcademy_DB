import { OUTBOX_PROVIDER_NOT_CONFIGURED, type OutboxDeliveryAttemptResult } from '@ski-academy/shared-domain';
import type { EmailDeliveryAdapter } from './outboxDeliveryWorker';

/**
 * No outbound email provider is configured in this repository.
 * This adapter never reports a successful send.
 */
export const unconfiguredEmailDeliveryAdapter: EmailDeliveryAdapter = {
  isConfigured: () => false,
  send: async (): Promise<OutboxDeliveryAttemptResult> => ({
    resultClass: 'not_configured',
    errorCode: OUTBOX_PROVIDER_NOT_CONFIGURED,
  }),
};

export function emailDeliveryProviderConfigured(): boolean {
  return unconfiguredEmailDeliveryAdapter.isConfigured();
}
