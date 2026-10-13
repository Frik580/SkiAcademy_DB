import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { NotificationProvider } from '../../../src/features/notifications';
import { LinkGuestBookingModal } from '../../../src/features/admin/components/bookings/LinkGuestBookingModal';
import { ScheduleSlotActionModal } from '../../../src/features/admin/components/schedule/ScheduleSlotActionModal';
import { ChatWindow } from '../../../src/features/bookings/components/booking_chat/ChatWindow';
import { AdminModal } from '../../../src/features/admin/components/AdminModal';
import { Reference } from './reference';
import { ChatFixture } from './chatFixture';
import { BOOKING_MODAL_SHELL_CLASS } from '../../../src/features/bookings/components/booking_modal/bookingModalLayout';
import { BookingAppleWheelPicker } from '../../../src/features/bookings/components/booking_modal/BookingAppleWheelPicker';
import { ActionButton } from '../../../src/ui/ActionButton';
import { NativeFixture } from './nativeFixture';
import type { Booking, Instructor, UserProfile } from '../../../src/types';
import '../../../src/index.css';

const instructor = {
  id: 'coach',
  name: 'Александр Иванов',
  specialty: 'both',
  isAvailable: true,
  pricePerHourKZT: 12000,
} as Instructor;
const admin = { uid: 'admin-fixture', role: 'admin', displayName: 'Администратор' } as UserProfile;
const booking = {
  id: 'booking-fixture',
  date: '2026-12-15',
  time: '10:00',
  durationHours: 2,
  instructorId: 'coach',
  instructorName: instructor.name,
  userId: 'guest',
  guestName: 'Анна Смирнова',
  guestEmail: 'anna@example.test',
  totalPrice: 24000,
  status: 'confirmed',
} as Booking;
const users = Array.from(
  { length: 24 },
  (_, i) =>
    ({
      uid: `client-${i}`,
      displayName: `Клиент ${i + 1}`,
      email: `client-${i}@example.test`,
      role: 'user',
    }) as UserProfile
);

function Fixture() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  const kind = new URLSearchParams(location.search).get('kind') ?? 'slot';
  return (
    <LanguageProvider>
      <NotificationProvider>
        <main style={{ minHeight: 2400, padding: 24, transform: 'translateZ(0)' }}>
          <h1 className="type-page-title">
            Административная панель — изолированная проверка компонентов
          </h1>
          <p className="type-body">
            Локальные данные. Команды сохранения заменены тестовыми callbacks.
          </p>
          <div style={{ marginTop: 700 }}>
            <button className="btn-primary px-4 py-3" onClick={() => setOpen(true)}>
              Открыть окно
            </button>
          </div>
          <output data-testid="saved">{saved}</output>
          {(kind === 'native-confirm' || kind === 'native-alert') && open && (
            <NativeFixture
              kind={kind}
              onResult={(value) => {
                setSaved(value);
                setOpen(false);
              }}
            />
          )}
          <div hidden data-testid="style-reference">
            <div className={BOOKING_MODAL_SHELL_CLASS} data-testid="reference-shell" />
            <div data-testid="reference-choice">
              <BookingAppleWheelPicker
                value="1"
                onChange={() => {}}
                options={[{ value: '1', label: 'Выбор' }]}
              />
            </div>
            <input className="ui-field-plain" data-testid="reference-field" />
            <button className="btn-primary" data-testid="reference-primary">
              Сохранить
            </button>
          </div>
          {(kind === 'slot' || kind === 'move') && (
            <ScheduleSlotActionModal
              activeSlot={
                open
                  ? { instructor, time: '10:00', booking: kind === 'move' ? booking : undefined }
                  : null
              }
              selectedDate="2026-12-15"
              instructors={[instructor]}
              bookings={[]}
              courses={[]}
              usersList={users}
              adminProfile={admin}
              onClose={() => setOpen(false)}
              onCancelBooking={async () => {}}
              onRescheduleBooking={async () => {
                setSaved('rescheduled');
              }}
              onReassignInstructor={async () => {
                setSaved('reassigned');
              }}
              onChangeBookingDuration={async () => {
                setSaved('duration');
              }}
              onAddBooking={async (input) => {
                setSaved(JSON.stringify(input));
              }}
            />
          )}
          {kind === 'link' && (
            <LinkGuestBookingModal
              isOpen={open}
              onClose={() => setOpen(false)}
              booking={booking}
              usersList={users}
              onLinkBooking={async (id, userId) => {
                setSaved(`${id}/${userId}`);
              }}
            />
          )}
          {kind === 'chat' && open && (
            <ChatWindow fromAdminPanel booking={booking} onClose={() => setOpen(false)}>
              <ChatFixture onSend={() => setSaved('message')} />
            </ChatWindow>
          )}
          {kind === 'reference' && open && (
            <Reference instructor={instructor} onClose={() => setOpen(false)} />
          )}
          {(kind === 'confirm' || kind === 'long') && open && (
            <AdminModal
              title="Подтверждение действия"
              closeLabel="Закрыть подтверждение"
              onClose={() => setOpen(false)}
              width={kind === 'long' ? 'lg' : 'sm'}
              footer={
                <>
                  <ActionButton
                    unstyled
                    className="btn-secondary flex-1 px-4 py-3"
                    onClick={() => setOpen(false)}
                  >
                    Отмена
                  </ActionButton>
                  <ActionButton
                    className="btn-primary flex-1 px-4 py-3"
                    onClick={() => setSaved('confirmed')}
                  >
                    Подтвердить
                  </ActionButton>
                </>
              }
            >
              {Array.from({ length: kind === 'long' ? 40 : 1 }, (_, i) => (
                <p key={i} className="type-caption">
                  Проверьте выбранное занятие и участников перед подтверждением. Идентификатор:{' '}
                  {'participant_'.repeat(8)}
                  {i}
                </p>
              ))}
              {kind === 'long' && <input className="ui-field-plain" aria-label="Последнее поле" />}
            </AdminModal>
          )}
        </main>
      </NotificationProvider>
    </LanguageProvider>
  );
}
localStorage.setItem('alpine_glide_lang', 'ru');
document.documentElement.classList.toggle(
  'dark',
  new URLSearchParams(location.search).get('theme') === 'dark'
);
createRoot(document.getElementById('root')!).render(<Fixture />);
