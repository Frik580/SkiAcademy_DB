import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  Edit2,
  Ellipsis,
  Eye,
  EyeOff,
  Info,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type { Course, Instructor } from '../../../../types';
import {
  translateCourse,
  translateInstructorName,
  type Language,
  type TranslationKey,
} from '../../../../app/providers/LanguageContext';
import { ActionButton } from '../../../../ui/ActionButton';
import { AdminCourseStatusChip, adminRecordCardClass } from './adminCourseSurface';

interface CanonicalCourseDatabaseListProps {
  courses: Course[];
  instructors: Instructor[];
  language: Language;
  t: (key: TranslationKey) => string;
  selectedCourseId?: string | null;
  lifecycle: 'active' | 'archived';
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
  actionsLabel?: string;
}

const menuItemClass =
  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--ink)] hover:bg-[var(--accent-muted)] disabled:opacity-40';

export const CanonicalCourseDatabaseList: React.FC<CanonicalCourseDatabaseListProps> = ({
  courses,
  instructors,
  language,
  t,
  selectedCourseId,
  lifecycle,
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
  actionsLabel = 'Course actions',
}) => {
  const sorted = [...courses].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 999;
    const orderB = b.order !== undefined ? b.order : 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  });
  const ru = language === 'ru';

  return (
    <div className="space-y-2">
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
        const full = course.availableSeats <= 0;
        const secondary = [translated.dates, lead].filter(Boolean).join(' · ');
        const archiveLabel = archiveInsteadOfDelete ? t('archiveCourse') : t('deleteCourse');
        return (
          <article
            key={course.id}
            data-admin-course-row
            className={`${adminRecordCardClass} border-l-transparent ${
              full ? 'border-l-amber-500 bg-amber-500/[0.055]' : ''
            } ${selected ? 'ring-1 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]' : ''}`}
          >
            <button
              type="button"
              className="group w-full text-left"
              onClick={() => onView?.(course)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-[var(--ink)]">
                    {translated.title}
                  </p>
                  {secondary ? (
                    <p className="mt-1 break-words text-xs text-[var(--ink-dim)]">{secondary}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--ink-dim)]">
                    <span className="font-mono font-medium text-[var(--ink)]">
                      {course.priceKZT != null ? `${course.priceKZT.toLocaleString()} ₸` : '—'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {occupied}/{course.totalSeats}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-dim)] transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <AdminCourseStatusChip tone={lifecycle === 'archived' ? 'archived' : 'active'}>
                {lifecycle === 'archived' ? (ru ? 'Архив' : 'Archived') : ru ? 'Активный' : 'Active'}
              </AdminCourseStatusChip>
              {full ? (
                <AdminCourseStatusChip tone="attention">
                  {ru ? 'Мест нет' : 'Full'}
                </AdminCourseStatusChip>
              ) : null}
              {course.isHidden && lifecycle !== 'archived' ? (
                <AdminCourseStatusChip tone="neutral">{t('hiddenLabel')}</AdminCourseStatusChip>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-1">
                {canView?.(course) && onView ? (
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)]"
                    title={detailsLabel}
                    aria-label={detailsLabel}
                    onClick={() => onView(course)}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canEdit?.(course) ? (
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)]"
                    title={t('editCourse')}
                    aria-label={t('editCourse')}
                    onClick={() => onEdit(course)}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {canReactivate?.(course) && onReactivate ? (
                  <ActionButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    title={reactivateLabel}
                    aria-label={reactivateLabel}
                    onClick={() => onReactivate(course)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {reactivateLabel}
                  </ActionButton>
                ) : null}
                <CourseRowMenu
                  label={actionsLabel}
                  items={[
                    canToggleVisibility?.(course)
                      ? {
                          key: 'visibility',
                          label: course.isHidden ? t('showCourse') : t('hideCourse'),
                          icon: course.isHidden ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          ),
                          onClick: () => onToggleVisibility(course),
                        }
                      : null,
                    canClone?.(course)
                      ? {
                          key: 'clone',
                          label: t('cloneCourse'),
                          icon: <Copy className="h-3.5 w-3.5" />,
                          onClick: () => onClone(course),
                        }
                      : null,
                    canArchive?.(course)
                      ? {
                          key: 'archive',
                          label: archiveLabel,
                          destructive: true,
                          icon: <Trash2 className="h-3.5 w-3.5" />,
                          onClick: () => onDelete(course),
                        }
                      : null,
                    canMove?.(course)
                      ? {
                          key: 'up',
                          label: t('moveUp'),
                          disabled: idx === 0,
                          icon: <ArrowUp className="h-3.5 w-3.5" />,
                          onClick: () => onMove(course, 'up'),
                        }
                      : null,
                    canMove?.(course)
                      ? {
                          key: 'down',
                          label: t('moveDown'),
                          disabled: idx === sorted.length - 1,
                          icon: <ArrowDown className="h-3.5 w-3.5" />,
                          onClick: () => onMove(course, 'down'),
                        }
                      : null,
                  ]}
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

function CourseRowMenu({
  label,
  items,
}: {
  readonly label: string;
  readonly items: ReadonlyArray<
    | {
        readonly key: string;
        readonly label: string;
        readonly icon?: React.ReactNode;
        readonly destructive?: boolean;
        readonly disabled?: boolean;
        readonly onClick: () => void;
      }
    | null
  >;
}) {
  const [open, setOpen] = useState(false);
  const visible = items.filter((item): item is NonNullable<typeof item> => item !== null);
  if (visible.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)]"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-44 border border-[var(--border)] bg-[var(--card-bg)] py-1 shadow-lg">
          {visible.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${menuItemClass} ${item.destructive ? 'text-rose-700 dark:text-rose-300' : ''}`}
              title={item.label}
              aria-label={item.label}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
