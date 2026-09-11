import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InstructorBookingCard } from '../../src/features/instructor-workspace/components/InstructorBookingCard';
import type { DisplayBooking } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';
import { isInstructorBookingVisibleForStatusFilter } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { InstructorStudents } from '../../src/features/instructor-workspace/components/InstructorStudents';

vi.mock('../../src/features/booking-collaboration', () => ({
  InstructorCollaborationPanel: () => null,
}));

const t = (key: keyof (typeof translations)['en']) => translations.en[key];

function participant(input: {
  participantId: string;
  clientName: string;
  attendanceStatus?: 'present' | 'absent';
  attendanceRevision?: number;
  canRecordPresent: boolean;
  canRecordAbsent: boolean;
}): DisplayBooking['participants'][number] {
  return {
    participantId: input.participantId,
    clientName: input.clientName,
    clientAvatar: '',
    canRecordPresent: input.canRecordPresent,
    canRecordAbsent: input.canRecordAbsent,
    ...(input.attendanceStatus ? { attendanceStatus: input.attendanceStatus } : {}),
    ...(input.attendanceRevision !== undefined
      ? { attendanceRevision: input.attendanceRevision }
      : {}),
  };
}

function booking(overrides: Partial<DisplayBooking> = {}): DisplayBooking {
  return {
    id: 'booking_f4_01',
    revision: 2,
    instructorId: 'instructor_f4_01',
    instructorName: 'Coach',
    date: '2026-01-15',
    time: '10:00',
    durationHours: 1,
    startsAtEpochMs: Date.parse('2026-01-15T09:00:00.000Z'),
    endsAtEpochMs: Date.parse('2026-01-15T10:00:00.000Z'),
    status: 'confirmed',
    notes: '',
    participantId: 'participant_f4_a',
    participantIds: ['participant_f4_a', 'participant_f4_b', 'participant_f4_c'],
    participants: [
      participant({
        participantId: 'participant_f4_a',
        clientName: 'Alice',
        canRecordPresent: true,
        canRecordAbsent: true,
      }),
      participant({
        participantId: 'participant_f4_b',
        clientName: 'Bob',
        canRecordPresent: true,
        canRecordAbsent: true,
      }),
      participant({
        participantId: 'participant_f4_c',
        clientName: 'Cara',
        canRecordPresent: true,
        canRecordAbsent: true,
      }),
    ],
    clientName: 'Alice',
    clientAvatar: '',
    isGuest: false,
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
    ...overrides,
  };
}

function renderCard(
  displayBooking: DisplayBooking,
  collaboration: {
    submittingId?: string;
    handleRecordLessonAttendance: ReturnType<typeof vi.fn>;
  },
  options: {
    onOpenEval?: ReturnType<typeof vi.fn>;
    onUpdateStudentLevel?: ReturnType<typeof vi.fn>;
  } = {}
) {
  return render(
    <LanguageProvider>
      <InstructorBookingCard
        booking={displayBooking}
        usersList={[]}
        theme="light"
        language="en"
        t={t}
        onOpenChat={vi.fn()}
        onUpdateStudentLevel={options.onUpdateStudentLevel ?? vi.fn()}
        onOpenEval={options.onOpenEval ?? vi.fn()}
        canCreateProposal={true}
        onCreateProposal={vi.fn()}
        collaboration={
          {
            proposals: [],
            changeRequests: [],
            submittingId: collaboration.submittingId,
            handleRecordLessonAttendance: collaboration.handleRecordLessonAttendance,
            setCreateProposalParty: vi.fn(),
            handleWithdrawProposal: vi.fn(),
            handleCreateChangeRequest: vi.fn(),
            handleWithdrawChangeRequest: vi.fn(),
          } as never
        }
      />
    </LanguageProvider>
  );
}

function assessButton(studentName: string) {
  return screen.getByRole('button', {
    name: `${studentName}: ${translations.en.instructorAssess}`,
  }) as HTMLButtonElement;
}

function levelSelect(studentName: string) {
  return screen.getByRole('combobox', {
    name: `${studentName}: ${translations.en.instructorLevel}`,
  }) as HTMLSelectElement;
}

function recommendationsButton(studentName: string) {
  return screen.getByRole('button', {
    name: `${studentName}: ${translations.en.instructorRecommendations}`,
  }) as HTMLButtonElement;
}

