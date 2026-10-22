import { describe, expect, it } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { buildAdminLessonAttendanceAttempt } from '../../src/features/admin/lesson-bookings/lessonBookingAttendanceAttempt';
import { translations } from '../../src/lib/i18n/translations';

function fixture(status = 'completed', canAct = true): LessonBookingReadModel {
  return {
    partyKind: 'individual',
    participantIds: ['person'],
    lifecycle: { status },
    admin: {
      authorizedActions: { canFinalizeAttendance: canAct },
      attendance: [
        {
          participantId: 'person',
          attendanceStatus: status === 'completed' ? 'present' : 'absent',
          revision: 4,
          authorizedActions: { canRecordPresent: canAct, canRecordAbsent: canAct },
        },
      ],
    },
  } as unknown as LessonBookingReadModel;
}
describe('attendance command eligibility', () => {
  it('does not submit unchanged evidence or a blank reason', () => {
    expect(
      buildAdminLessonAttendanceAttempt(fixture(), { person: 'present' }, 'reason')
    ).toBeUndefined();
    expect(buildAdminLessonAttendanceAttempt(fixture(), { person: 'absent' }, ' ')).toBeUndefined();
  });
  it.each(['completed', 'no_show', 'confirmed', 'pending_cancellation'])(
    'respects unavailable actions for %s',
    (status) => {
      expect(
        buildAdminLessonAttendanceAttempt(
          fixture(status, false),
          { person: status === 'completed' ? 'absent' : 'present' },
          'reason'
        )
      ).toBeUndefined();
    }
  );
  it('requires terminal evidence revision and a coherent projection', () => {
    const item = fixture();
    delete item.admin!.attendance![0].revision;
    expect(buildAdminLessonAttendanceAttempt(item, { person: 'absent' }, 'reason')).toBeUndefined();
    expect(
      buildAdminLessonAttendanceAttempt(fixture('cancelled'), { person: 'present' }, 'reason')
    ).toBeUndefined();
  });
  it('finalizes every group participant together and forbids terminal group correction', () => {
    const item = fixture('confirmed');
    item.partyKind = 'family_group';
    item.participantIds = ['person', 'other'];
    expect(
      buildAdminLessonAttendanceAttempt(item, { person: 'present' }, 'reason')
    ).toBeUndefined();
    expect(
      buildAdminLessonAttendanceAttempt(item, { person: 'present', other: 'absent' }, 'reason')
    ).toMatchObject({
      kind: 'finalize_booking_attendance',
      attendance: [
        { participantId: 'person', attendanceStatus: 'present', expectedAttendanceRevision: 4 },
        { participantId: 'other', attendanceStatus: 'absent' },
      ],
    });
    item.lifecycle = { status: 'completed' } as LessonBookingReadModel['lifecycle'];
    expect(
      buildAdminLessonAttendanceAttempt(item, { person: 'present', other: 'absent' }, 'reason')
    ).toBeUndefined();
  });
  it.each(['ru', 'en'] as const)(
    'has localized correction labels and lifecycle confirmation in %s',
    (language) => {
      const t = translations[language];
      expect(t.adminLessonCorrectAttendance).toBeTruthy();
      expect(t.adminLessonConfirmCorrectionSubmit).toBeTruthy();
      expect(t.adminLessonConfirmCorrectionTitle).not.toBe(t.adminLessonConfirmAttendanceTitle);
      expect(t.adminLessonConfirmCorrectionWarning).toContain(
        language === 'ru' ? 'неявка' : 'no-show'
      );
    }
  );
});
