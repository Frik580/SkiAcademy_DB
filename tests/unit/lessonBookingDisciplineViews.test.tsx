import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { getDifficultyLabel } from '../../src/lib/i18n/bookingLabels';
import { ClientBookingsList } from '../../src/features/student-cabinet/components/ClientBookingsList';
import { InstructorBookingCard } from '../../src/features/instructor-workspace/components/InstructorBookingCard';
import { useInstructorWorkspace } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';
import { AdminLessonBookingMasterList } from '../../src/features/admin/lesson-bookings/AdminLessonBookingMasterList';
import { AdminLessonBookingDetail } from '../../src/features/admin/lesson-bookings/AdminLessonBookingDetail';
import {
  mapLessonBookingReadModelToCabinetItem,
  mergeLessonBookingRecords,
} from '../../src/features/lesson-bookings/lessonBookingViewModel';
import {
  mapInstructorLessonBookingReadModel,
  mergeInstructorLessonBookingRecords,
} from '../../src/features/booking-collaboration/instructorLessonBookingViewModel';

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));
vi.mock('../../src/features/student-cabinet/useBookingChatUnread', () => ({
  useBookingChatUnread: () => ({ hasUnreadChat: () => false, markBookingChatRead: vi.fn() }),
}));

function detail(): LessonBookingReadModel {
  return {
    bookingId: 'booking_admin_panel_01',
    revision: 5,
    partyKind: 'individual',
    participantIds: ['participant_admin_panel_01'],
    participants: [
      { participantId: 'participant_admin_panel_01', displayName: 'Canonical Student' },
    ],
    instructor: {
      instructorId: 'instructor_admin_panel_01',
      displayName: 'Canonical Coach',
    },
    occurrence: {
      startsAt: { seconds: 1_788_246_000, nanoseconds: 0 },
      endsAt: { seconds: 1_788_249_600, nanoseconds: 0 },
      timeZone: 'Asia/Almaty',
      durationMinutes: 60,
    },
    lifecycle: { status: 'pending_cancellation' },
    bookingOrigin: 'guest',
    difficulty: 'freeride',
    notes: 'Bring a helmet',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
    updatedAt: { seconds: 10, nanoseconds: 0 },
    admin: {
      participants: [
        {
          participantId: 'participant_admin_panel_01',
          displayName: 'Canonical Student',
          skillLevel: 'intermediate',
          discipline: 'ski',
          age: { kind: 'age_years', years: 18 },
        },
      ],
      attribution: {
        bookingOrigin: 'guest',
        bookedBy: { kind: 'guest', guestSubjectId: 'guest_subject_admin_panel_01' },
      },
      payer: { accountId: 'account_admin_panel_01', displayName: 'Canonical Payer' },
      payment: {
        paymentId: 'payment_admin_panel_01',
        status: 'paid',
        revision: 2,
        currency: 'KZT',
        originalPrice: 25_000,
        price: 25_000,
        paid: 25_000,
        refunded: 0,
        retained: 25_000,
        settled: 25_000,
        writtenOff: 0,
        outstanding: 0,
      },
      cancellationFinancial: {
        timing: 'pending_request',
        maximumRefund: 25_000,
        suggestedRefund: 20_000,
      },
      relatedIssues: [
        {
          issueId: 'admin_issue_booking_panel_01',
          kind: 'missing_attendance',
          severity: 'urgent',
          lifecycleStatus: 'open',
          revision: 3,
          blocksOutcome: true,
          blocksDelivery: false,
          updatedAt: { seconds: 9, nanoseconds: 0 },
        },
      ],
      relatedOpenChangeRequests: [],
      scheduleRevision: 2,
      serviceParticipantIds: ['participant_admin_panel_01'],
      authorizedActions: {
        canConfirmGuest: false,
        canRecordGuestPayment: false,
        canDirectCancel: false,
        canReschedule: false,
        canChangeInstructor: false,
        canChangeDuration: false,
        canRecordAttendance: false,
        canResolveCancellation: true,
        canResolveAttendanceOutcome: false,
        canLinkGuestToAccount: false,
      },
      guestIdentityLinkUnavailableReason: 'expired_reservation',
    },
  } as LessonBookingReadModel;
}

function RoleViews({
  model,
  language,
  participantIds = model.participantIds,
}: {
  model: LessonBookingReadModel;
  language: 'ru' | 'en';
  participantIds?: readonly string[];
}) {
  const t = (key: keyof typeof translations.en) => translations[language][key];
  const student = mapLessonBookingReadModelToCabinetItem(model);
  const instructor = mapInstructorLessonBookingReadModel(model);
  const workspace = useInstructorWorkspace({
    userProfile: { uid: 'coach_account', instructorId: model.instructor.instructorId } as never,
    instructors: [{ id: model.instructor.instructorId, specialty: 'ski' }] as never,
    lessonBookings: [instructor],
    reviews: [],
    courses: [],
    usersList: [],
  });
  return (
    <>
      <div data-testid="student">
        <ClientBookingsList
          sessionItems={[{ kind: 'lesson', session: student }]}
          participantProfiles={
            participantIds.map((participantId) => ({
              participantId,
              displayName: 'Ski participant',
              discipline: 'ski',
            })) as never
          }
          userBookings={[student]}
          onCancel={vi.fn()}
          onChat={vi.fn()}
        />
      </div>
      <div data-testid="instructor">
        <InstructorBookingCard
          booking={workspace.instructorBookings[0]}
          nowMs={Date.now()}
          usersList={[]}
          theme="light"
          language={language}
          t={t}
          onOpenChat={vi.fn()}
          onUpdateStudentLevel={vi.fn()}
          onOpenEval={vi.fn()}
          collaboration={{ proposals: [], changeRequests: [] } as never}
          canCreateProposal={false}
          onCreateProposal={vi.fn()}
        />
      </div>
      <div data-testid="master">
        <AdminLessonBookingMasterList
          view="hot"
          items={[model]}
          loading={false}
          loadingMore={false}
          hasMore={false}
          locale={language}
          onViewChange={vi.fn()}
          onSelectBooking={vi.fn()}
          onLoadMore={vi.fn()}
          onRetryList={vi.fn()}
        />
      </div>
      <div data-testid="detail">
        <AdminLessonBookingDetail
          detail={model}
          admin={model.admin!}
          language={language}
          locale={language}
          t={t}
          onRequestAttempt={vi.fn()}
          onCommitAttendanceFinalize={vi.fn()}
          attendanceFinalizePending={false}
          attendanceFinalizeSuccessNonce={0}
          onClearConfirmation={vi.fn()}
          onOpenPlanner={vi.fn()}
          onClose={vi.fn()}
          onOpenPayment={vi.fn()}
          onOpenIssue={vi.fn()}
        />
      </div>
    </>
  );
}

