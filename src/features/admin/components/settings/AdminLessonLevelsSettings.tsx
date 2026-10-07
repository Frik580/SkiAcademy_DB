import { useRef, useState } from 'react';
import { ListOrdered } from 'lucide-react';
import {
  LessonLevelsPayloadSchema,
  sortLessonLevels,
  type LessonLevelDefinition,
} from '@ski-academy/shared-domain';
import { useLessonLevelsStore } from '../../../settings/lessonLevelsStore';
import { saveLessonLevels } from '../../../settings/lessonLevelsService';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { useLessonLevelsTranslations } from './useLessonLevelsTranslations';

export function AdminLessonLevelsSettings() {
  const text = useLessonLevelsTranslations();
  const { levels, revision, loaded, error } = useLessonLevelsStore();
  const [draft, setDraft] = useState<LessonLevelDefinition | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const attempt = useRef<{ signature: string; key: string }>();
  const ordered = sortLessonLevels(levels);
  const activeCount = levels.filter((level) => level.isActive).length;

  const save = async (next: readonly LessonLevelDefinition[]) => {
    if (pending || !loaded || error) return;
    const parsed = LessonLevelsPayloadSchema.safeParse({ levels: next });
    if (!parsed.success) {
      setMessage(text.invalid);
      return;
    }
    const signature = JSON.stringify({ levels: parsed.data.levels, revision });
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: `lesson-levels-${crypto.randomUUID()}` };
    }
    setPending(true);
    setMessage('');
    try {
      await saveLessonLevels(parsed.data.levels, revision, attempt.current.key);
      attempt.current = undefined;
      setDraft(null);
    } catch (failure) {
      setMessage(
        failure instanceof Error && failure.message === 'stale_version' ? text.stale : text.failed
      );
    } finally {
      setPending(false);
    }
  };
  const move = (index: number, offset: number) => {
    const next = [...ordered];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    void save(next.map((level, order) => ({ ...level, order })));
  };
  const inputClass = 'w-full border border-[var(--border)] bg-transparent px-3 py-2 text-sm';

  return (
    <AdminCollapsibleSection
      id="lesson_levels"
      title={text.title}
      subtitle={text.subtitle}
      icon={ListOrdered}
      defaultOpen={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--ink-dim)]">{text.hint}</p>
        {error ? <p role="alert">{text.unavailable}</p> : !loaded ? <p>{text.loading}</p> : null}
        {message && <p role="alert">{message}</p>}
        <ul className="space-y-2">
          {ordered.map((level, index) => (
            <li
              key={level.id}
              className="flex flex-wrap items-center gap-3 border border-[var(--border)] p-3"
            >
              <span>{level.marker}</span>
              <div className="flex-1 min-w-40">
                <p>
                  {level.nameRu} / {level.nameEn}
                </p>
                <p className="text-xs text-[var(--ink-dim)]">
                  {level.id} · {level.isActive ? text.active : text.archived}
                </p>
              </div>
              <button
                type="button"
                disabled={pending || !loaded || error || !!draft || index === 0}
                aria-label={`${text.up}: ${level.nameEn}`}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={pending || !loaded || error || !!draft || index === ordered.length - 1}
                aria-label={`${text.down}: ${level.nameEn}`}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={pending || !loaded || error || !!draft}
                onClick={() => setDraft({ ...level })}
              >
                {text.edit}
              </button>
              <button
                type="button"
                disabled={
                  pending || !loaded || error || !!draft || (level.isActive && activeCount === 1)
                }
                onClick={() =>
                  void save(
                    levels.map((item) =>
                      item.id === level.id ? { ...item, isActive: !item.isActive } : item
                    )
                  )
                }
              >
                {level.isActive ? text.archive : text.restore}
              </button>
            </li>
          ))}
        </ul>
        {draft ? (
          <form
            className="space-y-3 max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              const existing = levels.some((level) => level.id === draft.id);
              void save(
                existing
                  ? levels.map((level) => (level.id === draft.id ? draft : level))
                  : [...levels, draft]
              );
            }}
          >
            <p className="text-xs text-[var(--ink-dim)]">ID: {draft.id}</p>
            {(['nameRu', 'nameEn', 'marker'] as const).map((field) => (
              <label key={field} className="block text-sm">
                {field === 'nameRu' ? text.ru : field === 'nameEn' ? text.en : text.marker}
                <input
                  required
                  disabled={pending}
                  maxLength={field === 'marker' ? 16 : 120}
                  className={inputClass}
                  value={draft[field]}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                />
              </label>
            ))}
            <div className="flex gap-3">
              <button type="submit" className="btn-primary px-4 py-2" disabled={pending}>
                {text.save}
              </button>
              <button type="button" disabled={pending} onClick={() => setDraft(null)}>
                {text.cancel}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn-primary px-4 py-2"
            disabled={pending || !loaded || error || levels.length >= 128}
            onClick={() =>
              setDraft({
                id: `level_${crypto.randomUUID().replaceAll('-', '')}`,
                nameRu: '',
                nameEn: '',
                marker: '⚪',
                order: Math.max(...levels.map((level) => level.order)) + 1,
                isActive: true,
              })
            }
          >
            + {text.add}
          </button>
        )}
      </div>
    </AdminCollapsibleSection>
  );
}
