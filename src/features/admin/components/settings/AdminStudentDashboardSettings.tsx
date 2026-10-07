import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, LayoutDashboard } from 'lucide-react';
import { useProfileStore } from '../../../profile/profileStore';
import { useSettingsStore } from '../../../settings/settingsStore';
import {
  STUDENT_DASHBOARD_COLUMNS,
  moveDashboardTile,
  DEFAULT_STUDENT_DASHBOARD_LAYOUT,
  getOrderedDashboardTiles,
  normalizeStudentDashboardLayout,
  validateStudentDashboardLayout,
  type StudentDashboardLayout,
  type StudentDashboardTileKey,
} from '../../../settings/studentDashboardLayout';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { useStudentDashboardSettingsTranslations } from './useStudentDashboardSettingsTranslations';

/** Settings container. Preview never mounts student cards or their data hooks. */
export function AdminStudentDashboardSettings() {
  const labels = useStudentDashboardSettingsTranslations();
  const profile = useProfileStore((state) => state.userProfile);
  const saved = useSettingsStore((state) => state.studentDashboardLayout);
  const saveLayout = useSettingsStore((state) => state.handleUpdateStudentDashboardLayout);
  const [draftOverride, setDraftOverride] = useState<StudentDashboardLayout | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<'saved' | 'error' | null>(null);
  const dragged = useRef<StudentDashboardTileKey | null>(null);
  const draft = draftOverride ?? saved;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const canWrite = profile?.role === 'admin' || profile?.systemRole === 'owner';

  if (!canWrite) return null;

  const updateDraft = (next: StudentDashboardLayout) => {
    setDraftOverride(JSON.stringify(next) === JSON.stringify(saved) ? null : next);
    setMessage(null);
  };
  const move = (key: StudentDashboardTileKey, target: StudentDashboardTileKey) => {
    if (saving) return;
    updateDraft(moveDashboardTile(draft, key, target));
  };
  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setMessage(null);
    try {
      validateStudentDashboardLayout(draft);
      await saveLayout(draft);
      setDraftOverride(null);
      setMessage('saved');
    } catch {
      setMessage('error');
    } finally {
      setSaving(false);
    }
  };
  const tiles = getOrderedDashboardTiles(draft);

  return (
    <AdminCollapsibleSection
      id="student_dashboard_layout"
      title={labels.title}
      subtitle={labels.description}
      icon={LayoutDashboard}
    >
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <legend className="sr-only">{labels.title}</legend>
        {STUDENT_DASHBOARD_COLUMNS.map((column) => {
          const columnTiles = tiles.filter((tile) => tile.desktopColumn === column);
          return (
            <section key={column} aria-label={labels.column(column)}>
              <h3 className="mb-2 text-sm font-semibold">{labels.column(column)}</h3>
              <ol aria-label={labels.column(column)} className="space-y-2">
                {columnTiles.map((tile, index) => {
                  const label = tile.label[labels.lang];
                  return (
                    <li
                      key={tile.key}
                      data-layout-setting={tile.key}
                      className="flex min-w-0 items-center gap-3 border border-[var(--border)] p-3"
                      onDragOver={(event) => {
                        if (
                          dragged.current &&
                          columnTiles.some((item) => item.key === dragged.current) &&
                          !saving
                        )
                          event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (dragged.current) move(dragged.current, tile.key);
                        dragged.current = null;
                      }}
                    >
                      <button
                        type="button"
                        draggable={!saving}
                        aria-label={labels.drag(label)}
                        className="cursor-grab p-2 text-[var(--ink-dim)]"
                        onDragStart={(event) => {
                          dragged.current = tile.key;
                          event.dataTransfer.setData('text/plain', tile.key);
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => {
                          dragged.current = null;
                        }}
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <span className="text-sm tabular-nums">{index + 1}.</span>
                      <span className="min-w-0 flex-1 text-sm">{label}</span>
                      <button
                        type="button"
                        aria-label={labels.moveUp(label)}
                        disabled={index === 0}
                        onClick={() => move(tile.key, columnTiles[index - 1].key)}
                        className="p-2 disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={labels.moveDown(label)}
                        disabled={index === columnTiles.length - 1}
                        onClick={() => move(tile.key, columnTiles[index + 1].key)}
                        className="p-2 disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink-dim)]">{labels.preview}</p>
          <div
            aria-label={labels.preview}
            data-testid="dashboard-layout-preview"
            className="grid grid-cols-3 items-start gap-5"
          >
            {STUDENT_DASHBOARD_COLUMNS.map((column) => (
              <div
                key={column}
                data-preview-column={column}
                className={
                  column === 'left'
                    ? 'col-span-1 flex min-w-0 flex-col gap-5'
                    : 'col-span-2 flex min-w-0 flex-col gap-5'
                }
              >
                {tiles
                  .filter((tile) => tile.desktopColumn === column)
                  .map((tile) => (
                    <div
                      key={tile.key}
                      data-preview-tile={tile.key}
                      className="w-full min-w-0 break-words border border-[var(--border)] bg-[var(--surface-card)] p-3 text-xs text-[var(--ink)]"
                    >
                      {tile.label[labels.lang]}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!dirty}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-40"
            onClick={() => void save()}
          >
            {saving ? labels.saving : labels.save}
          </button>
          <button
            type="button"
            disabled={!dirty}
            className="btn-secondary px-4 py-2 text-sm disabled:opacity-40"
            onClick={() => {
              setDraftOverride(null);
              setMessage(null);
            }}
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-sm"
            onClick={() =>
              updateDraft(normalizeStudentDashboardLayout(DEFAULT_STUDENT_DASHBOARD_LAYOUT))
            }
          >
            {labels.reset}
          </button>
        </div>
      </fieldset>
      {message && (
        <p
          className="mt-3 text-sm text-[var(--ink)]"
          role={message === 'error' ? 'alert' : 'status'}
        >
          {labels[message]}
        </p>
      )}
    </AdminCollapsibleSection>
  );
}