describe('InstructorBookingCard factual attendance', () => {
  it('renders three participants independently and never uses a booking-level complete action', () => {
    renderCard(booking(), { handleRecordLessonAttendance: vi.fn() });
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Cara')).toBeTruthy();
    expect(screen.getAllByText(/Not recorded/)).toHaveLength(3);
    expect(screen.queryByText(translations.en.instructorCompleteLesson)).toBeNull();
    expect(screen.getAllByRole('button', { name: /Present/i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /Absent/i })).toHaveLength(3);
  });

  it('records the clicked participant, never the implicit first participant', () => {
    const handleRecordLessonAttendance = vi.fn();
    renderCard(booking(), { handleRecordLessonAttendance });
    fireEvent.click(screen.getByRole('button', { name: 'Bob: Present' }));
    expect(handleRecordLessonAttendance).toHaveBeenCalledTimes(1);
    expect(handleRecordLessonAttendance).toHaveBeenCalledWith({
      bookingId: 'booking_f4_01',
      participantId: 'participant_f4_b',
      attendanceStatus: 'present',
    });
  });

  it('renders present and absent from server evidence and sends revision on correction', () => {
    const handleRecordLessonAttendance = vi.fn();
    renderCard(
      booking({
        participants: [
          participant({
            participantId: 'participant_f4_a',
            clientName: 'Alice',
            attendanceStatus: 'present',
            attendanceRevision: 1,
            canRecordPresent: false,
            canRecordAbsent: true,
          }),
          participant({
            participantId: 'participant_f4_b',
            clientName: 'Bob',
            attendanceStatus: 'absent',
            attendanceRevision: 2,
            canRecordPresent: true,
            canRecordAbsent: false,
          }),
        ],
      }),
      { handleRecordLessonAttendance }
    );
    expect(screen.getByText(/Attendance: Present/)).toBeTruthy();
    expect(screen.getByText(/Attendance: Absent/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Alice: Absent' }));
    expect(handleRecordLessonAttendance).toHaveBeenCalledWith({
      bookingId: 'booking_f4_01',
      participantId: 'participant_f4_a',
      attendanceStatus: 'absent',
      expectedAttendanceRevision: 1,
    });
  });

  it('keeps submitting state participant-specific', () => {
    renderCard(booking(), {
      submittingId: 'booking_f4_01:participant_f4_b',
      handleRecordLessonAttendance: vi.fn(),
    });
    expect(
      (screen.getByRole('button', { name: 'Alice: Present' }) as HTMLButtonElement).disabled
    ).toBe(false);
    expect(
      (screen.getByRole('button', { name: 'Bob: Present' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});

describe('InstructorBookingCard lesson-context progress assessment', () => {
  it('disables Evaluate and level controls when attendance is missing', () => {
    renderCard(booking(), { handleRecordLessonAttendance: vi.fn() });
    expect(assessButton('Alice').disabled).toBe(true);
    expect(levelSelect('Alice').disabled).toBe(true);
    expect(recommendationsButton('Alice').disabled).toBe(true);
    expect(assessButton('Alice').title).toBe(translations.en.instructorAssessMarkAttendanceFirst);
    expect(recommendationsButton('Alice').title).toBe(
      translations.en.instructorAssessMarkAttendanceFirst
    );
  });

  it('enables Evaluate and level controls when attendance is present', () => {
    renderCard(
      booking({
        participants: [
          participant({
            participantId: 'participant_f4_a',
            clientName: 'Alice',
            attendanceStatus: 'present',
            attendanceRevision: 1,
            canRecordPresent: false,
            canRecordAbsent: true,
          }),
        ],
      }),
      { handleRecordLessonAttendance: vi.fn() }
    );
    expect(assessButton('Alice').disabled).toBe(false);
    expect(levelSelect('Alice').disabled).toBe(false);
    expect(recommendationsButton('Alice').disabled).toBe(false);
  });

  it('disables Evaluate and level controls when attendance is absent', () => {
    renderCard(
      booking({
        participants: [
          participant({
            participantId: 'participant_f4_a',
            clientName: 'Alice',
            attendanceStatus: 'absent',
            attendanceRevision: 1,
            canRecordPresent: true,
            canRecordAbsent: false,
          }),
        ],
      }),
      { handleRecordLessonAttendance: vi.fn() }
    );
    expect(assessButton('Alice').disabled).toBe(true);
    expect(levelSelect('Alice').disabled).toBe(true);
    expect(recommendationsButton('Alice').disabled).toBe(true);
  });

  it('gates each participant independently in a multi-participant booking', () => {
    renderCard(
      booking({
        participants: [
          participant({
            participantId: 'participant_f4_a',
            clientName: 'Alice',
            attendanceStatus: 'present',
            attendanceRevision: 1,
            canRecordPresent: false,
            canRecordAbsent: true,
          }),
          participant({
            participantId: 'participant_f4_b',
            clientName: 'Bob',
            attendanceStatus: 'absent',
            attendanceRevision: 1,
            canRecordPresent: true,
            canRecordAbsent: false,
          }),
          participant({
            participantId: 'participant_f4_c',
            clientName: 'Cara',
            canRecordPresent: true,
            canRecordAbsent: true,
          }),
        ],
      }),
      { handleRecordLessonAttendance: vi.fn() }
    );
    expect(assessButton('Alice').disabled).toBe(false);
    expect(assessButton('Bob').disabled).toBe(true);
    expect(assessButton('Cara').disabled).toBe(true);
    expect(levelSelect('Alice').disabled).toBe(false);
    expect(levelSelect('Bob').disabled).toBe(true);
    expect(levelSelect('Cara').disabled).toBe(true);
    expect(recommendationsButton('Alice').disabled).toBe(false);
    expect(recommendationsButton('Bob').disabled).toBe(true);
    expect(recommendationsButton('Cara').disabled).toBe(true);
  });

  it('opens evaluation for the clicked participant, not participant[0]', () => {
    const onOpenEval = vi.fn();
    renderCard(
      booking({
        participants: [
          participant({
            participantId: 'participant_f4_a',
            clientName: 'Alice',
            canRecordPresent: true,
            canRecordAbsent: true,
          }),
          participant({
            participantId: 'participant_f4_b',
            clientName: 'Bob',
            attendanceStatus: 'present',
            attendanceRevision: 1,
            canRecordPresent: false,
            canRecordAbsent: true,
          }),
        ],
      }),
      { handleRecordLessonAttendance: vi.fn() },
      { onOpenEval }
    );
    expect(assessButton('Alice').disabled).toBe(true);
    fireEvent.click(assessButton('Bob'));
    expect(onOpenEval).toHaveBeenCalledTimes(1);
    expect(onOpenEval).toHaveBeenCalledWith('participant_f4_b', 'Bob', 1, {}, {});
  });

  it('applies the same gate to a dependent participant row', () => {
    renderCard(
      booking({
        participants: [
          participant({
            participantId: 'participant_f4_child',
            clientName: 'Child Dependent',
            attendanceStatus: 'present',
            attendanceRevision: 1,
            canRecordPresent: false,
            canRecordAbsent: true,
          }),
        ],
      }),
      { handleRecordLessonAttendance: vi.fn() }
    );
    expect(assessButton('Child Dependent').disabled).toBe(false);
    expect(recommendationsButton('Child Dependent').disabled).toBe(false);
  });

  it('enables assessment only after server-backed present attendance is shown', () => {
    const onOpenEval = vi.fn();
    const handleRecordLessonAttendance = vi.fn();
    const { rerender } = render(
      <LanguageProvider>
        <InstructorBookingCard
          booking={booking()}
          usersList={[]}
          theme="light"
          language="en"
          t={t}
          onOpenChat={vi.fn()}
          onUpdateStudentLevel={vi.fn()}
          onOpenEval={onOpenEval}
          canCreateProposal={true}
          onCreateProposal={vi.fn()}
          collaboration={
            {
              proposals: [],
              changeRequests: [],
              handleRecordLessonAttendance,
              setCreateProposalParty: vi.fn(),
              handleWithdrawProposal: vi.fn(),
              handleCreateChangeRequest: vi.fn(),
              handleWithdrawChangeRequest: vi.fn(),
            } as never
          }
        />
      </LanguageProvider>
    );
    expect(assessButton('Alice').disabled).toBe(true);
    expect(recommendationsButton('Alice').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Alice: Present' }));
    expect(handleRecordLessonAttendance).toHaveBeenCalled();
    expect(assessButton('Alice').disabled).toBe(true);
    expect(recommendationsButton('Alice').disabled).toBe(true);

    rerender(
      <LanguageProvider>
        <InstructorBookingCard
          booking={booking({
            participants: [
              participant({
                participantId: 'participant_f4_a',
                clientName: 'Alice',
                attendanceStatus: 'present',
                attendanceRevision: 1,
                canRecordPresent: false,
                canRecordAbsent: true,
              }),
              participant({
                participantId: 'participant_f4_b',
                clientName: 'Bob',
                canRecordPresent: true,
                canRecordAbsent: true,
              }),
              participant({
                participantId: 'participant_f4_c',
                clientName: 'Cara',
                canRecordPresent: true,
                canRecordAbsent: true,
              }),
            ],
          })}
          usersList={[]}
          theme="light"
          language="en"
          t={t}
          onOpenChat={vi.fn()}
          onUpdateStudentLevel={vi.fn()}
          onOpenEval={onOpenEval}
          canCreateProposal={true}
          onCreateProposal={vi.fn()}
          collaboration={
            {
              proposals: [],
              changeRequests: [],
              handleRecordLessonAttendance,
              setCreateProposalParty: vi.fn(),
              handleWithdrawProposal: vi.fn(),
              handleCreateChangeRequest: vi.fn(),
              handleWithdrawChangeRequest: vi.fn(),
            } as never
          }
        />
      </LanguageProvider>
    );
    expect(assessButton('Alice').disabled).toBe(false);
    expect(recommendationsButton('Alice').disabled).toBe(false);
    fireEvent.click(assessButton('Alice'));
    expect(onOpenEval).toHaveBeenCalledWith('participant_f4_a', 'Alice', 1, {}, {});
  });

  it('keeps assessment disabled while attendance mutation is in flight without present facts', () => {
    renderCard(booking(), {
      submittingId: 'booking_f4_01:participant_f4_a',
      handleRecordLessonAttendance: vi.fn(),
    });
    expect(assessButton('Alice').disabled).toBe(true);
    expect(recommendationsButton('Alice').disabled).toBe(true);
  });

  it('disables lesson-context assessment again when attendance becomes absent', () => {
    renderCard(
      booking({
        participants: [
          participant({
            participantId: 'participant_f4_a',
            clientName: 'Alice',
            attendanceStatus: 'absent',
            attendanceRevision: 2,
            canRecordPresent: true,
            canRecordAbsent: false,
          }),
        ],
      }),
      { handleRecordLessonAttendance: vi.fn() }
    );
    expect(assessButton('Alice').disabled).toBe(true);
    expect(recommendationsButton('Alice').disabled).toBe(true);
  });
});

describe('InstructorStudents global progress surface', () => {
  it('keeps level editing available without lesson attendance gate', () => {
    render(
      <LanguageProvider>
        <InstructorStudents
          workspace={
            {
              t,
              theme: 'light',
              myStudents: [
                {
                  participantId: 'participant_global_01',
                  name: 'Global Student',
                  lessonsCount: 3,
                },
              ],
              handleUpdateStudentLevel: vi.fn(),
              progressById: {
                participant_global_01: { participantId: 'participant_global_01', level: 2 },
              },
            } as never
          }
        />
      </LanguageProvider>
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(false);
  });
});

describe('instructor confirmed filter outstanding attendance', () => {
  it('keeps a completed family_group booking visible on confirmed while facts remain open', () => {
    const completed = booking({
      status: 'completed',
      participants: [
        participant({
          participantId: 'participant_f4_a',
          clientName: 'Alice',
          attendanceStatus: 'present',
          attendanceRevision: 1,
          canRecordPresent: false,
          canRecordAbsent: false,
        }),
        participant({
          participantId: 'participant_f4_b',
          clientName: 'Bob',
          canRecordPresent: true,
          canRecordAbsent: true,
        }),
      ],
    });
    expect(isInstructorBookingVisibleForStatusFilter(completed, 'confirmed')).toBe(true);
    expect(
      isInstructorBookingVisibleForStatusFilter(
        booking({
          status: 'completed',
          participants: [
            participant({
              participantId: 'participant_f4_a',
              clientName: 'Alice',
              attendanceStatus: 'present',
              attendanceRevision: 1,
              canRecordPresent: false,
              canRecordAbsent: false,
            }),
          ],
        }),
        'confirmed'
      )
    ).toBe(false);
  });
});
