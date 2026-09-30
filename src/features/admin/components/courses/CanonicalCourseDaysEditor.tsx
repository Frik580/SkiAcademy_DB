import React, { useState } from 'react';
import type { AdminCourseReadModel } from '@ski-academy/shared-domain';
import { Ellipsis, Plus } from 'lucide-react';
import { localDateTimeFromTimestamp } from '../../operations/adminTimeZone';
import { formatAdminCourseDayLocalDate } from './adminCourseTableMapping';
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

function draftFromDay(
  day: CourseDayRecord,
  kind: CourseDayDraft['kind']
): CourseDayDraft {
  const local = localDateTimeFromTimestamp(day.interval.startsAt.seconds, day.timeZone);
  return {
    kind,
    courseDayId: day.courseDayId,
    localDate: local.date,
    localTime: local.time,
    durationMinutes: String(durationMinutes(day)),
    instructorId: day.actualInstructorIds[0] ?? '',
  };
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
  day: CourseDayRecord;
  language: string;
  pending: boolean;
  canReschedule: boolean;
  canReassign: boolean;
  canRemove: boolean;
  compact: boolean;
  onEdit: () => void;
  onReassign: () => void;
  onReschedule: () => void;
  onRemove: () => void;
}> = ({
  day,
  language,
  pending,
  canReschedule,
  canReassign,
  canRemove,
  compact,
  onEdit,
  onReassign,
  onReschedule,
  onRemove,
}) => {
  const [open, setOpen] = useState(false);
  const ru = language === 'ru';
  const order = day.dayOrder;
  const rescheduleLabel = ru ? `Перенести день ${order}` : `Reschedule day ${order}`;
  const instructorLabel = ru ? `Инструктор дня ${order}` : `Day ${order} instructor`;
  const removeLabel = ru ? `Удалить день ${order}` : `Remove day ${order}`;
  const menuHasItems = canReschedule || canRemove || (compact && canReassign);
  return (
    <div className="flex items-center justify-end gap-2">
      {canReschedule && !compact ? (
        <button type="button" className="text-xs text-[var(--ink)] hover:underline" onClick={onEdit}>
          {ru ? 'Редактировать' : 'Edit'}
        </button>
      ) : null}
      {canReassign && !compact ? (
        <button
          type="button"
          className="text-xs text-[var(--ink-dim)] hover:text-[var(--ink)]"
          aria-label={instructorLabel}
          onClick={onReassign}
        >
          {ru ? 'Сменить инструктора' : 'Change instructor'}
        </button>
      ) : null}
      {menuHasItems ? (
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center text-[var(--ink-dim)] hover:text-[var(--ink)]"
            aria-label={ru ? `Действия дня ${order}` : `Day ${order} actions`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <Ellipsis className="h-4 w-4" />
          </button>
          {open ? (
            <div className="absolute right-0 z-20 mt-1 min-w-44 border border-[var(--border)] bg-[var(--card-bg)] py-1 shadow-lg">
              {compact && canReschedule ? (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--surface)]"
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                >
                  {ru ? 'Редактировать' : 'Edit'}
                </button>
              ) : null}
              {compact && canReassign ? (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--surface)]"
                  aria-label={instructorLabel}
                  onClick={() => {
                    setOpen(false);
                    onReassign();
                  }}
                >
                  {ru ? 'Сменить инструктора' : 'Change instructor'}
                </button>
              ) : null}
              {canReschedule ? (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--surface)]"
                  onClick={() => {
                    setOpen(false);
                    onReschedule();
                  }}
                >
                  {rescheduleLabel}
                </button>
              ) : null}
              {canRemove ? (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-[var(--surface)]"
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    onRemove();
                  }}
                >
                  {removeLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
  const compact = course.courseDays.length >= 3;
  const can = (kind: AdminCourseReadModel['authorizedActions'][number]['kind']) =>
    course.authorizedActions.some((action) => action.kind === kind);
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
          <button
            type="button"
            className="ui-btn inline-flex items-center gap-1"
            onClick={() =>
              onDraftChange({
                kind: 'create_course_day',
                localDate: '',
                localTime: '',
                durationMinutes: '120',
                instructorId: course.instructorRosterIds[0] ?? '',
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            {ru ? 'Добавить день' : 'Add day'}
          </button>
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
          onChange={onDraftChange}
          onSubmit={onSubmit}
          onCancel={() => onDraftChange(null)}
        />
      ) : null}

      {ordered.length === 0 ? (
        <p className="text-xs text-[var(--ink-dim)]">{emptyLabel}</p>
      ) : compact ? (
        <div className="text-xs">
          <div>
            <div className="hidden gap-2 py-1 text-[10px] uppercase tracking-wide text-[var(--ink-dim)] md:grid md:grid-cols-[2.5rem_6.5rem_8rem_5.5rem_minmax(8rem,1fr)_7rem_2.5rem]">
              <span>{ru ? 'День' : 'Day'}</span>
              <span>{ru ? 'Дата' : 'Date'}</span>
              <span>{ru ? 'Время' : 'Time'}</span>
              <span>{ru ? 'Длительность' : 'Duration'}</span>
              <span>{ru ? 'Инструктор' : 'Instructor'}</span>
              <span>{ru ? 'Статус' : 'Status'}</span>
              <span className="sr-only">{ru ? 'Действия' : 'Actions'}</span>
            </div>
            {ordered.map((day) => (
              <DayLine
                key={day.courseDayId}
                day={day}
                language={language}
                compact
                pending={pending}
                canReschedule={can('reschedule_course_day')}
                canReassign={can('reassign_course_day_instructor')}
                canRemove={can('remove_course_day')}
                instructorName={day.actualInstructorIds.map(nameFor).join(', ')}
                instructorInactive={day.actualInstructorIds.some(inactive)}
                issue={issueFor(day)}
                onEdit={() => onDraftChange(draftFromDay(day, 'reschedule_course_day'))}
                onReassign={() =>
                  onDraftChange(draftFromDay(day, 'reassign_course_day_instructor'))
                }
                onReschedule={() => onDraftChange(draftFromDay(day, 'reschedule_course_day'))}
                onRemove={() => onRemove(day)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {ordered.map((day) => (
            <DayLine
              key={day.courseDayId}
              day={day}
              language={language}
              compact={false}
              pending={pending}
              canReschedule={can('reschedule_course_day')}
              canReassign={can('reassign_course_day_instructor')}
              canRemove={can('remove_course_day')}
              instructorName={day.actualInstructorIds.map(nameFor).join(', ')}
              instructorInactive={day.actualInstructorIds.some(inactive)}
              issue={issueFor(day)}
              onEdit={() => onDraftChange(draftFromDay(day, 'reschedule_course_day'))}
              onReassign={() => onDraftChange(draftFromDay(day, 'reassign_course_day_instructor'))}
              onReschedule={() => onDraftChange(draftFromDay(day, 'reschedule_course_day'))}
              onRemove={() => onRemove(day)}
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
  compact: boolean;
  pending: boolean;
  canReschedule: boolean;
  canReassign: boolean;
  canRemove: boolean;
  instructorName: string;
  instructorInactive: boolean;
  issue?: string;
  onEdit: () => void;
  onReassign: () => void;
  onReschedule: () => void;
  onRemove: () => void;
}> = ({
  day,
  language,
  compact,
  pending,
  canReschedule,
  canReassign,
  canRemove,
  instructorName,
  instructorInactive,
  issue,
  onEdit,
  onReassign,
  onReschedule,
  onRemove,
}) => {
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
  const actions = (
    <CanonicalCourseDayActions
      day={day}
      language={language}
      pending={pending}
      canReschedule={canReschedule}
      canReassign={canReassign}
      canRemove={canRemove}
      compact={compact}
      onEdit={onEdit}
      onReassign={onReassign}
      onReschedule={onReschedule}
      onRemove={onRemove}
    />
  );
  if (compact) {
    return (
      <div className="grid grid-cols-1 gap-1 border-t border-[var(--border)] py-2 md:grid-cols-[2.5rem_6.5rem_8rem_5.5rem_minmax(8rem,1fr)_7rem_2.5rem] md:items-center md:gap-2">
        <span>{day.dayOrder}</span>
        <span>
          <span className="block">{formatAdminCourseDayLocalDate(day)}</span>
          <span className="block font-mono text-[10px] text-[var(--ink-dim)]">{day.courseDayId}</span>
        </span>
        <span>{range}</span>
        <span>{ru ? `${minutes} мин` : `${minutes} min`}</span>
        <span className="truncate">{instructorName}</span>
        <span className={issue || instructorInactive ? 'text-amber-500' : 'text-[var(--ink-dim)]'}>
          {status}
          {issue ? (
            <span role="alert" className="mt-0.5 block normal-case tracking-normal text-amber-500">
              {issue}
            </span>
          ) : null}
        </span>
        {actions}
      </div>
    );
  }
  return (
    <article className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h5 className="text-sm font-semibold text-[var(--ink)]">
              {ru ? `День ${day.dayOrder}` : `Day ${day.dayOrder}`}
            </h5>
            <span className="text-xs text-[var(--ink)]">{formatAdminCourseDayLocalDate(day)}</span>
            <span className="text-xs text-[var(--ink-dim)]">{weekdayLabel(day, language)}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--ink)]">
            {range}
            <span className="ml-3 text-[var(--ink-dim)]">{ru ? `${minutes} мин` : `${minutes} min`}</span>
          </p>
          <p className="mt-1 text-xs text-[var(--ink-dim)]">{instructorName}</p>
          <p className="font-mono text-[10px] text-[var(--ink-dim)]">{day.courseDayId}</p>
        </div>
        <span className={`text-[11px] ${issue || instructorInactive ? 'text-amber-500' : 'text-[var(--ink-dim)]'}`}>
          {status}
        </span>
      </div>
      {issue ? (
        <p role="alert" className="text-xs text-amber-500">
          {issue}
        </p>
      ) : null}
      {actions}
    </article>
  );
};
