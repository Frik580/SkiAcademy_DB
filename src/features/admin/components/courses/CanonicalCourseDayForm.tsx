import React from 'react';
import type { AdminCourseReadModel } from '@ski-academy/shared-domain';
import { ActionButton } from '../../../../ui/ActionButton';

export interface CourseDayDraft {
  readonly kind: 'create_course_day' | 'reassign_course_day_instructor' | 'reschedule_course_day';
  readonly courseDayId?: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly durationMinutes: string;
  readonly instructorId: string;
}

interface InstructorChoice {
  readonly id: string;
  readonly name: string;
  readonly inactive: boolean;
}

interface CanonicalCourseDayFormProps {
  draft: CourseDayDraft;
  language: string;
  pending: boolean;
  pendingLabel: string;
  instructors: readonly InstructorChoice[];
  alertMessage?: string;
  onChange: (draft: CourseDayDraft) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}

export const CanonicalCourseDayForm: React.FC<CanonicalCourseDayFormProps> = ({
  draft,
  language,
  pending,
  pendingLabel,
  instructors,
  alertMessage,
  onChange,
  onSubmit,
  onCancel,
}) => {
  const ru = language === 'ru';
  const heading =
    draft.kind === 'create_course_day'
      ? ru
        ? 'Новый день'
        : 'New day'
      : draft.kind === 'reassign_course_day_instructor'
        ? ru
          ? 'Сменить инструктора'
          : 'Change instructor'
        : ru
          ? 'Перенести день'
          : 'Reschedule day';
  return (
    <form className="grid max-w-xl gap-3" onSubmit={onSubmit}>
      <h5 className="text-sm font-medium text-[var(--ink)]">{heading}</h5>
      {alertMessage ? (
        <p role="alert" className="text-xs text-amber-500">
          {alertMessage}
        </p>
      ) : null}
      <label htmlFor="course-day-date" className="grid gap-1 text-xs">
        {ru ? 'Дата' : 'Date'}
        <input
          id="course-day-date"
          required
          type="date"
          value={draft.localDate}
          onChange={(event) => onChange({ ...draft, localDate: event.target.value })}
        />
      </label>
      <label htmlFor="course-day-time" className="grid gap-1 text-xs">
        {ru ? 'Время' : 'Time'}
        <input
          id="course-day-time"
          required
          type="time"
          value={draft.localTime}
          onChange={(event) => onChange({ ...draft, localTime: event.target.value })}
        />
      </label>
      <label htmlFor="course-day-duration" className="grid gap-1 text-xs">
        {ru ? 'Длительность (мин.)' : 'Duration (minutes)'}
        <input
          id="course-day-duration"
          required
          type="number"
          min="15"
          value={draft.durationMinutes}
          onChange={(event) => onChange({ ...draft, durationMinutes: event.target.value })}
        />
      </label>
      <label htmlFor="course-day-instructor" className="grid gap-1 text-xs">
        {ru ? 'Фактический инструктор дня' : 'Actual day instructor'}
        <select
          id="course-day-instructor"
          required
          value={draft.instructorId}
          onChange={(event) => onChange({ ...draft, instructorId: event.target.value })}
        >
          {instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id} disabled={instructor.inactive}>
              {instructor.name}
              {instructor.inactive ? (ru ? ' (деактивирован)' : ' (inactive)') : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <ActionButton
          className="ui-btn ui-btn-primary"
          unstyled
          pending={pending}
          pendingLabel={pendingLabel}
          type="submit"
        >
          {ru ? 'Сохранить день' : 'Save day'}
        </ActionButton>
        <button className="ui-btn" type="button" disabled={pending} onClick={onCancel}>
          {ru ? 'Отмена' : 'Cancel'}
        </button>
      </div>
    </form>
  );
};

export type CourseDayRecord = AdminCourseReadModel['courseDays'][number];
