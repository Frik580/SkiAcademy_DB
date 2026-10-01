import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Course } from '../../src/types';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { CourseDaySessionItem } from '../../src/features/course-enrollments/courseEnrollmentContracts';
import { ClientBookingsList } from '../../src/features/student-cabinet/components/ClientBookingsList';
import { CourseDetailsModal } from '../../src/features/courses/components/CourseDetailsModal';
import { CourseEnrollmentScheduleList } from '../../src/features/course-enrollments/CourseEnrollmentScheduleList';
import {
  buildCourseEnrollmentScheduleLines,
  formatCourseDayCountLabel,
  formatCourseEnrollmentDateRange,
  aggregateCabinetSessionsForStudentList,
} from '../../src/features/course-enrollments/courseEnrollmentListProjection';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { CurrencyProvider } from '../../src/app/providers/CurrencyContext';
import { translations } from '../../src/lib/i18n/translations';
import type { CourseScheduleProjectionReadModel } from '@ski-academy/shared-domain';

function shiftDate(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function courseDay(
  overrides: Partial<CourseDaySessionItem> &
    Pick<CourseDaySessionItem, 'enrollmentId' | 'courseDayId' | 'date'>
): CourseDaySessionItem {
  return {
    kind: 'course_day',
    courseId: 'course_performance',
    participantId: 'participant_1',
    courseTitle: 'Performance Carving Masterclass',
    time: '10:00',
    endTime: '16:00',
    timeZone: 'Asia/Almaty',
    dayOrder: 1,
    lifecycleStatus: 'confirmed',
    participantName: 'Alex',
    revision: 2,
    authorizedActions: { canWithdraw: false, canRequestCancellation: true },
    ...overrides,
  };
}

function lesson(id: string, date: string, instructorName: string): LessonBookingCabinetItem {
  return {
    id,
    bookingId: id,
    revision: 1,
    status: 'confirmed',
    date,
    time: '09:00',
    durationHours: 2,
    instructorId: 'instructor_1',
    instructorName,
    instructorAvatar: '',
    participantNames: ['Alex'],
    partyKind: 'individual',
    payment: { kind: 'visible', price: 10000 },
    bookingOrigin: 'account',
    isLessonBooking: true,
    authorizedActions: {
      canRequestCancellation: true,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
  };
}

function futureCourse(enrollmentId: string, title: string, startOffset: number, length: number) {
  return Array.from({ length }, (_, index) =>
    courseDay({
      enrollmentId,
      courseId: `course_${enrollmentId}`,
      courseTitle: title,
      courseDayId: `${enrollmentId}_day_${index + 1}`,
      date: shiftDate(startOffset + index),
      dayOrder: index + 1,
    })
  );
}

function renderList(
  sessionItems:
    | CourseDaySessionItem[]
    | Array<{ kind: 'lesson'; session: LessonBookingCabinetItem } | CourseDaySessionItem>,
  language: 'ru' | 'en',
  handlers?: {
    onCourseRequestCancellation?: (enrollmentId: string) => void;
    onViewCourseDetails?: (courseId: string, enrollmentId?: string) => void;
    onOpenLesson?: (booking: LessonBookingCabinetItem) => void;
    onCancel?: (booking: LessonBookingCabinetItem) => void;
  }
) {
  localStorage.setItem('alpine_glide_lang', language);
  return render(
    <LanguageProvider>
      <ClientBookingsList
        sessionItems={sessionItems}
        userBookings={[]}
        onCancel={handlers?.onCancel ?? (() => undefined)}
        onChat={() => undefined}
        onOpenLesson={handlers?.onOpenLesson}
        onViewCourseDetails={handlers?.onViewCourseDetails}
        onCourseRequestCancellation={handlers?.onCourseRequestCancellation}
      />
    </LanguageProvider>
  );
}

describe('ClientBookingsList course enrollment cards', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders one course card for four days with title, count, and date range', () => {
    const days = [
      courseDay({
        enrollmentId: 'enrollment_a',
        courseDayId: 'day_4',
        date: '2026-12-15',
        endTime: '14:00',
        dayOrder: 4,
      }),
      courseDay({
        enrollmentId: 'enrollment_a',
        courseDayId: 'day_1',
        date: '2026-12-12',
        dayOrder: 1,
      }),
      courseDay({
        enrollmentId: 'enrollment_a',
        courseDayId: 'day_3',
        date: '2026-12-14',
        dayOrder: 3,
      }),
      courseDay({
        enrollmentId: 'enrollment_a',
        courseDayId: 'day_2',
        date: '2026-12-13',
        endTime: '15:00',
        dayOrder: 2,
      }),
    ];
    const now = new Date();
    const decemberStillUpcoming = now < new Date(2026, 11, 12, 10, 0, 0);
    const items = decemberStillUpcoming
      ? days
      : futureCourse('enrollment_a', 'Performance Carving Masterclass', 30, 4);

    renderList(items, 'ru', { onViewCourseDetails: vi.fn(), onCourseRequestCancellation: vi.fn() });

    expect(screen.getAllByTestId('course-enrollment-card')).toHaveLength(1);
    expect(screen.getByText('Performance Carving Masterclass')).toBeInTheDocument();
    expect(screen.getByText('Групповой курс · 4 дня')).toBeInTheDocument();
    const course = aggregateCabinetSessionsForStudentList(items).find(
      (item) => item.kind === 'course_enrollment'
    );
    if (!course || course.kind !== 'course_enrollment') throw new Error('missing course');
    expect(screen.getByText(formatCourseEnrollmentDateRange(course, 'ru'))).toBeInTheDocument();
    expect(screen.getByText('Подтверждено')).toBeInTheDocument();
    expect(screen.getAllByTestId('cancel-course-enrollment')).toHaveLength(1);
    expect(screen.queryByText('12 декабря')).not.toBeInTheDocument();
  });

  it('calls whole-enrollment cancellation once', () => {
    const onCourseRequestCancellation = vi.fn();
    renderList(futureCourse('enrollment_a', 'Performance Carving Masterclass', 30, 4), 'ru', {
      onCourseRequestCancellation,
      onViewCourseDetails: vi.fn(),
    });
    fireEvent.click(screen.getByTestId('cancel-course-enrollment'));
    expect(onCourseRequestCancellation).toHaveBeenCalledTimes(1);
    expect(onCourseRequestCancellation).toHaveBeenCalledWith('enrollment_a');
  });

  it('renders two cards for two enrollments with the same title', () => {
    renderList(
      [
        ...futureCourse('enrollment_a', 'Performance Carving Masterclass', 30, 2),
        ...futureCourse('enrollment_b', 'Performance Carving Masterclass', 40, 2),
      ],
      'ru'
    );
    const cards = screen.getAllByTestId('course-enrollment-card');
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.getAttribute('data-enrollment-id')).sort()).toEqual([
      'enrollment_a',
      'enrollment_b',
    ]);
  });

  it('keeps lessons separate and shows three cards for two lessons plus one course', () => {
    const onOpenLesson = vi.fn();
    const onCancel = vi.fn();
    const onCourseRequestCancellation = vi.fn();
    const bookingA = lesson('booking_a', shiftDate(10), 'Coach Ada');
    const bookingB = lesson('booking_b', shiftDate(12), 'Coach Ben');
    renderList(
      [
        { kind: 'lesson', session: bookingA },
        { kind: 'lesson', session: bookingB },
        ...futureCourse('enrollment_a', 'Performance Carving Masterclass', 20, 4),
      ],
      'ru',
      { onOpenLesson, onCancel, onCourseRequestCancellation, onViewCourseDetails: vi.fn() }
    );

    expect(screen.getAllByTestId('lesson-booking-card')).toHaveLength(2);
    expect(screen.getAllByTestId('course-enrollment-card')).toHaveLength(1);
    expect(screen.getAllByTestId('cancel-course-enrollment')).toHaveLength(1);

    fireEvent.click(
      within(
        screen.getByText('Coach Ada').closest('[data-testid="lesson-booking-card"]') as HTMLElement
      ).getByRole('button', { name: translations.ru.scMoreDetails })
    );
    expect(onOpenLesson).toHaveBeenCalledWith(bookingA);

    fireEvent.click(
      within(
        screen.getByText('Coach Ada').closest('[data-testid="lesson-booking-card"]') as HTMLElement
      ).getByRole('button', { name: translations.ru.cancelBookingRefund })
    );
    expect(onCancel).toHaveBeenCalledWith(bookingA);
    expect(onCourseRequestCancellation).not.toHaveBeenCalled();
  });

  it('filters the aggregated course into upcoming, current, and past tabs', () => {
    renderList(
      [
        ...futureCourse('enrollment_future', 'Future Camp', 20, 3),
        ...futureCourse('enrollment_live', 'Live Camp', -1, 3),
        ...futureCourse('enrollment_old', 'Old Camp', -20, 2).map((day) =>
          courseDay({ ...day, endTime: '11:00' })
        ),
      ],
      'ru'
    );

    expect(screen.getByText('Future Camp')).toBeInTheDocument();
    expect(screen.queryByText('Live Camp')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Camp')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('course-enrollment-card')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: translations.ru.scCalendarCurrent }));
    expect(screen.getByText('Live Camp')).toBeInTheDocument();
    expect(screen.queryByText('Future Camp')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('course-enrollment-card')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: translations.ru.scCalendarPast }));
    expect(screen.getByText('Old Camp')).toBeInTheDocument();
    expect(screen.queryByText('Live Camp')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('course-enrollment-card')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: translations.ru.scHistoryFilterAll }));
    expect(screen.getAllByTestId('course-enrollment-card')).toHaveLength(3);
  });

  it('uses translation keys in Russian and English', () => {
    const days = futureCourse('enrollment_a', 'Performance Carving Masterclass', 30, 4);
    const { unmount } = renderList(days, 'ru', { onViewCourseDetails: vi.fn() });
    expect(screen.getByText(`${translations.ru.scGroupCourse} · 4 дня`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: translations.ru.scMoreDetails })).toBeInTheDocument();
    unmount();

    renderList(days, 'en', { onViewCourseDetails: vi.fn() });
    const forms = [
      translations.en.scCourseDayOne,
      translations.en.scCourseDayFew,
      translations.en.scCourseDayMany,
    ] as const;
    expect(
      screen.getByText(
        `${translations.en.scGroupCourse} · ${formatCourseDayCountLabel(4, 'en', forms)}`
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: translations.en.scMoreDetails })).toBeInTheDocument();
  });
});

