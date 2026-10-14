import { useCallback, useEffect, useState } from 'react';
import { ParticipantIdSchema } from '@ski-academy/shared-domain/canonical/identifiers';
import { queryParticipantProgressReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { ParticipantLevelManager } from '../../participant-progress/ParticipantLevelManager';
import { useLevelProgressionTranslations } from '../../participant-progress/useLevelProgressionTranslations';
import type { ParticipantProgressReadModel } from '../../participant-progress/levelProgressionContracts';
import { useSettingsStore } from '../../settings/settingsStore';

export function AdminLevelRequests({ accountId }: { accountId: string }) {
  const { text } = useLevelProgressionTranslations();
  const config = useSettingsStore((state) => state.skillConfig);
  const [items, setItems] = useState<readonly ParticipantProgressReadModel[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const page = await queryParticipantProgressReadModels({
        scope: 'admin',
        ...(cursor ? { cursor: ParticipantIdSchema.parse(cursor) } : {}),
      });
      setItems(page.items);
      setNext(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [cursor]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="space-y-3 lg:col-span-2">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="type-card-title">{text.requests}</h3>
        <button disabled={busy} onClick={() => void load()}>
          {text.refresh}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {busy ? (
        <p>{text.loading}</p>
      ) : items.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        items.map((item) => (
          <article key={item.participantId} className="space-y-2">
            <header className="flex items-center gap-2">
              {item.participantAvatar && (
                <img
                  className="h-9 w-9 rounded-full object-cover"
                  src={item.participantAvatar}
                  alt=""
                />
              )}
              <h4>{item.participantName ?? item.participantId}</h4>
              <span>{item.instructorName ?? item.levelState?.request?.instructorId}</span>
            </header>
            <ParticipantLevelManager
              accountId={accountId}
              participantId={item.participantId}
              role="admin"
              config={config}
              initial={item}
              onChanged={() => void load()}
            />
          </article>
        ))
      )}
      <div className="flex gap-3">
        {cursor && (
          <button disabled={busy} onClick={() => setCursor(undefined)}>
            {text.refresh}
          </button>
        )}
        {next && (
          <button disabled={busy} onClick={() => setCursor(next)}>
            {text.more}
          </button>
        )}
      </div>
    </section>
  );
}
