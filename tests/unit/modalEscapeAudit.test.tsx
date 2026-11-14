import React, { useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from '../../src/app/providers/LanguageContext';
import { CurrencyProvider } from '../../src/app/providers/CurrencyContext';
import { LevelUpModal } from '../../src/features/student-cabinet/components/LevelUpModal';
import { ReviewModal } from '../../src/features/student-cabinet/components/ReviewModal';
import { ConfirmActionModal } from '../../src/features/student-cabinet/components/ConfirmActionModal';
import { LessonDetailsModal } from '../../src/features/student-cabinet/components/LessonDetailsModal';
import { BookInstructorPickerModal } from '../../src/features/student-cabinet/components/student/BookInstructorPickerModal';
import { InstructorParticipantLessonFeedbackEditor } from '../../src/features/instructor-workspace/components/InstructorParticipantLessonFeedbackEditor';
import { InstructorBlockAction } from '../../src/features/booking-collaboration/components/InstructorBlockAction';
import { RescheduleBookingModal } from '../../src/features/booking-collaboration/components/RescheduleBookingModal';
import { CreateProposalModal } from '../../src/features/booking-collaboration/components/CreateProposalModal';
import { ChatWindow } from '../../src/features/bookings/components/booking_chat/ChatWindow';
import { PaymentGateway } from '../../src/features/bookings/components/PaymentGateway';
import {
  NotificationProvider,
  NotificationHubModal,
} from '../../src/features/notifications/PushNotificationHub';
import {
  NotificationProvider as CompatibilityProvider,
  NotificationHubModal as CompatibilityHub,
} from '../../src/features/notifications/service';
import { AdminModal } from '../../src/features/admin/components/AdminModal';
import type { Booking } from '../../src/types';

const editorState = vi.hoisted(() => ({ savePending: false }));
vi.mock('../../src/features/student-cabinet/usePresentedParticipantLessonFeedback', () => ({
  usePresentedParticipantLessonFeedback: () => ({
    participantId: null,
    feedbackForLesson: () => null,
  }),
}));
vi.mock(
  '../../src/features/instructor-workspace/useInstructorParticipantLessonFeedbackEditor',
  () => ({
    useInstructorParticipantLessonFeedbackEditor: () => ({
      ...editorState,
      loadState: 'ready',
      drafts: [],
      setDrafts: vi.fn(),
      save: vi.fn(),
    }),
  })
);
vi.mock('../../src/features/settings/schoolTimeZone', () => ({
  useSchoolTimeZone: () => ({ ready: true, timeZone: 'Asia/Almaty' }),
}));
vi.mock('../../src/features/booking-collaboration/useRescheduleBookingAvailability', () => ({
  useRescheduleBookingAvailability: () => ({
    availableSlots: ['10:00'],
    isLoadingBookings: false,
    occupancyLoadFailed: false,
  }),
}));

const booking = {
  id: 'lesson_a',
  bookingId: 'lesson_a',
  date: '2099-12-15',
  time: '10:00',
  timeZone: 'Asia/Almaty',
  durationHours: 1,
  instructorName: 'Coach',
  instructorId: 'coach',
  status: 'confirmed',
  participantNames: [],
} as unknown as Booking;
const emptyIds: string[] = [];
type Factory = (close: () => void, pending: boolean) => ReactNode;
const cases: [string, Factory][] = [
  ['LevelUpModal', (close) => <LevelUpModal level={2} theme="light" onClose={close} />],
  [
    'ReviewModal',
    (close, pending) => (
      <ReviewModal
        booking={booking}
        rating={5}
        setRating={() => {}}
        comment=""
        setComment={() => {}}
        isSubmitting={pending}
        onClose={close}
        onSubmit={() => {}}
      />
    ),
  ],
  [
    'ConfirmActionModal',
    (close) => (
      <ConfirmActionModal
        message="Confirm"
        reason=""
        setReason={() => {}}
        onCancel={close}
        onConfirm={() => {}}
      />
    ),
  ],
  [
    'LessonDetailsModal',
    (close) => <LessonDetailsModal booking={booking} courses={[]} onClose={close} />,
  ],
  [
    'BookInstructorPickerModal',
    (close) => (
      <BookInstructorPickerModal
        open
        onClose={close}
        userProfile={{ uid: 'account' } as never}
        bookings={[]}
        instructors={[]}
      />
    ),
  ],
  ['InstructorParticipantLessonFeedbackEditor', (close) => <Feedback close={close} />],
  [
    'RescheduleBookingModal',
    (close) => (
      <RescheduleBookingModal
        booking={booking as never}
        onClose={close}
        onSubmit={async () => {}}
      />
    ),
  ],
  [
    'CreateProposalModal',
    (close) => (
      <CreateProposalModal
        open
        instructorId="coach"
        participants={[]}
        defaultSelectedParticipantIds={emptyIds}
        onClose={close}
        onSubmit={async () => {}}
      />
    ),
  ],
  [
    'ChatWindow',
    (close) => (
      <ChatWindow booking={booking} onClose={close}>
        <input aria-label="Message" />
      </ChatWindow>
    ),
  ],
  [
    'PaymentGateway',
    (close) => (
      <PaymentGateway isOpen onClose={close} currentBalance={0} onPaymentSuccess={async () => {}} />
    ),
  ],
  ['NotificationHubModal', (close) => <NotificationHubModal isOpen onClose={close} />],
  [
    'CompatibilityNotificationHubModal',
    (close) => (
      <CompatibilityProvider>
        <CompatibilityHub isOpen onClose={close} />
      </CompatibilityProvider>
    ),
  ],
];
function Feedback({ close }: { close: () => void }) {
  const { t } = useLanguage();
  return (
    <InstructorParticipantLessonFeedbackEditor
      participantId="person"
      lessonBookingId="lesson"
      studentName="Student"
      t={t}
      onClose={close}
    />
  );
}
function Example({ factory, pending = false }: { factory: Factory; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <LanguageProvider>
      <CurrencyProvider>
        <NotificationProvider>
          <main tabIndex={-1}>
            <button onClick={() => setOpen(true)}>Open</button>
            <button>Background</button>
            {open && factory(() => setOpen(false), pending)}
          </main>
        </NotificationProvider>
      </CurrencyProvider>
    </LanguageProvider>
  );
}
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: () => {} });
});
afterEach(() => {
  cleanup();
  editorState.savePending = false;
});
for (const language of ['ru', 'en']) {
  describe(`${language}: migrated modal surfaces`, () => {
    for (const [name, factory] of cases) {
      it(`${name}: focus, both Tab directions, Escape, isolation and scroll restoration`, async () => {
        localStorage.setItem('alpine_glide_lang', language);
        render(<Example factory={factory} />);
        await userEvent.click(screen.getByText('Open'));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
        expect(screen.getByText('Background').closest('[inert]')).not.toBeNull();
        const controls = within(dialog)
          .getAllByRole('button')
          .filter((node) => !(node as HTMLButtonElement).disabled);
        controls[0].focus();
        await userEvent.tab({ shift: true });
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
        await userEvent.tab();
        expect(controls[0]).toHaveFocus();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByText('Open')).toHaveFocus();
        expect(document.documentElement).not.toHaveClass('modal-scroll-lock');
        expect(screen.getByText('Background').closest('[inert]')).toBeNull();
      });
    }
  });
}
it('Review and feedback editor cannot close during submission', async () => {
  for (const name of ['ReviewModal', 'InstructorParticipantLessonFeedbackEditor']) {
    editorState.savePending = true;
    render(<Example factory={cases.find(([key]) => key === name)![1]} pending />);
    await userEvent.click(screen.getByText('Open'));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    cleanup();
  }
});
it.each(['ru', 'en'])(
  'InstructorBlockAction %s shares the stack with AdminModal and respects loading',
  async (language) => {
    localStorage.setItem('alpine_glide_lang', language);
    function Nested({ pending = false }) {
      return (
        <LanguageProvider>
          <AdminModal title="Parent" onClose={vi.fn()} closeLabel="Close">
            <InstructorBlockAction access={undefined} loading={pending} onBlock={async () => {}} />
          </AdminModal>
        </LanguageProvider>
      );
    }
    const view = render(<Nested />);
    fireEvent.click(screen.getByRole('button', { name: /Block|Заблокировать/i }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    view.rerender(<Nested pending />);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).not.toHaveAccessibleName('Parent');
    view.rerender(<Nested />);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Parent' })).toBeInTheDocument();
  }
);

it.each(['reschedule', 'proposal'])(
  '%s cannot dismiss during its existing submit operation',
  async (kind) => {
    const close = vi.fn();
    let finish!: () => void;
    const submit = () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      });
    const factory: Factory = () =>
      kind === 'reschedule' ? (
        <RescheduleBookingModal booking={booking as never} onClose={close} onSubmit={submit} />
      ) : (
        <CreateProposalModal
          open
          instructorId="coach"
          participants={[{ participantId: 'p1', label: 'Student', selectable: true }]}
          defaultSelectedParticipantIds={['p1']}
          defaultDate="2099-12-15"
          defaultTime="10:00"
          onClose={close}
          onSubmit={submit}
        />
      );
    render(<Example factory={factory} />);
    await userEvent.click(screen.getByText('Open'));
    const buttons = within(screen.getByRole('dialog')).getAllByRole('button');
    await userEvent.click(buttons.at(-1)!);
    expect(finish).toBeTypeOf('function');
    await userEvent.keyboard('{Escape}');
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      finish();
    });
    expect(close).toHaveBeenCalledOnce();
  }
);
