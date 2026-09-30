import React from 'react';
import type { AdminCourseReadModel } from '@ski-academy/shared-domain';
import { Plus } from 'lucide-react';
import { ActionButton } from '../../../../ui/ActionButton';
import { localDateTimeFromTimestamp } from '../../operations/adminTimeZone';
import { formatAdminCourseDayLocalDate } from './adminCourseTableMapping';
import { AdminCourseStatusChip, adminRecordCardClass } from './adminCourseSurface';
import {
  CanonicalCourseDayForm,
  type CourseDayDraft,
  type CourseDayRecord,
} from './CanonicalCourseDayForm';

interface InstructorChoice {
  readonly id: string;
  readonly name: string;
  readonly inactive: boolean;
}

interface CanonicalCourseDaysEditorProps {
  course: AdminCourseReadModel;
  language: string;
  draft: CourseDayDraft | null;
  pending: boolean;
  pendingLabel: string;
  instructors: readonly InstructorChoice[];
  dayIssue: { readonly courseDayId?: string; readonly message: string } | null;
  emptyLabel: string;
  onDraftChange: (draft: CourseDayDraft | null) => void;
  onSubmit: (event: React.FormEvent) => void;
  onRemove: (day: CourseDayRecord) => void;
}

function durationMinutes(day: CourseDayRecord): number {
  return Math.max(
    15,
    Math.round((day.interval.endsAt.seconds - day.interval.startsAt.seconds) / 60)
  );
}

function endTime(start: string, minutes: number): string {
  const [hour, minute] = start.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return start;
  const total = hour * 60 + minute + minutes;
  const endHour = Math.floor(total / 60) % 24;
  const endMinute = total % 60;
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
}

function draftFromDay(day: CourseDayRecord, kind: CourseDayDraft['kind']): CourseDayDraft {
  const local = localDateTimeFromTimestamp(day.interval.startsAt.seconds, day.timeZone);
  return {
    kind,
    courseDayId: day.courseDayId,
    localDate: local.date,
    localTime: local.time,
    endTime: endTime(local.time, durationMinutes(day)),
    instructorId: day.actualInstructorIds[0] ?? '',
  };
}

function formatDurationHours(minutes: number, ru: boolean): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  const text = Number.isInteger(hours)
    ? String(hours)
    : hours.toFixed(1).replace('.', ru ? ',' : '.');
  return ru ? `${text} ч` : `${text} h`;
}

function weekdayLabel(day: CourseDayRecord, language: string): string {
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru' : 'en', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: day.timeZone,
  }).format(new Date(day.interval.startsAt.seconds * 1000));
}

const CanonicalCourseDayActions: React.FC<{
  language: string;
  canEdit: boolean;
  onEdit: () => void;
}> = ({ language, canEdit, onEdit }) => {
  if (!canEdit) return null;
  const ru = language === 'ru';
  return (
    <div className="flex items-center justify-end">
      <button type="button" className="text-xs text-[var(--ink)] hover:underline" onClick={onEdit}>
        {ru ? 'Редактировать' : 'Edit'}
      </button>
    </div>
  );
};

