import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Booking } from '../../../types';
import { useLanguage } from '../../../lib/LanguageContext';
import { TodayTaskRef } from '../../../lib/todayChecklist';
import { TodayTask } from '../../../features/profile/components/personal_cabinet/student/studentCabinetUtils';

export interface TodayChecklistProps {
  tasks: TodayTask[];
  bookings: Booking[];
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onToggleTaskComplete?: (taskId: string, done: boolean) => void;
  onAddTask?: (text: string) => void;
  onRemoveTask?: (task: TodayTaskRef) => void;
  onOpenLesson?: (booking: Booking) => void;
  onOpenDevelopment?: () => void;
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
  onOpenDevelopment,
}) => {
  const { t } = useLanguage();
  const [newText, setNewText] = useState('');

  const bookingMap = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);
  const { groups, other } = useMemo(() => groupRecommendationTasks(tasks), [tasks]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed) return;
    onAddTask?.(trimmed);
    setNewText('');
  };

  return (
    <div className="space-y-4">
      {groups.map(({ context, tasks: groupTasks }) => {
        const booking = bookingMap.get(context.bookingId);
        return (
          <div
            key={context.bookingId}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--ink-dim)]">
              <span>
                {t('scRecommendations')} · {context.title} ({context.dateLabel})
              </span>
              {booking && onOpenLesson && (
                <button
                  type="button"
                  onClick={() => onOpenLesson(booking)}
                  className="hover:text-[var(--ink)] transition-colors underline"
                >
                  {t('scLessonDetails')}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {groupTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-3 text-sm">
                  <label className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={(e) => {
                        if (task.recommendationId && onToggleRecommendation) {
                          onToggleRecommendation(
                            context.bookingId,
                            task.recommendationId,
                            e.target.checked
                          );
                        } else {
                          onToggleTaskComplete?.(task.id, e.target.checked);
                        }
                      }}
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
                    />
                    <span
                      className={`truncate ${
                        task.done ? 'line-through text-[var(--ink-dim)]' : 'text-[var(--ink)]'
                      }`}
                    >
                      {task.label}
                    </span>
                  </label>
                  {onRemoveTask && (
                    <button
                      type="button"
                      onClick={() => onRemoveTask(toTaskRef(task))}
                      className="text-[var(--ink-dim)] hover:text-rose-500 transition-colors p-1"
                      aria-label="Remove task"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {other.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-4 space-y-2">
          {other.map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={(e) => onToggleTaskComplete?.(task.id, e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
                />
                <span
                  className={`truncate ${
                    task.done ? 'line-through text-[var(--ink-dim)]' : 'text-[var(--ink)]'
                  }`}
                >
                  {task.label}
                </span>
              </label>
              {onRemoveTask && (
                <button
                  type="button"
                  onClick={() => onRemoveTask(toTaskRef(task))}
                  className="text-[var(--ink-dim)] hover:text-rose-500 transition-colors p-1"
                  aria-label="Remove task"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {onAddTask && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={t('scAddTodayTask')}
            className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-dim)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={!newText.trim()}
            className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            {t('scAddToToday')}
          </button>
        </form>
      )}

      {onOpenDevelopment && (
        <div className="pt-1 text-right">
          <button
            type="button"
            onClick={onOpenDevelopment}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {t('scDevelopment')} →
          </button>
        </div>
      )}
    </div>
  );
};
