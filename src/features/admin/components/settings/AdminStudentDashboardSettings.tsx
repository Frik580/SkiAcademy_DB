import { compactStudentDashboardLanes } from '../../../settings/studentDashboardVerticalLayout';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, LayoutDashboard } from 'lucide-react';
import { useProfileStore } from '../../../profile/profileStore';
import { useSettingsStore } from '../../../settings/settingsStore';
import {
  DASHBOARD_TILE_COLUMNS,
  DASHBOARD_TILE_SIZES,
  DEFAULT_STUDENT_DASHBOARD_LAYOUT,
  getOrderedDashboardTiles,
  isDashboardTileSize,
  normalizeStudentDashboardLayout,
  validateStudentDashboardLayout,
  type StudentDashboardLayout,
  type StudentDashboardTileKey,
} from '../../../settings/studentDashboardLayout';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';
import { useStudentDashboardSettingsTranslations } from './useStudentDashboardSettingsTranslations';
import {
  getNextDashboardTileSize,
  resolveStudentDashboardDesktopLayout,
} from '../../../settings/studentDashboardDesktopLayout';

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
  const move = (key: StudentDashboardTileKey, target: number) => {
    if (saving || target < 0 || target >= draft.order.length) return;
    const order = draft.order.filter((item) => item !== key);
    order.splice(target, 0, key);
    updateDraft({ ...draft, order });
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
  const previewRows = resolveStudentDashboardDesktopLayout(draft, draft.order);
  const demoHeights = Object.fromEntries(
    draft.order.map((key, index) => [key, 110 + (index % 3) * 32])
  );
  const previewLayout = compactStudentDashboardLanes(previewRows, demoHeights);
  const preview = previewLayout.placements;

  return (
    <AdminCollapsibleSection
      id="student_dashboard_layout"
      title={labels.title}
      subtitle={labels.description}
      icon={LayoutDashboard}
    >
      <fieldset disabled={saving} className="min-w-0 space-y-5">
        <legend className="sr-only">{labels.title}</legend>
        <p className="text-sm text-[var(--ink-dim)]">{labels.autoGrowDescription}</p>
        <ol aria-label={labels.title} className="space-y-2">
          {tiles.map((tile, index) => {
            const label = tile.label[labels.lang];
            const size = draft.tiles[tile.key].desktopSize;
            return (
              <li
                key={tile.key}
                data-layout-setting={tile.key}
                className="flex min-w-0 flex-wrap items-center gap-3 border border-[var(--border)] p-3"
                onDragOver={(event) => {
                  if (dragged.current && !saving) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged.current) move(dragged.current, index);
                  dragged.current = null;
                }}
              >
                <button
                  type="button"
                  draggable={!saving}
                  aria-label={labels.drag(label)}
                  title={labels.drag(label)}
                  className="cursor-grab p-2 text-[var(--ink-dim)] active:cursor-grabbing"
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
                <span className="text-sm tabular-nums text-[var(--ink-dim)]">{index + 1}.</span>
                <span className="min-w-0 flex-1 text-sm text-[var(--ink)]">{label}</span>
                <label
                  htmlFor={`dashboard-size-${tile.key}`}
                  className="flex items-center gap-2 text-xs text-[var(--ink-dim)]"
                >
                  {labels.size}
                  <select
                    id={`dashboard-size-${tile.key}`}
                    aria-label={`${labels.size}: ${label}`}
                    value={size}
                    className="border border-[var(--border)] bg-[var(--surface-card)] p-2 text-[var(--ink)]"
                    onChange={(event) => {
                      const desktopSize = event.target.value;
                      if (isDashboardTileSize(desktopSize))
                        updateDraft({
                          ...draft,
                          tiles: {
                            ...draft.tiles,
                            [tile.key]: { ...draft.tiles[tile.key], desktopSize },
                          },
                        });
                    }}
                  >
                    {DASHBOARD_TILE_SIZES.map((value) => (
                      <option key={value} value={value}>
                        {labels.sizeLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="w-10 text-xs tabular-nums text-[var(--ink-dim)]">
                  {DASHBOARD_TILE_COLUMNS[size]}/12
                </span>
                <label
                  htmlFor={`dashboard-grow-${tile.key}`}
                  className="flex max-w-full items-center gap-2 text-xs text-[var(--ink-dim)]"
                >
                  <input
                    id={`dashboard-grow-${tile.key}`}
                    type="checkbox"
                    aria-label={`${labels.autoGrow}: ${label}`}
                    aria-describedby={`dashboard-grow-help-${tile.key}`}
                    checked={draft.tiles[tile.key].allowAutoGrow}
                    disabled={size === 'full'}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        tiles: {
                          ...draft.tiles,
                          [tile.key]: {
                            ...draft.tiles[tile.key],
                            allowAutoGrow: event.target.checked,
                          },
                        },
                      })
                    }
                  />
                  {labels.autoGrow}
                  <span id={`dashboard-grow-help-${tile.key}`} title={labels.autoGrowDescription}>
                    {size === 'full'
                      ? labels.fullWidth
                      : labels.autoGrowLimit(getNextDashboardTileSize(size))}
                  </span>
                </label>
                <button
                  type="button"
                  aria-label={labels.moveUp(label)}
                  disabled={index === 0}
                  onClick={() => move(tile.key, index - 1)}
                  className="p-2 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={labels.moveDown(label)}
                  disabled={index === tiles.length - 1}
                  onClick={() => move(tile.key, index + 1)}
                  className="p-2 disabled:opacity-30"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ol>
        <div className="space-y-2">
          <p className="text-sm text-[var(--ink-dim)]">{labels.preview}</p>
          <div
            aria-label={labels.preview}
            data-testid="dashboard-layout-preview"
            className="relative grid grid-cols-12 gap-x-2"
            style={{ height: previewLayout.height }}
          >
            {preview.map((placement) => {
              const tile = tiles.find((tile) => tile.key === placement.key)!;
              const columns = DASHBOARD_TILE_COLUMNS[placement.effectiveSize];
              return (
                <div
                  key={tile.key}
                  data-preview-tile={tile.key}
                  data-base-size={placement.baseSize}
                  data-effective-size={placement.effectiveSize}
                  data-preview-lane={placement.lane}
                  style={{
                    gridColumn: `${placement.column} / span ${columns}`,
                    gridRow: 1,
                    position: 'absolute',
                    top: placement.top,
                    height: placement.height,
                  }}
                  className="w-full min-w-0 break-words border border-[var(--border)] bg-[var(--surface-card)] p-3 text-xs text-[var(--ink)]"
                >
                  {tile.label[labels.lang]}{' '}
                  <span className="text-[var(--ink-dim)]">
                    {labels.sizeLabel(placement.baseSize)}
                    {placement.wasAutoGrown && ` → ${labels.sizeLabel(placement.effectiveSize)}`}
                  </span>
                </div>
              );
            })}
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
