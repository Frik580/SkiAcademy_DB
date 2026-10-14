import type { ParticipantProgressView } from './applyParticipantProgressToProfile';
import { useCallback, useEffect, useState } from 'react';
import { ParticipantIdSchema } from '@ski-academy/shared-domain/canonical/identifiers';
import { DEFAULT_SKILL_CONFIG } from '../../domain/achievements';
import { queryParticipantProgressReadModels } from '../../lib/canonical/canonicalReadModelClient';
import {
  manageCanonicalParticipantLevel,
  refreshInstructorParticipantProgress,
} from './participantProgressService';
import { ParticipantLevelPanel } from './ParticipantLevelPanel';
import { useLevelProgressionTranslations } from './useLevelProgressionTranslations';
import type { LevelOperation, SkillConfig } from './levelProgressionContracts';

/** Container for bounded progress reads and canonical mutations for one participant. */
export function ParticipantLevelManager({
  accountId,
  participantId,
  role,
  config = DEFAULT_SKILL_CONFIG,
  initial,
  onChanged,
}: {
  accountId: string;
  participantId: string;
  role: 'instructor' | 'admin';
  config?: SkillConfig;
  initial?: ParticipantProgressView;
  onChanged?: () => void;
}) {
  const { text } = useLevelProgressionTranslations();
  const [progress, setProgress] = useState<ParticipantProgressView | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (role === 'instructor') {
      const items = await refreshInstructorParticipantProgress([participantId]);
      setProgress(items.find((item) => item.participantId === participantId));
      return;
    }
    const result = await queryParticipantProgressReadModels({
      scope: role === 'admin' ? 'admin' : 'instructor',
      participantIds: [ParticipantIdSchema.parse(participantId)],
    });
    setProgress(result.items.find((item) => item.participantId === participantId));
  }, [participantId, role]);
  useEffect(() => {
    let active = true;
    setProgress(initial);
    setError('');
    if (!initial)
      queryParticipantProgressReadModels({
        scope: role === 'admin' ? 'admin' : 'instructor',
        participantIds: [ParticipantIdSchema.parse(participantId)],
      })
        .then((result) => {
          if (active)
            setProgress(result.items.find((item) => item.participantId === participantId));
        })
        .catch((e) => {
          if (active) setError(String(e.message));
        });
    return () => {
      active = false;
    };
  }, [participantId, role, initial]);
  const operate = async (operation: LevelOperation) => {
    if (busy || !progress) return;
    setBusy(true);
    setError('');
    try {
      await manageCanonicalParticipantLevel({
        accountId,
        participantId,
        expectedRevision: progress.revision,
        operation,
        administrator: role === 'admin',
      });
      await refresh();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {error && <p role="alert">{error}</p>}
      {progress?.participantId === participantId ? (
        <ParticipantLevelPanel
          progress={progress}
          config={config}
          role={role}
          canCancelRequest={progress.levelState?.request?.accountId === accountId}
          busy={busy}
          onOperation={operate}
        />
      ) : (
        <p>{text.loading}</p>
      )}
      <button
        disabled={busy}
        className="type-caption underline"
        onClick={() => refresh().catch((e) => setError(String(e.message)))}
      >
        {text.refresh}
      </button>
    </div>
  );
}
