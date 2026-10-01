import { type CallableRequest } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  QueryEmailDeliverySettingsReadModelInputSchema,
  type QueryEmailDeliverySettingsReadModelResult,
} from '@ski-academy/shared-domain';
import { emailDeliveryProviderConfigured } from '../auditOutbox/outboxDeliveryAdapters';
import { queryEmailDeliverySettingsReadModel } from './emailDeliverySettingsReadModels';
import { resolveAdministratorCanonicalRead } from './resolveAdministratorCanonicalRead';
import { parseReadModelCallableData, rethrowReadScopeHttpsError } from './readModelScope';

export function createQueryEmailDeliverySettingsReadModelHandler(
  firestore: Firestore,
  isProviderConfigured: () => boolean = emailDeliveryProviderConfigured
) {
  return async (
    request: CallableRequest<Record<string, unknown>>
  ): Promise<QueryEmailDeliverySettingsReadModelResult> => {
    const { requestedTestSessionId } = parseReadModelCallableData(
      QueryEmailDeliverySettingsReadModelInputSchema,
      request.data
    );
    try {
      await resolveAdministratorCanonicalRead(
        firestore,
        request.auth?.uid,
        requestedTestSessionId
      );
      return await queryEmailDeliverySettingsReadModel(firestore, isProviderConfigured());
    } catch (error) {
      rethrowReadScopeHttpsError(error);
    }
  };
}