describe('course enrollment details schedule', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const schedule: CourseScheduleProjectionReadModel = {
    courseId: 'course_performance',
    courseScheduleRevision: 1,
    courseDayCount: 4,
    startAt: { seconds: Math.floor(Date.parse('2026-12-12T10:00:00.000Z') / 1000), nanoseconds: 0 },
    finalCourseDayEndsAt: {
      seconds: Math.floor(Date.parse('2026-12-15T14:00:00.000Z') / 1000),
      nanoseconds: 0,
    },
    courseDays: [
      scheduleDay('day_3', '2026-12-14T10:00:00.000Z', '2026-12-14T16:00:00.000Z', 3),
      scheduleDay('day_1', '2026-12-12T10:00:00.000Z', '2026-12-12T16:00:00.000Z', 1),
      scheduleDay('day_4', '2026-12-15T10:00:00.000Z', '2026-12-15T14:00:00.000Z', 4),
      scheduleDay('day_2', '2026-12-13T10:00:00.000Z', '2026-12-13T15:00:00.000Z', 2),
    ],
  };

  it('renders every course day in the details modal, sorted by start', () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    const lines = buildCourseEnrollmentScheduleLines(schedule, 'ru');
    const course: Course = {
      id: 'course_performance',
      title: 'Performance Carving Masterclass',
      duration: '4 days',
      description: 'Group course',
      dates: '12-15 December',
      totalSeats: 8,
      availableSeats: 3,
      price: 100000,
      bgImageUrl: 'https://example.com/course.jpg',
    };

    render(
      <LanguageProvider>
        <CurrencyProvider>
          <CourseDetailsModal
            isOpen
            onClose={() => undefined}
            rawCourse={course}
            course={course}
            instructors={[]}
            userProfile={null}
            isEnrolled
            enrollmentLifecycleStatus="confirmed"
            enrollmentSchedule={schedule}
            onEnroll={() => undefined}
          />
        </CurrencyProvider>
      </LanguageProvider>
    );

    expect(screen.getByTestId('course-enrollment-schedule')).toBeInTheDocument();
    expect(screen.getByText(translations.ru.scCourseSchedule)).toBeInTheDocument();
    const rendered = within(screen.getByTestId('course-enrollment-schedule')).getAllByRole(
      'listitem'
    );
    expect(rendered.map((item) => item.textContent)).toEqual(lines.map((line) => line.label));
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.courseDayId)).toEqual(['day_1', 'day_2', 'day_3', 'day_4']);
  });

  it('renders the schedule heading from the English translation key', () => {
    localStorage.setItem('alpine_glide_lang', 'en');
    const lines = buildCourseEnrollmentScheduleLines(schedule, 'en');
    render(
      <LanguageProvider>
        <CourseEnrollmentScheduleList lines={lines} />
      </LanguageProvider>
    );
    expect(screen.getByText(translations.en.scCourseSchedule)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});

function scheduleDay(
  courseDayId: string,
  startsAt: string,
  endsAt: string,
  dayOrder: number
): CourseScheduleProjectionReadModel['courseDays'][number] {
  return {
    courseDayId,
    dayOrder,
    interval: {
      startsAt: { seconds: Math.floor(Date.parse(startsAt) / 1000), nanoseconds: 0 },
      endsAt: { seconds: Math.floor(Date.parse(endsAt) / 1000), nanoseconds: 0 },
    },
    timeZone: 'UTC',
    revision: 1,
  };
}
