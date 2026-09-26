import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translations } from '../../src/lib/i18n/translations';
import { useBookingCollaborationStore } from '../../src/features/booking-collaboration/bookingCollaborationStore';
import { useInstructorBookingCollaboration } from '../../src/features/booking-collaboration/useInstructorBookingCollaboration';
import { useCustomerBookingCollaboration } from '../../src/features/booking-collaboration/useCustomerBookingCollaboration';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';

const commandMocks = vi.hoisted(() => ({
  recordLessonAttendance: vi.fn(),
  rescheduleBooking: vi.fn(),
}));

vi.mock('../../src/features/booking-collaboration/useBookingCollaborationCommands', () => ({
  useBookingCollaborationCommands: () => commandMocks,
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonPricingSettingsReadModel: () => Promise.resolve({ item: { configured: false } }),
}));

function translate(language: 'en' | 'ru') {
  return (key: string) => translations[language][key as keyof typeof translations.en];
}

describe('booking collaboration success toasts', () => {
  beforeEach(() => {
    useBookingCollaborationStore.getState().reset();
    vi.clearAllMocks();
    commandMocks.recordLessonAttendance.mockResolvedValue(undefined);
    commandMocks.rescheduleBooking.mockResolvedValue(undefined);
  });

  it.each(['en', 'ru'] as const)(
    'uses Attendance description for present and absent in %s',
    async (language) => {
      const onNotify = vi.fn();
      const { result } = renderHook(() =>
        useInstructorBookingCollaboration({
          accountId: 'account_fixture_01',
          instructorId: 'instructor_fixture_01',
          onNotify,
          t: translate(language),
        })
      );

      for (const attendanceStatus of ['present', 'absent'] as const) {
        await act(async () => {
          await result.current.handleRecordLessonAttendance({
            bookingId: 'booking_fixture_01',
            participantId: 'participant_fixture_01',
            attendanceStatus,
          });
        });
        expect(onNotify).toHaveBeenLastCalledWith(
          'success',
          translations[language].instructorAttendanceRecorded,
          translations[language].instructorAttendanceSavedDesc
        );
      }
      expect(onNotify).toHaveBeenCalledTimes(2);
    }
  );

  it('preserves the reschedule toast and its existing schedule description', async () => {
    const onNotify = vi.fn();
    const { result } = renderHook(() =>
      useCustomerBookingCollaboration({
        accountId: 'account_fixture_01',
        onNotify,
        t: translate('ru'),
      })
    );
    act(() => {
      result.current.setRescheduleTarget({
        bookingId: 'booking_fixture_01',
        revision: 1,
        clientExercisedCapability: 'account_owner',
      } as LessonBookingCabinetItem);
    });
    await act(async () => {
      await result.current.handleRescheduleSubmit({
        localDate: '2026-10-01',
        localTime: '10:00',
        durationMinutes: 60,
      });
    });

    expect(commandMocks.rescheduleBooking).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith(
      'success',
      translations.ru.lessonRescheduled,
      translations.ru.lessonRescheduledDesc
    );
    expect(translations.ru.scheduleUpdatedDesc).toBe('Занятие успешно перенесено.');
  });
});
