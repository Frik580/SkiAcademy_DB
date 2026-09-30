import React from 'react';
import type { AdminCourseReadModel } from '@ski-academy/shared-domain';
import { ActionButton } from '../../../../ui/ActionButton';
import { adminFormControls } from './adminCourseSurface';

export interface CourseDayDraft {
  readonly kind: 'create_course_day' | 'reassign_course_day_instructor' | 'reschedule_course_day';
  readonly courseDayId?: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly endTime: string;
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
  removeLabel?: string;
  onChange: (draft: CourseDayDraft) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  onRemove?: () => void;
}

export const CanonicalCourseDayForm: React.FC<CanonicalCourseDayFormProps> = ({
  draft,
  language,
  pending,
  pendingLabel,
  instructors,
  alertMessage,
  removeLabel,
  onChange,
  onSubmit,
  onCancel,
  onRemove,
}) => {
  const ru = language === 'ru';
  const heading =
    draft.kind === 'create_course_day'
      ? ru
        ? 'Новый день'
        : 'New day'
      : ru
        ? 'Редактировать день'
        : 'Edit day';
  return (
    <form className={`grid max-w-xl gap-3 ${adminFormControls}`} onSubmit={onSubmit}>
      <h5 className="text-sm font-medium text-[var(--ink)]">{heading}</h5>
      {alertMessage ? (
        <p role="alert" className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
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
      <div className="grid gap-2 sm:grid-cols-2">
        <label htmlFor="course-day-time" className="grid gap-1 text-xs">
          {ru ? 'Время начала' : 'Start time'}
          <input
            id="course-day-time"
            required
            type="time"
            step={60}
            value={draft.localTime}
            onChange={(event) => onChange({ ...draft, localTime: event.target.value })}
          />
        </label>
        <label htmlFor="course-day-end" className="grid gap-1 text-xs">
          {ru ? 'Время окончания' : 'End time'}
          <input
            id="course-day-end"
            required
            type="time"
            step={60}
            value={draft.endTime}
            onChange={(event) => onChange({ ...draft, endTime: event.target.value })}
          />
        </label>
      </div>
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
          variant="primary"
          size="sm"
          pending={pending}
          pendingLabel={pendingLabel}
          type="submit"
        >
          {ru ? 'Сохранить день' : 'Save day'}
        </ActionButton>
        <ActionButton type="button" size="sm" variant="secondary" disabled={pending} onClick={onCancel}>
          {ru ? 'Отмена' : 'Cancel'}
        </ActionButton>
        {onRemove && removeLabel ? (
          <ActionButton type="button" size="sm" variant="danger" disabled={pending} onClick={onRemove}>
            {removeLabel}
          </ActionButton>
        ) : null}
      </div>
    </form>
  );
};

export type CourseDayRecord = AdminCourseReadModel['courseDays'][number];
