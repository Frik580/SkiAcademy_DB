import type { Firestore } from 'firebase-admin/firestore';
import {
  buildEmailDeliveryControlState,
  type QueryEmailDeliverySettingsReadModelResult,
} from '@ski-academy/shared-domain';
import {
  EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH,
  parseEmailDeliverySettings,
} from '../auditOutbox/emailDeliverySettingsStore';

export async function queryEmailDeliverySettingsReadModel(
  firestore: Firestore,
  providerConfigured: boolean
): Promise<QueryEmailDeliverySettingsReadModelResult> {
  const snapshot = await firestore.doc(EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH).get();
  const settings = parseEmailDeliverySettings(
    snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined
  );
  return {
    scope: 'email_delivery_settings',
    email: buildEmailDeliveryControlState({ providerConfigured, settings }),
  };
}
