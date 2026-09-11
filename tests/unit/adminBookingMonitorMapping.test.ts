import { describe, expect, it } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import {
  lessonBookingToMonitorRow,
  mergeAdminBookingMonitorRows,
} from '../../src/features/admin/operations/adminBookingMonitorMapping';
import { resolveAdminMonitorLessonStatusFromRow } from '../../src/features/admin/lesson-bookings/lessonBookingAdminPresentation';
import { readRepoFile } from '../helpers/readRepoFile';

function lessonReadModel(
  lifecycleStatus: LessonBookingReadModel['lifecycle']['status']
): LessonBookingReadModel {
  return {
    bookingId: 'booking_monitor_1',
    instructor: { instructorId: 'ins_1', displayName: 'Anna' },
    occurrence: {
      startsAt: { seconds: 1_700_000_000, nanoseconds: 0 },
      endsAt: { seconds: 1_700_003_600, nanoseconds: 0 },
      timeZone: 'Asia/Almaty',
      durationMinutes: 60,
    },
    lifecycle: { status: lifecycleStatus },
    bookingOrigin: 'account',
    updatedAt: { seconds: 1_700_000_000, nanoseconds: 0 },
    participants: [{ participantId: 'part_1', displayName: 'Client' }],
  } as unknown as LessonBookingReadModel;
}

describe('adminBookingMonitorMapping', () => {
  it('preserves canonical no_show lifecycle instead of mapping to cancelled', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('no_show'));
    expect(row.status).toBe('no_show');
    expect(row.canonicalLifecycleStatus).toBe('no_show');
  });

  it('maps completed lifecycle for history-capable monitor rows', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('completed'));
    expect(row.status).toBe('completed');
    expect(row.canonicalLifecycleStatus).toBe('completed');
  });

  it('builds active monitor rows from hot lessons only', () => {
    const merged = mergeAdminBookingMonitorRows(
      [lessonReadModel('confirmed'), lessonReadModel('completed')],
      []
    );
    expect(merged.map((row) => row.canonicalLifecycleStatus)).toEqual(['confirmed', 'completed']);
  });

  it('resolves in-progress presentation for confirmed lessons currently underway', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('confirmed'));
    const now = row.occurrenceStartsAtSeconds! + 30;
    const presentation = resolveAdminMonitorLessonStatusFromRow(row, now);
    expect(presentation?.kind).toBe('in_progress');
    expect(presentation?.labelKey).toBe('adminLessonStatusInProgress');
  });

  it('maps no_show monitor label key to canonical admin status mapper', () => {
    const row = lessonBookingToMonitorRow(lessonReadModel('no_show'));
    const presentation = resolveAdminMonitorLessonStatusFromRow(row, 1_700_010_000);
    expect(presentation?.labelKey).toBe('adminLessonStatusNoShow');
  });

  it('scrolls lesson booking section and detail into view on deep-link', () => {
    const panel = readRepoFile('src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx');
    expect(panel).toContain('revealLessonBookingCard');
    expect(panel).toContain('data-admin-lesson-booking-id');
    expect(panel).toContain('detailPanelRef');
    const section = readRepoFile(
      'src/features/admin/components/settings/AdminCollapsibleSection.tsx'
    );
    expect(section).toContain('id={id}');
    expect(section).toContain('scrollAdminElementIntoView');
    const navigation = readRepoFile('src/features/admin/adminNavigation.ts');
    expect(navigation).toContain('ADMIN_LESSON_BOOKINGS_SECTION_ID');
    expect(navigation).toContain('scrollAdminLessonBookingsSectionIntoView');
  });

  it('wires lifecycle mutation refresh through shared projections context', () => {
    const panel = readRepoFile('src/features/admin/lesson-bookings/AdminLessonBookingPanel.tsx');
    expect(panel).toContain('refreshAllProjections');
    const context = readRepoFile('src/features/admin/operations/AdminMonitorReadModelsContext.tsx');
    expect(context).toContain('registerPlannerRefresh');
    expect(context).toContain('refreshAllProjections');
    const monitor = readRepoFile('src/features/admin/operations/useAdminMonitorReadModels.ts');
    expect(monitor).not.toContain('lessonsHistory.list.items');
  });
});