function upcomingModel(
  discipline?: 'ski' | 'snowboard',
  bookingOrigin: 'account' | 'guest' = 'account'
): LessonBookingReadModel {
  const model = detail();
  const seconds = Math.floor(Date.now() / 1000) + 86400;
  return {
    ...model,
    discipline,
    bookingOrigin,
    difficulty: 'beginner',
    lifecycle: { status: 'confirmed' },
    occurrence: {
      ...model.occurrence,
      startsAt: { seconds, nanoseconds: 0 },
      endsAt: { seconds: seconds + 3600, nanoseconds: 0 },
    },
  };
}

function views(
  model: LessonBookingReadModel,
  language: 'ru' | 'en',
  participantIds?: readonly string[]
) {
  return (
    <LanguageProvider>
      <RoleViews model={model} language={language} participantIds={participantIds} />
    </LanguageProvider>
  );
}

function expectDiscipline(language: 'ru' | 'en', discipline: 'ski' | 'snowboard') {
  const label =
    translations[language][
      discipline === 'ski' ? 'participantsDisciplineSki' : 'participantsDisciplineSnowboard'
    ];
  const studentText = `${label} · ${getDifficultyLabel('beginner', language)} · ${language === 'ru' ? '1 час' : '1 hour'}`;
  expect(within(screen.getByTestId('student')).getByText(studentText)).toBeInTheDocument();
  for (const role of ['instructor', 'master', 'detail']) {
    expect(within(screen.getByTestId(role)).getByText(label)).toBeInTheDocument();
  }
}

describe('canonical lesson discipline across cabinets', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it.each([
    ['ru', 'account'],
    ['en', 'account'],
    ['ru', 'guest'],
    ['en', 'guest'],
  ] as const)(
    'shows the Booking discipline in every %s role view for %s bookings despite ski profiles',
    (language, origin) => {
      localStorage.setItem('alpine_glide_lang', language);
      render(views(upcomingModel('snowboard', origin), language));
      expectDiscipline(language, 'snowboard');
    }
  );

  it.each(['ru', 'en'] as const)(
    'hides historical missing discipline in compact %s cards and explains it in details',
    (language) => {
      localStorage.setItem('alpine_glide_lang', language);
      render(views(upcomingModel(), language));
      for (const role of ['student', 'instructor', 'master']) {
        const scope = within(screen.getByTestId(role));
        expect(
          scope.queryByText(translations[language].participantsDisciplineSki)
        ).not.toBeInTheDocument();
        expect(
          scope.queryByText(translations[language].participantsDisciplineSnowboard)
        ).not.toBeInTheDocument();
      }
      expect(
        within(screen.getByTestId('detail')).getByText(
          translations[language].lessonDisciplineUnspecified
        )
      ).toBeInTheDocument();
    }
  );

  it('keeps discipline attached to Booking across participant switches, refreshed projections and remount', () => {
    localStorage.setItem('alpine_glide_lang', 'ru');
    const model = upcomingModel('snowboard');
    const view = render(views(model, 'ru'));
    expectDiscipline('ru', 'snowboard');
    const refreshed = {
      ...model,
      revision: model.revision + 1,
      participants: [{ participantId: model.participantIds[0], displayName: 'Updated name' }],
    };
    view.rerender(views(refreshed, 'ru', ['different_ski_participant']));
    expectDiscipline('ru', 'snowboard');
    const updated = { ...refreshed, revision: refreshed.revision + 1, discipline: 'ski' as const };
    view.rerender(views(updated, 'ru'));
    expectDiscipline('ru', 'ski');
    view.unmount();
    render(views(JSON.parse(JSON.stringify(model)), 'ru'));
    expectDiscipline('ru', 'snowboard');
  });

  it('merges updated and stale read models consistently and clears missing discipline without profile fallback', () => {
    const first = upcomingModel('snowboard');
    let student = mergeLessonBookingRecords(new Map(), [first]);
    let instructor = mergeInstructorLessonBookingRecords(new Map(), [first]);
    const updated = { ...first, revision: first.revision + 1, discipline: 'ski' as const };
    student = mergeLessonBookingRecords(student, [updated, first]);
    instructor = mergeInstructorLessonBookingRecords(instructor, [updated, first]);
    expect(student.get(first.bookingId)?.discipline).toBe('ski');
    expect(instructor.get(first.bookingId)?.discipline).toBe('ski');
    const missing = { ...updated, revision: updated.revision + 1, discipline: undefined };
    expect(
      mergeLessonBookingRecords(student, [missing]).get(first.bookingId)?.discipline
    ).toBeUndefined();
    expect(
      mergeInstructorLessonBookingRecords(instructor, [missing]).get(first.bookingId)?.discipline
    ).toBeUndefined();
  });
});
