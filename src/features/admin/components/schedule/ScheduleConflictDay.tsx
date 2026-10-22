import { ScheduleBookingCell } from './ScheduleBookingCell';
import { ScheduleCourseCell } from './ScheduleCourseCell';
import { SCHEDULE_TIME_SLOTS } from './scheduleOverlap';
import { hourToMinutes } from './scheduleUtils';
import { scheduleIntervalsOverlap, type ScheduleDayEvent } from './scheduleDayViewPlacement';
import type { ScheduleTimetableCellsProps } from './ScheduleTimetableCells';
import { useScheduleTranslations } from './useScheduleTranslations';

type ScheduleConflictDayProps = Omit<ScheduleTimetableCellsProps, 'selectedDate' | 'courses'> & {
  events: ScheduleDayEvent[];
};

/** Natural document flow gives every interval its own clickable, wrapping card. */
export function ScheduleConflictDay({
  events,
  instructor,
  instructors,
  bookings,
  usersList,
  onOpenSlot,
  onDeleteSlot,
}: ScheduleConflictDayProps) {
  const { t } = useScheduleTranslations();
  const freeSlots = SCHEDULE_TIME_SLOTS.filter((time) => {
    const start = hourToMinutes(time);
    return !events.some((event) =>
      scheduleIntervalsOverlap(start, start + 60, event.start, event.end)
    );
  });
  return (
    <div className="min-w-0 space-y-2" data-testid="schedule-conflict-day">
      {events.map((event) => (
        <div key={event.key} data-schedule-event={event.key} className="min-w-0">
          {event.conflict && (
            <p className="mb-1 whitespace-normal break-words type-caption font-semibold text-amber-700 dark:text-amber-400">
              {t('scheduleConflict')}
            </p>
          )}
          {event.kind === 'booking' ? (
            <ScheduleBookingCell
              expanded
              booking={event.booking}
              instructor={instructor}
              usersList={usersList}
              onOpen={onOpenSlot}
              onDelete={onDeleteSlot}
            />
          ) : (
            <ScheduleCourseCell
              course={event.course}
              instructor={instructor}
              instructors={instructors}
              bookings={bookings}
              usersList={usersList}
            />
          )}
        </div>
      ))}
      {instructor.isAvailable && (
        <div className="flex flex-wrap gap-2">
          {freeSlots.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => onOpenSlot(instructor, time)}
              title={t('manageSlot')}
              className="min-h-11 border border-dashed border-[var(--border)] px-3 type-caption text-[var(--ink-dim)] hover:border-accent"
            >
              {time} +
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
