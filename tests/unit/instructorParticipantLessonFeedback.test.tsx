import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InstructorBookingCard } from '../../src/features/instructor-workspace/components/InstructorBookingCard';
import type { DisplayBooking } from '../../src/features/instructor-workspace/components/useInstructorWorkspace';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations } from '../../src/lib/i18n/translations';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';

const queryMock = vi.fn();
const saveMock = vi.fn();

vi.mock('../../src/features/participant-lesson-feedback', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/features/participant-lesson-feedback')
  >('../../src/features/participant-lesson-feedback');
  return {
    ...actual,
    queryInstructorLessonParticipantFeedback: (...args: unknown[]) => queryMock(...args),
    saveInstructorParticipantLessonFeedback: (...args: unknown[]) => saveMock(...args),
  };
});

vi.mock('../../src/features/auth/authStore', () => ({
  useAuthStore: (selector: (state: { firebaseUser: { uid: string } | null }) => unknown) =>
    selector({ firebaseUser: { uid: 'account_instructor_01' } }),
}));

vi.mock('../../src/features/booking-collaboration', () => ({
  InstructorCollaborationPanel: () => null,
}));

const t = (key: keyof (typeof translations)['en']) => translations.en[key];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function participant(input: {
  participantId: string;
  clientName: string;
  attendanceStatus?: 'present' | 'absent';
}): DisplayBooking['participants'][number] {
  return {
    participantId: input.participantId,
    clientName: input.clientName,
    clientAvatar: '',
    canRecordPresent: input.attendanceStatus !== 'present',
    canRecordAbsent: input.attendanceStatus !== 'absent',
    ...(input.attendanceStatus ? { attendanceStatus: input.attendanceStatus } : {}),
    ...(input.attendanceStatus ? { attendanceRevision: 1 } : {}),
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
    participantIds: ['participant_f4_a', 'participant_f4_b'],
    participants: [
      participant({
        participantId: 'participant_f4_a',
        clientName: 'Alice',
        attendanceStatus: 'present',
      }),
      participant({
        participantId: 'participant_f4_b',
        clientName: 'Bob',
        attendanceStatus: 'present',
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

function renderCard(displayBooking: DisplayBooking = booking()) {
  return render(
    <LanguageProvider>
      <InstructorBookingCard
        booking={displayBooking}
        usersList={[]}
        theme="light"
        language="en"
        t={t}
        onOpenChat={vi.fn()}
        onUpdateStudentLevel={vi.fn()}
        onOpenEval={vi.fn()}
        canCreateProposal={true}
        onCreateProposal={vi.fn()}
        collaboration={
          {
            proposals: [],
            changeRequests: [],
            handleRecordLessonAttendance: vi.fn(),
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

function recommendationsButton(studentName: string) {
  return screen.getByRole('button', {
    name: `${studentName}: ${translations.en.instructorRecommendations}`,
  });
}

async function openRecommendations(studentName: string) {
  fireEvent.click(recommendationsButton(studentName));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
}

describe('InstructorBookingCard canonical lesson feedback', () => {
  beforeEach(() => {
    queryMock.mockReset();
    saveMock.mockReset();
    queryMock.mockImplementation(
      async (input: { participantId: string; lessonBookingId: string }) => ({
        participantId: input.participantId,
        lessonBookingId: input.lessonBookingId,
        items: [],
        revision: 0,
      })
    );
    saveMock.mockResolvedValue({ revision: 1 });
  });

  it('loads canonical feedback for the opened participant and not a booking fallback', async () => {
    queryMock.mockImplementation(
      async (input: { participantId: string; lessonBookingId: string }) => {
        if (input.participantId === 'participant_f4_a') {
          return {
            participantId: input.participantId,
            lessonBookingId: input.lessonBookingId,
            items: [{ itemId: 'item_a', text: 'Alice drill' }],
            revision: 1,
          };
        }
        return {
          participantId: input.participantId,
          lessonBookingId: input.lessonBookingId,
          items: [{ itemId: 'item_b', text: 'Bob drill' }],
          revision: 2,
        };
      }
    );

    renderCard();
    await openRecommendations('Alice');
    expect(await screen.findByDisplayValue('Alice drill')).toBeTruthy();
    expect(screen.queryByDisplayValue('Bob drill')).toBeNull();
    expect(queryMock).toHaveBeenCalledWith({
      participantId: 'participant_f4_a',
      lessonBookingId: 'booking_f4_01',
    });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('shows an empty editor when canonical feedback is missing', async () => {
    renderCard();
    await openRecommendations('Alice');
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: translations.en.instructorAddRecommendation })
    ).toBeTruthy();
  });

  it('keeps A and B feedback isolated, including a late A response', async () => {
    const aliceLoad = deferred<{
      participantId: string;
      lessonBookingId: string;
      items: { itemId: string; text: string }[];
      revision: number;
    }>();
    queryMock
      .mockImplementationOnce(() => aliceLoad.promise)
      .mockResolvedValueOnce({
        participantId: 'participant_f4_b',
        lessonBookingId: 'booking_f4_01',
        items: [{ itemId: 'item_b', text: 'Bob drill' }],
        revision: 2,
      });

    renderCard();
    fireEvent.click(recommendationsButton('Alice'));
    await waitFor(() => expect(screen.getByText(translations.en.loading)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Recommendations$/ }));
    await openRecommendations('Bob');
    expect(await screen.findByDisplayValue('Bob drill')).toBeTruthy();

    aliceLoad.resolve({
      participantId: 'participant_f4_a',
      lessonBookingId: 'booking_f4_01',
      items: [{ itemId: 'item_a', text: 'Alice drill' }],
      revision: 1,
    });
    await Promise.resolve();
    expect(screen.getByDisplayValue('Bob drill')).toBeTruthy();
    expect(screen.queryByDisplayValue('Alice drill')).toBeNull();
  });

  it('reopens A with A data after visiting B', async () => {
    queryMock.mockImplementation(
      async (input: { participantId: string; lessonBookingId: string }) => {
        if (input.participantId === 'participant_f4_a') {
          return {
            participantId: input.participantId,
            lessonBookingId: input.lessonBookingId,
            items: [{ itemId: 'item_a', text: 'Alice drill' }],
            revision: 1,
          };
        }
        return {
          participantId: input.participantId,
          lessonBookingId: input.lessonBookingId,
          items: [{ itemId: 'item_b', text: 'Bob drill' }],
          revision: 2,
        };
      }
    );

    renderCard();
    await openRecommendations('Alice');
    expect(await screen.findByDisplayValue('Alice drill')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Recommendations$/ }));
    await openRecommendations('Bob');
    expect(await screen.findByDisplayValue('Bob drill')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Recommendations$/ }));
    await openRecommendations('Alice');
    expect(await screen.findByDisplayValue('Alice drill')).toBeTruthy();
    expect(screen.queryByDisplayValue('Bob drill')).toBeNull();
  });

  it('adds, edits, and removes items then saves participant identity and revision', async () => {
    renderCard();
    await openRecommendations('Alice');
    fireEvent.click(
      screen.getByRole('button', { name: translations.en.instructorAddRecommendation })
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  New drill  ' } });
    fireEvent.click(screen.getByRole('button', { name: translations.en.saveChanges }));

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        participantId: 'participant_f4_a',
        lessonBookingId: 'booking_f4_01',
        expectedRevision: 0,
        items: [expect.objectContaining({ text: 'New drill' })],
      })
    );
    const saveInput = saveMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saveInput).not.toHaveProperty('instructorId');
    expect(saveInput).not.toHaveProperty('userId');
    await waitFor(() =>
      expect(screen.getByText(translations.en.instructorRecommendationsSaved)).toBeTruthy()
    );
  });

  it('saves an empty canonical aggregate after all items are removed', async () => {
    queryMock.mockResolvedValue({
      participantId: 'participant_f4_a',
      lessonBookingId: 'booking_f4_01',
      items: [{ itemId: 'item_a', text: 'Alice drill' }],
      revision: 3,
    });
    renderCard();
    await openRecommendations('Alice');
    expect(await screen.findByDisplayValue('Alice drill')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: translations.en.instructorRemoveRecommendation })
    );
    fireEvent.click(screen.getByRole('button', { name: translations.en.saveChanges }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        participantId: 'participant_f4_a',
        lessonBookingId: 'booking_f4_01',
        expectedRevision: 3,
        items: [],
      })
    );
  });

  it('blocks duplicate submit while save is pending', async () => {
    const pendingSave = deferred<{ revision: number }>();
    saveMock.mockImplementationOnce(() => pendingSave.promise);
    renderCard();
    await openRecommendations('Alice');
    const saveButton = screen.getByRole('button', { name: translations.en.saveChanges });
    fireEvent.click(saveButton);
    await waitFor(() => expect(saveButton).toBeDisabled());
    fireEvent.click(saveButton);
    expect(saveMock).toHaveBeenCalledTimes(1);
    pendingSave.resolve({ revision: 1 });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });

  it('refetches on stale_version and does not keep the rejected draft as success', async () => {
    queryMock
      .mockResolvedValueOnce({
        participantId: 'participant_f4_a',
        lessonBookingId: 'booking_f4_01',
        items: [{ itemId: 'item_a', text: 'Alice drill' }],
        revision: 1,
      })
      .mockResolvedValueOnce({
        participantId: 'participant_f4_a',
        lessonBookingId: 'booking_f4_01',
        items: [{ itemId: 'item_server', text: 'Server Alice' }],
        revision: 4,
      });
    saveMock.mockRejectedValueOnce(
      new CanonicalCommandClientError('stale_version', { correlationId: 'correlation_stale_01' })
    );

    renderCard();
    await openRecommendations('Alice');
    const input = (await screen.findByDisplayValue('Alice drill')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Stale overwrite' } });
    fireEvent.click(screen.getByRole('button', { name: translations.en.saveChanges }));

    expect(await screen.findByDisplayValue('Server Alice')).toBeTruthy();
    expect(screen.queryByDisplayValue('Stale overwrite')).toBeNull();
    expect(screen.queryByText(translations.en.instructorRecommendationsSaved)).toBeNull();
    expect(screen.getByText('The record changed; refresh it before retrying.')).toBeTruthy();
  });

  it('does not fake success when save fails', async () => {
    queryMock.mockResolvedValue({
      participantId: 'participant_f4_a',
      lessonBookingId: 'booking_f4_01',
      items: [{ itemId: 'item_a', text: 'Alice drill' }],
      revision: 1,
    });
    saveMock.mockRejectedValueOnce(
      new CanonicalCommandClientError('internal', { correlationId: 'correlation_fail_01' })
    );

    renderCard();
    await openRecommendations('Alice');
    const input = (await screen.findByDisplayValue('Alice drill')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: translations.en.saveChanges }));

    expect(await screen.findByText('The operation could not be completed.')).toBeTruthy();
    expect(screen.getByDisplayValue('Unsaved draft')).toBeTruthy();
    expect(screen.queryByText(translations.en.instructorRecommendationsSaved)).toBeNull();
  });

  it('opens feedback for a dependent participant without a /users account', async () => {
    queryMock.mockResolvedValue({
      participantId: 'participant_f4_child',
      lessonBookingId: 'booking_f4_01',
      items: [{ itemId: 'item_child', text: 'Child drill' }],
      revision: 1,
    });
    renderCard(
      booking({
        participantId: 'participant_f4_child',
        participantIds: ['participant_f4_child'],
        participants: [
          participant({
            participantId: 'participant_f4_child',
            clientName: 'Child Dependent',
            attendanceStatus: 'present',
          }),
        ],
      })
    );
    await openRecommendations('Child Dependent');
    expect(await screen.findByDisplayValue('Child drill')).toBeTruthy();
    expect(queryMock).toHaveBeenCalledWith({
      participantId: 'participant_f4_child',
      lessonBookingId: 'booking_f4_01',
    });
  });
});