export const CanonicalCourseDaysEditor: React.FC<CanonicalCourseDaysEditorProps> = ({
  course,
  language,
  draft,
  pending,
  pendingLabel,
  instructors,
  dayIssue,
  emptyLabel,
  onDraftChange,
  onSubmit,
  onRemove,
}) => {
  const ru = language === 'ru';
  const can = (kind: AdminCourseReadModel['authorizedActions'][number]['kind']) =>
    course.authorizedActions.some((action) => action.kind === kind);
  const canEditDay = can('reschedule_course_day') || can('reassign_course_day_instructor');
  const nameFor = (id: string) => instructors.find((instructor) => instructor.id === id)?.name ?? id;
  const inactive = (id: string) =>
    instructors.find((instructor) => instructor.id === id)?.inactive === true;
  const issueFor = (day: CourseDayRecord) =>
    dayIssue?.courseDayId === day.courseDayId ? dayIssue.message : undefined;
  const unmatchedIssue =
    dayIssue && !course.courseDays.some((day) => day.courseDayId === dayIssue.courseDayId)
      ? dayIssue.message
      : undefined;
  const ordered = [...course.courseDays].sort((left, right) => left.dayOrder - right.dayOrder);
  const editingDay = draft?.courseDayId
    ? ordered.find((day) => day.courseDayId === draft.courseDayId)
    : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[var(--ink)]">
            {ru ? 'Редактор дней курса' : 'Course day editor'}
          </h4>
          <p className="text-[11px] text-[var(--ink-dim)]">
            {ru
              ? `${ordered.length} дн.`
              : `${ordered.length} day${ordered.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {can('create_course_day') ? (
          <ActionButton
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              onDraftChange({
                kind: 'create_course_day',
                localDate: '',
                localTime: '',
                endTime: '',
                instructorId: course.instructorRosterIds[0] ?? '',
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            {ru ? 'Добавить день' : 'Add day'}
          </ActionButton>
        ) : null}
      </div>

      {draft ? (
        <CanonicalCourseDayForm
          draft={draft}
          language={language}
          pending={pending}
          pendingLabel={pendingLabel}
          instructors={instructors}
          alertMessage={unmatchedIssue}
          removeLabel={
            editingDay && can('remove_course_day')
              ? ru
                ? `Удалить день ${editingDay.dayOrder}`
                : `Remove day ${editingDay.dayOrder}`
              : undefined
          }
          onChange={onDraftChange}
          onSubmit={onSubmit}
          onCancel={() => onDraftChange(null)}
          onRemove={
            editingDay && can('remove_course_day') ? () => onRemove(editingDay) : undefined
          }
        />
      ) : null}

      {ordered.length === 0 ? (
        <p className="border border-dashed border-[var(--border)] p-8 text-center text-xs text-[var(--ink-dim)]">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {ordered.map((day) => (
            <DayLine
              key={day.courseDayId}
              day={day}
              language={language}
              canEdit={canEditDay}
              instructorName={day.actualInstructorIds.map(nameFor).join(', ')}
              instructorInactive={day.actualInstructorIds.some(inactive)}
              issue={issueFor(day)}
              onEdit={() =>
                onDraftChange(
                  draftFromDay(
                    day,
                    can('reschedule_course_day')
                      ? 'reschedule_course_day'
                      : 'reassign_course_day_instructor'
                  )
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DayLine: React.FC<{
  day: CourseDayRecord;
  language: string;
  canEdit: boolean;
  instructorName: string;
  instructorInactive: boolean;
  issue?: string;
  onEdit: () => void;
}> = ({ day, language, canEdit, instructorName, instructorInactive, issue, onEdit }) => {
  const ru = language === 'ru';
  const local = localDateTimeFromTimestamp(day.interval.startsAt.seconds, day.timeZone);
  const minutes = durationMinutes(day);
  const range = `${local.time}–${endTime(local.time, minutes)}`;
  const status = issue
    ? ru
      ? 'Конфликт'
      : 'Conflict'
    : instructorInactive
      ? ru
        ? 'Инструктор недоступен'
        : 'Instructor unavailable'
      : ru
        ? 'Запланирован'
        : 'Scheduled';
  return (
    <article className={`${adminRecordCardClass} space-y-2 border-l-transparent`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h5 className="text-sm font-semibold text-[var(--ink)]">
              {ru ? `День ${day.dayOrder}` : `Day ${day.dayOrder}`}
            </h5>
            <span className="text-xs text-[var(--ink)]">{formatAdminCourseDayLocalDate(day)}</span>
            <span className="text-xs text-[var(--ink-dim)]">{weekdayLabel(day, language)}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--ink)]">
            {range}
            <span className="ml-3 text-[var(--ink-dim)]">{formatDurationHours(minutes, ru)}</span>
          </p>
          <p className="mt-1 break-words text-xs text-[var(--ink-dim)]">{instructorName}</p>
          <p className="font-mono text-[10px] text-[var(--ink-dim)]">{day.courseDayId}</p>
        </div>
        <AdminCourseStatusChip tone={issue || instructorInactive ? 'attention' : 'info'}>
          {status}
        </AdminCourseStatusChip>
      </div>
      {issue ? (
        <p role="alert" className="text-xs text-amber-500">
          {issue}
        </p>
      ) : null}
      <CanonicalCourseDayActions language={language} canEdit={canEdit} onEdit={onEdit} />
    </article>
  );
};
