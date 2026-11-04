import { useCallback, useEffect, useState } from 'react';
import { refreshManagedParticipantProgress } from '../participant-progress/participantProgressService';

type LoadState = 'loading' | 'loaded' | 'error';

/** Refresh only the open comments surface, including on participant changes. */
export function useCoachParticipantProgress(participantId: string | undefined, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    participantId: string;
    attempt: number;
    status: LoadState;
  }>();
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled || !participantId) {
      setResult(undefined);
      return;
    }
    let active = true;
    setResult({ participantId, attempt, status: 'loading' });
    void refreshManagedParticipantProgress([participantId]).then(
      () => {
        if (active) setResult({ participantId, attempt, status: 'loaded' });
      },
      () => {
        if (active) setResult({ participantId, attempt, status: 'error' });
      }
    );
    return () => {
      active = false;
    };
  }, [participantId, enabled, attempt]);

  const loadState =
    enabled && result?.participantId === participantId && result?.attempt === attempt
      ? result.status
      : 'loading';
  return { loadState, retry };
}
