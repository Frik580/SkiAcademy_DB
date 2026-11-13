import { useEffect, useRef, useState } from 'react';
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
import { LessonLevelMarker } from '../../../settings/LessonLevelMarker';
import {
  newLessonLevelLogoPath,
  uploadLessonLevelLogo,
  validateLessonLevelLogo,
} from '../../../settings/lessonLevelLogo';

export function AdminLessonLevelsSettings() {
  const text = useLessonLevelsTranslations();
  const { levels, revision, loaded, error } = useLessonLevelsStore();
  const [draft, setDraft] = useState<LessonLevelDefinition | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [logoFile, setLogoFile] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const upload = useRef<{ file: File; path: string; complete: boolean }>();
  const base = useRef<{ level: LessonLevelDefinition; revision: number }>();
  const busy = useRef(false);
  const attempt = useRef<{ signature: string; key: string; revision: number }>();
  useEffect(() => {
    if (!logoFile) {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);
  const ordered = sortLessonLevels(levels);
  const activeCount = levels.filter((level) => level.isActive).length;

  const save = async (next: readonly LessonLevelDefinition[], expectedRevision = revision) => {
    if (busy.current || !loaded || error) return;
    const parsed = LessonLevelsPayloadSchema.safeParse({ levels: next });
    if (!parsed.success) {
      setMessage(text.invalid);
      return;
    }
    busy.current = true;
    setPending(true);
    setMessage('');
    try {
      let nextLevels = parsed.data.levels;
      if (logoFile && draft) {
        if (upload.current?.file !== logoFile) {
          upload.current = {
            file: logoFile,
            path: newLessonLevelLogoPath(draft.id),
            complete: false,
          };
        }
        if (!upload.current.complete) {
          await uploadLessonLevelLogo(logoFile, upload.current.path);
          upload.current.complete = true;
        }
        const path = upload.current.path;
        nextLevels = nextLevels.map((level) =>
          level.id === draft.id ? { ...level, logoStoragePath: path } : level
        );
      }
      const signature = JSON.stringify(nextLevels);
      if (attempt.current?.signature !== signature) {
        attempt.current = {
          signature,
          key: `lesson-levels-${crypto.randomUUID()}`,
          revision: expectedRevision,
        };
      }
      await saveLessonLevels(nextLevels, attempt.current.revision, attempt.current.key);
      attempt.current = undefined;
      setDraft(null);
      setLogoFile(undefined);
      upload.current = undefined;
    } catch (failure) {
      if (failure instanceof Error && failure.message === 'stale_version') {
        attempt.current = undefined;
        if (base.current) base.current.revision = useLessonLevelsStore.getState().revision;
      }
      setMessage(
        failure instanceof Error && failure.message === 'stale_version' ? text.stale : text.failed
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const move = (index: number, offset: number) => {
    const next = [...ordered];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    void save(next.map((level, order) => ({ ...level, order })));
  };
  const inputClass = 'w-full border border-[var(--border)] bg-transparent px-3 py-2 type-body';

  return (
    <AdminCollapsibleSection
      id="lesson_levels"
      title={text.title}
      subtitle={text.subtitle}
      icon={ListOrdered}
      defaultOpen={false}
    >
      <div className="space-y-4">
        <p className="type-compact text-[var(--ink-dim)]">{text.hint}</p>
        {error ? <p role="alert">{text.unavailable}</p> : !loaded ? <p>{text.loading}</p> : null}
        {message && <p role="alert">{message}</p>}
        <ul className="space-y-2">
          {ordered.map((level, index) => (
            <li
              key={level.id}
              className="flex flex-wrap items-center gap-3 border border-[var(--border)] p-3"
            >
              <LessonLevelMarker
                marker={level.marker}
                markerColor={level.markerColor}
                logoStoragePath={level.logoStoragePath}
              />
              <div className="flex-1 min-w-40">
                <p>
                  {level.nameRu} / {level.nameEn}
                </p>
                <p className="type-caption text-[var(--ink-dim)]">
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
                onClick={() => {
                  base.current = { level, revision };
                  attempt.current = undefined;
                  setDraft({ ...level });
                }}
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
              const original = base.current?.level;
              const edited = (level: LessonLevelDefinition) => {
                const merged = { ...level };
                for (const field of [
                  'nameRu',
                  'nameEn',
                  'marker',
                  'markerColor',
                  'logoStoragePath',
                ] as const) {
                  if (!original || draft[field] !== original[field]) {
                    const value = draft[field];
                    if (value === undefined) delete merged[field];
                    else merged[field] = value;
                  }
                }
                return merged;
              };
              void save(
                existing
                  ? levels.map((level) => (level.id === draft.id ? edited(level) : level))
                  : [
                      ...levels,
                      { ...draft, order: Math.max(-1, ...levels.map((level) => level.order)) + 1 },
                    ],
                base.current?.revision ?? revision
              );
            }}
          >
            <p className="type-caption text-[var(--ink-dim)]">ID: {draft.id}</p>
            {(['nameRu', 'nameEn', 'marker'] as const).map((field) => (
              <label key={field} htmlFor={`lesson-level-${field}`} className="block type-compact">
                {field === 'nameRu' ? text.ru : field === 'nameEn' ? text.en : text.marker}
                <input
                  id={`lesson-level-${field}`}
                  required
                  disabled={pending}
                  maxLength={field === 'marker' ? 16 : 120}
                  className={inputClass}
                  value={draft[field]}
                  onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
                />
              </label>
            ))}
            <label htmlFor="lesson-level-color" className="block type-compact">
              {text.color}
              <input
                id="lesson-level-color"
                type="color"
                disabled={pending}
                value={draft.markerColor ?? '#808080'}
                onChange={(event) => setDraft({ ...draft, markerColor: event.target.value })}
              />
            </label>
            <p>{draft.markerColor ?? text.defaultColor}</p>
            {draft.markerColor && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const { markerColor: _color, ...rest } = draft;
                  setDraft(rest);
                }}
              >
                {text.resetColor}
              </button>
            )}
            <label htmlFor="lesson-level-logo" className="block type-compact">
              {text.logo}
              <input
                id="lesson-level-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  try {
                    validateLessonLevelLogo(file);
                    setLogoFile(file);
                    setMessage('');
                  } catch {
                    setMessage(text.invalidLogo);
                  }
                }}
              />
            </label>
            <p className="type-caption">{text.logoHint}</p>
            <div aria-label={text.preview}>
              <LessonLevelMarker
                marker={draft.marker}
                markerColor={draft.markerColor}
                logoStoragePath={draft.logoStoragePath}
                previewUrl={previewUrl}
              />
            </div>
            {(logoFile || draft.logoStoragePath) && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setLogoFile(undefined);
                  upload.current = undefined;
                  const { logoStoragePath: _logo, ...rest } = draft;
                  setDraft(rest);
                }}
              >
                {text.removeLogo}
              </button>
            )}
            <div className="flex gap-3">
              <button type="submit" className="btn-primary px-4 py-2" disabled={pending}>
                {text.save}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setDraft(null);
                  setLogoFile(undefined);
                  upload.current = undefined;
                  attempt.current = undefined;
                }}
              >
                {text.cancel}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn-primary px-4 py-2"
            disabled={pending || !loaded || error || levels.length >= 128}
            onClick={() => {
              const level = {
                id: `level_${crypto.randomUUID().replaceAll('-', '')}`,
                nameRu: '',
                nameEn: '',
                marker: '⚪',
                order: Math.max(...levels.map((level) => level.order)) + 1,
                isActive: true,
              };
              base.current = { level, revision };
              attempt.current = undefined;
              setDraft(level);
            }}
          >
            + {text.add}
          </button>
        )}
      </div>
    </AdminCollapsibleSection>
  );
}
