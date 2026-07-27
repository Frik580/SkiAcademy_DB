import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Booking } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import { TodayTaskRef } from '../../../lib/todayChecklist';
import { TodayTask } from './studentCabinetUtils';

interface TodayChecklistProps {
  tasks: TodayTask[];
  bookings: Booking[];
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleTaskComplete?: (taskId: string, done: boolean) => void;
  onAddTask?: (text: string) => void;
  onRemoveTask?: (task: TodayTaskRef) => void;
  onOpenLesson?: (booking: Booking) => void;
}

const toTaskRef = (task: TodayTask): TodayTaskRef => ({
  id: task.id,
  kind: task.kind,
  skillItemId: task.skillItemId,
  customTaskId: task.customTaskId,
});

const groupRecommendationTasks = (tasks: TodayTask[]) => {
  const other: TodayTask[] = [];
  const groups = new Map<
    string,
    { context: NonNullable<TodayTask['bookingContext']>; tasks: TodayTask[] }
  >();

  for (const task of tasks) {
    if (task.kind !== 'recommendation' || !task.bookingContext) {
      other.push(task);
      continue;
    }
    const existing = groups.get(task.bookingContext.bookingId);
    if (existing) {
      existing.tasks.push(task);
    } else {
      groups.set(task.bookingContext.bookingId, {
        context: task.bookingContext,
        tasks: [task],
      });
    }
  }

  return { groups: Array.from(groups.values()), other };
};

export const TodayChecklist: React.FC<TodayChecklistProps> = ({
  tasks,
  bookings,
  onToggleRecommendation,
  onToggleTaskComplete,
  onAddTask,
  onRemoveTask,
  onOpenLesson,
}) => {
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');

  const { groups, other } = useMemo(() => groupRecommendationTasks(tasks), [tasks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !onAddTask) return;
    onAddTask(text);
    setDraft('');
  };

  const handleToggle = (task: TodayTask) => {
    const nextDone = !task.done;
    if (task.kind === 'recommendation' && task.bookingId && task.recommendationId) {
      onToggleRecommendation?.(task.bookingId, task.recommendationId, nextDone);
      return;
    }
    onToggleTaskComplete?.(task.id, nextDone);
  };

  const openBooking = (bookingId: string) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (booking && onOpenLesson) onOpenLesson(booking);
  };

  const renderTaskRow = (task: TodayTask) => (
    <li key={task.id} className="flex items-start gap-2 text-sm text-[var(--ink)]">
      <button
        type="button"
        onClick={() => handleToggle(task)}
        className="text-[var(--ink-dim)] w-5 shrink-0 hover:text-[var(--accent)] transition leading-6 text-center"
        aria-label={task.done ? t('scMarkRecommendationOpen') : t('scMarkRecommendationDone')}
      >
        {task.done ? '✓' : '○'}
      </button>
      <span
        className={`flex-1 min-w-0 leading-relaxed pt-0.5 ${
          task.done ? 'text-[var(--ink-dim)] line-through' : ''
        }`}
      >
        {task.label}
      </span>
      {onRemoveTask && task.kind !== 'recommendation' && (
        <button
          type="button"
          onClick={() => onRemoveTask(toTaskRef(task))}
          className="shrink-0 p-1 -mr-1 text-[var(--ink-dim)] hover:text-rose-500 transition"
          aria-label={t('scRemoveTodayTask')}
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
    </li>
  );

  return (
    <div className="space-y-3">
      <ul className="space-y-4">
        {groups.map(({ context, tasks: groupTasks }) => (
          <li key={context.bookingId} className="space-y-2">
            <button
              type="button"
              onClick={() => openBooking(context.bookingId)}
              disabled={!onOpenLesson}
              className="w-full text-left rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-3 py-2.5 transition hover:border-[var(--accent)]/40 disabled:cursor-default disabled:hover:border-[var(--border-subtle)]"
            >
              <p className="text-[10px] uppercase tracking-wider text-[var(--ink-dim)]">
                {context.isCourse ? t('groupCourseInfoPrefix') : t('scTodayFromLesson')}
              </p>
              <p className="text-sm font-medium text-[var(--ink)] leading-snug">{context.title}</p>
              <p className="text-xs text-[var(--ink-dim)] mt-0.5">{context.dateLabel}</p>
              {onOpenLesson && (
                <p className="text-xs text-[var(--accent)] mt-1.5">
                  {t('scViewAllRecommendations')}
                </p>
              )}
            </button>
            <ul className="space-y-2 pl-1 border-l border-[var(--border-subtle)] ml-2">
              {groupTasks.map(renderTaskRow)}
            </ul>
          </li>
        ))}
        {other.map(renderTaskRow)}
      </ul>

      {onAddTask && (
        <form onSubmit={handleSubmit} className="pt-1">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('scAddTodayTask')}
            className="w-full min-h-[2.75rem] rounded-lg border border-[var(--border-subtle)] bg-[var(--profile-bg)] px-3 py-2.5 text-sm leading-normal text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus:outline-none focus:border-[var(--accent)] transition box-border"
          />
        </form>
      )}
    </div>
  );
};
