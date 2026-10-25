import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CurrencyProvider } from '../../../src/app/providers/CurrencyContext';
import { useLanguage } from '../../../src/app/providers/LanguageContext';
import { BOOKING_MODAL_SHELL_CLASS } from '../../../src/features/bookings/components/booking_modal/bookingModalLayout';
import { BookingModalHeader } from '../../../src/features/bookings/components/booking_modal/BookingModalHeader';
import { AuthBookingForm } from '../../../src/features/bookings/components/booking_modal/AuthBookingForm';
import type { useBookingModal } from '../../../src/features/bookings/components/booking_modal/useBookingModal';
import { BodyScrollLock } from '../../../src/ui/BodyScrollLock';
import type { Instructor } from '../../../src/types';

/** Actual reference UI with a local workspace; no booking commands or subscriptions. */
export function Reference({
  instructor,
  onClose,
}: {
  instructor: Instructor;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const [date, setDate] = useState('2026-12-15');
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(2);
  const [notes, setNotes] = useState('');
  const workspace = {
    t,
    language,
    date,
    setDate,
    time,
    setTime,
    duration,
    setDuration,
    notes,
    setNotes,
    difficulty: 'beginner',
    setDifficulty: () => {},
    guestDiscipline: 'ski',
    setGuestDiscipline: () => {},
    getDifficultyLabel: () => 'Начинающий',
    availableSlots: ['10:00', '11:00'],
    minBookingDateStr: '2026-10-13',
    managedParticipants: [
      {
        participantId: 'self',
        displayName: 'Анна Смирнова',
        authority: 'self',
        age: { kind: 'age_years', years: 30 },
        discipline: 'ski',
        skillLevel: 'beginner',
      },
    ],
    selectedParticipantIds: [],
    reloadManagedParticipants: () => {},
    toggleParticipant: () => {},
    totalCost: 24000,
    bookingWallet: { balance: 20000, status: 'ready', insufficient: true, canPay: false },
    maxParticipantsPerLesson: 4,
    additionalParticipantSurchargePerHourKzt: 6000,
    targetInstructor: instructor,
    userProfile: { uid: 'reference', isClientActive: true },
    handleSubmit: (event: React.FormEvent) => event.preventDefault(),
  } as unknown as ReturnType<typeof useBookingModal>;
  return createPortal(
    <CurrencyProvider>
      <div className="fixed inset-0 z-[70] overflow-hidden">
        <BodyScrollLock />
        <div className="ui-modal-overlay fixed inset-0 h-[100dvh] w-screen max-w-none !rounded-none border-0" />
        <div className="pointer-events-none fixed inset-0 z-10 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <div className={BOOKING_MODAL_SHELL_CLASS} role="dialog" aria-label="Эталон бронирования">
            <BookingModalHeader targetInstructor={instructor} t={t} onClose={onClose} />
            <AuthBookingForm workspace={workspace} />
          </div>
        </div>
      </div>
    </CurrencyProvider>,
    document.body
  );
}
