import { describe, expect, it } from 'vitest';
import type { BookingStatus } from '../../src/types';
import {
  computeInstructorLessonMetrics,
  countInstructorRosterLessons,
  mergeInstructorLessonMetricItems,
} from '../../src/features/instructor-workspace/instructorLessonMetrics';
import { readRepoFile } from '../helpers/readRepoFile';

function item(
  id: string,
  status: BookingStatus,
  revision = 1
): { id: string; revision: number; status: BookingStatus } {
  return { id, revision, status };
}

describe('instructor lesson metrics — canonical booking lifecycle', () => {
  it('1. completed → completed +1', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_completed', 'completed')]);
    expect(metrics.completed).toBe(1);
    expect(metrics.total).toBe(1);
  });

  it('2. no_show → completed +0', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_no_show', 'no_show')]);
    expect(metrics.completed).toBe(0);
  });

  it('3. no_show → occupied +1', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_no_show', 'no_show')]);
    expect(metrics.occupied).toBe(1);
    expect(metrics.noShow).toBe(1);
  });

  it('4. completed → occupied +1', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_completed', 'completed')]);
    expect(metrics.occupied).toBe(1);
  });

  it('5. cancelled → occupied +0', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_cancelled', 'cancelled')]);
    expect(metrics.occupied).toBe(0);
    expect(metrics.total).toBe(0);
    expect(metrics.cancelled).toBe(1);
  });

  it('6. pending → pending +1', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_pending', 'pending')]);
    expect(metrics.pending).toBe(1);
    expect(metrics.total).toBe(1);
  });

  it('7. confirmed → confirmed +1', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_confirmed', 'confirmed')]);
    expect(metrics.confirmed).toBe(1);
  });

  it('8. group booking with 3 participants counts as one lesson', () => {
    const metrics = computeInstructorLessonMetrics([item('booking_group', 'completed')]);
    expect(metrics.completed).toBe(1);
    expect(metrics.occupied).toBe(1);
    expect(metrics.total).toBe(1);
  });

  it('9. hot/history duplicate counted once (higher revision wins)', () => {
    const metrics = computeInstructorLessonMetrics([
      item('booking_dup', 'confirmed', 1),
      item('booking_dup', 'completed', 2),
    ]);
    expect(mergeInstructorLessonMetricItems([
      item('booking_dup', 'confirmed', 1),
      item('booking_dup', 'completed', 2),
    ])).toHaveLength(1);
    expect(metrics.completed).toBe(1);
    expect(metrics.confirmed).toBe(0);
    expect(metrics.total).toBe(1);
  });

  it('10. full instructor history is included in the metric set', () => {
    const metrics = computeInstructorLessonMetrics([
      item('hot_confirmed', 'confirmed'),
      item('history_completed', 'completed'),
      item('history_no_show', 'no_show'),
    ]);
    expect(metrics.total).toBe(3);
    expect(metrics.confirmed).toBe(1);
    expect(metrics.completed).toBe(1);
    expect(metrics.noShow).toBe(1);
    expect(metrics.occupied).toBe(2);
  });

  it('roster label «занятий» counts associated non-cancelled bookings, including pending and no_show', () => {
    const counts = countInstructorRosterLessons([
      {
        status: 'pending',
        participants: [{ participantId: 'p1' }, { participantId: 'p2' }],
      },
      {
        status: 'no_show',
        participants: [{ participantId: 'p1' }],
      },
      {
        status: 'cancelled',
        participants: [{ participantId: 'p1' }],
      },
    ]);
    expect(counts.get('p1')).toBe(2);
    expect(counts.get('p2')).toBe(1);
  });

  it('does not treat revenue as a booking-lifecycle number', () => {
    expect(computeInstructorLessonMetrics([item('booking_completed', 'completed')]).revenue).toBeUndefined();
  });

  it('reachable instructor/admin metric paths do not use isAttendedLessonStatus', () => {
    expect(
      readRepoFile('src/features/instructor-workspace/instructorLessonMetrics.ts')
    ).not.toContain('isAttendedLessonStatus');
    expect(
      readRepoFile('src/features/instructor-workspace/components/useInstructorWorkspace.ts')
    ).not.toContain('isAttendedLessonStatus');
    expect(
      readRepoFile('src/features/admin/operations/adminOperationalOverview.ts')
    ).not.toContain('isAttendedLessonStatus');
    expect(
      readRepoFile('src/features/admin/operations/AdminOperationalMetricsHost.tsx')
    ).not.toContain('isAttendedLessonStatus');
  });
});
