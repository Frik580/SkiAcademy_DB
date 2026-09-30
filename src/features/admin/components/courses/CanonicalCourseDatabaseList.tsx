import React from 'react';
import { Copy, Edit2, Eye, EyeOff, Info, RotateCcw, Trash2, ArrowDown, ArrowUp } from 'lucide-react';
import type { Course, Instructor } from '../../../../types';
import {
  translateCourse,
  translateInstructorName,
  type Language,
  type TranslationKey,
} from '../../../../app/providers/LanguageContext';

interface CanonicalCourseDatabaseListProps {
  courses: Course[];
  instructors: Instructor[];
  language: Language;
  t: (key: TranslationKey) => string;
  selectedCourseId?: string | null;
  onToggleVisibility: (course: Course) => void;
  onEdit: (course: Course) => void;
  onView?: (course: Course) => void;
  onDelete: (course: Course) => void;
  onReactivate?: (course: Course) => void;
  onClone: (course: Course) => void;
  onMove: (course: Course, direction: 'up' | 'down') => void;
  archiveInsteadOfDelete?: boolean;
  canToggleVisibility?: (course: Course) => boolean;
  canEdit?: (course: Course) => boolean;
  canView?: (course: Course) => boolean;
  canArchive?: (course: Course) => boolean;
  canReactivate?: (course: Course) => boolean;
  canClone?: (course: Course) => boolean;
  canMove?: (course: Course) => boolean;
  detailsLabel?: string;
  reactivateLabel?: string;
}

export const CanonicalCourseDatabaseList: React.FC<CanonicalCourseDatabaseListProps> = ({
  courses,
  instructors,
  language,
  t,
  selectedCourseId,
  onToggleVisibility,
  onEdit,
  onView,
  onDelete,
  onReactivate,
  onClone,
  onMove,
  archiveInsteadOfDelete = false,
  canToggleVisibility,
  canEdit,
  canView,
  canArchive,
  canReactivate,
  canClone,
  canMove,
  detailsLabel = 'Details',
  reactivateLabel = 'Restore',
}) => {
  const sorted = [...courses].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 999;
    const orderB = b.order !== undefined ? b.order : 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });

  const quietAction =
    'inline-flex h-6 w-6 items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)] disabled:opacity-30';

  return (
    <ul className="divide-y divide-[var(--border)]">
      {sorted.map((course, idx) => {
        const translated = translateCourse(course, language);
        const lead = course.instructorIds
          ?.map((id) => instructors.find((instructor) => instructor.id === id)?.name)
          .filter((name): name is string => Boolean(name))
          .slice(0, 1)
          .map((name) => translateInstructorName(name, language))
          .join('');
        const selected = selectedCourseId === course.id;
        const occupied = Math.max(0, course.totalSeats - course.availableSeats);
        const secondary = [translated.dates, lead].filter(Boolean).join(' · ');
        return (
          <li key={course.id}>
            <div
              className={`group px-3 py-2.5 ${
                selected ? 'bg-[var(--accent-muted)] shadow-[inset_3px_0_0_var(--accent)]' : ''
              }`}
            >
              <button
                type="button"
                className="grid w-full grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-x-3 text-left"
                onClick={() => onView?.(course)}
              >
                <span className="truncate text-sm font-semibold text-[var(--ink)]">{translated.title}</span>
                <span className="text-right font-mono text-xs text-[var(--ink)]">
                  {course.priceKZT != null ? `${course.priceKZT.toLocaleString()} ₸` : '—'}
                </span>
                <span className="truncate text-[11px] text-[var(--ink-dim)]">{secondary || '—'}</span>
                <span className="text-right text-[10px] text-[var(--ink-dim)]">
                  {occupied}/{course.totalSeats}
                </span>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-0.5 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100">
                {canView?.(course) && onView ? (
                  <button
                    type="button"
                    className={quietAction}
                    title={detailsLabel}
                    aria-label={detailsLabel}
                    onClick={() => onView(course)}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canToggleVisibility?.(course) ? (
                  <button
                    type="button"
                    className={quietAction}
                    title={course.isHidden ? t('showCourse') : t('hideCourse')}
                    aria-label={course.isHidden ? t('showCourse') : t('hideCourse')}
                    onClick={() => onToggleVisibility(course)}
                  >
                    {course.isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
                {canEdit?.(course) ? (
                  <button
                    type="button"
                    className={quietAction}
                    title={t('editCourse')}
                    aria-label={t('editCourse')}
                    onClick={() => onEdit(course)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canClone?.(course) ? (
                  <button
                    type="button"
                    className={quietAction}
                    title={t('cloneCourse')}
                    aria-label={t('cloneCourse')}
                    onClick={() => onClone(course)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canArchive?.(course) ? (
                  <button
                    type="button"
                    className={quietAction}
                    title={archiveInsteadOfDelete ? t('archiveCourse') : t('deleteCourse')}
                    aria-label={archiveInsteadOfDelete ? t('archiveCourse') : t('deleteCourse')}
                    onClick={() => onDelete(course)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canReactivate?.(course) && onReactivate ? (
                  <button
                    type="button"
                    className={quietAction}
                    title={reactivateLabel}
                    aria-label={reactivateLabel}
                    onClick={() => onReactivate(course)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canMove?.(course) ? (
                  <>
                    <button
                      type="button"
                      className={quietAction}
                      title={t('moveUp')}
                      aria-label={t('moveUp')}
                      disabled={idx === 0}
                      onClick={() => onMove(course, 'up')}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={quietAction}
                      title={t('moveDown')}
                      aria-label={t('moveDown')}
                      disabled={idx === sorted.length - 1}
                      onClick={() => onMove(course, 'down')}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
