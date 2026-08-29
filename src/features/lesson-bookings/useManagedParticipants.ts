import { useCallback, useEffect, useState } from 'react';
import { queryManagedParticipantPickerReadModels } from '../../lib/canonical/canonicalReadModelClient';
import type { ManagedParticipantOption } from './lessonBookingContracts';
import { ensureCanonicalSelfParticipant } from '../../lib/canonical/canonicalAccountProvisioningClient';

export function useManagedParticipants(accountId: string | undefined) {
  const [participants, setParticipants] = useState<ManagedParticipantOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    if (!accountId) {
      setParticipants([]);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await ensureCanonicalSelfParticipant(accountId);
      const result = await queryManagedParticipantPickerReadModels({});
      setParticipants(
        result.items.map((item) => ({
          participantId: item.participantId,
          displayName: item.displayName,
          discipline: item.discipline,
          skillLevel: item.skillLevel,
          authority: item.authority,
        }))
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load participants.');
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { participants, loading, error, reload };
}
