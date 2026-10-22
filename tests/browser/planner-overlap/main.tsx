import React from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { NotificationProvider } from '../../../src/features/notifications';
import { ScheduleCalendar } from '../../../src/features/admin/components/schedule/ScheduleCalendar';
import type { Booking, Instructor, UserProfile } from '../../../src/types';
import '../../../src/index.css';
const params = new URLSearchParams(location.search);
localStorage.setItem('alpine_glide_lang', params.get('lang') || 'en');
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
const instructor = { id: 'coach', name: 'Coach', isAvailable: true } as Instructor;
const bookings = [
  {
    id: 'booking_a',
    userId: 'payer',
    instructorId: 'coach',
    date: '2026-10-22',
    time: '08:00',
    durationHours: 3,
    status: 'completed',
    guestName: 'child1, Tester-two, child3, child2',
  },
  {
    id: 'booking_b',
    userId: 'payer2',
    instructorId: 'coach',
    date: '2026-10-22',
    time: '10:00',
    durationHours: 2,
    status: 'completed',
    guestName: 'child2',
  },
] as Booking[];
if (params.has('long')) bookings[0]!.guestName = 'Participant'.repeat(25);
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <NotificationProvider>
      <main className="p-2">
        <ScheduleCalendar
          instructors={[instructor]}
          bookings={bookings}
          courses={[]}
          usersList={[]}
          adminProfile={{ uid: 'admin' } as UserProfile}
          plannerDate="2026-10-22"
          plannerView={params.get('view') === 'week' ? 'week' : 'day'}
          onCancelBooking={async () => {}}
        />
      </main>
    </NotificationProvider>
  </LanguageProvider>
);
