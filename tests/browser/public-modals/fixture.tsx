import { LevelUpModal } from '../../../src/features/student-cabinet/components/LevelUpModal';
import { ReviewModal } from '../../../src/features/student-cabinet/components/ReviewModal';
import { ConfirmActionModal } from '../../../src/features/student-cabinet/components/ConfirmActionModal';
import { LessonDetailsModal } from '../../../src/features/student-cabinet/components/LessonDetailsModal';
import { BookInstructorPickerModal } from '../../../src/features/student-cabinet/components/student/BookInstructorPickerModal';
import { ChatWindow } from '../../../src/features/bookings/components/booking_chat/ChatWindow';
import { PaymentGateway } from '../../../src/features/bookings/components/PaymentGateway';
import { NotificationHubModal } from '../../../src/features/notifications';
import { BookingAppleSelect } from '../../../src/features/bookings/components/booking_modal/BookingAppleSelect';
import { BookingAppleDatePicker } from '../../../src/features/bookings/components/booking_modal/BookingAppleDatePicker';
import { AdminModal } from '../../../src/features/admin/components/AdminModal';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../../src/app/providers/LanguageContext';
import { CurrencyProvider } from '../../../src/app/providers/CurrencyContext';
import { NotificationProvider } from '../../../src/features/notifications';
import { CourseDetailsModal } from '../../../src/features/courses/components/CourseDetailsModal';
import { CourseEnrollmentModal } from '../../../src/features/courses/components/CourseEnrollmentModal';
import { AuthModal } from '../../../src/features/auth/components/AuthModal';
import { BookingModal } from '../../../src/features/bookings/components/BookingModal';
import { InstructorReviewsModal } from '../../../src/features/profile/components/InstructorReviewsModal';
import { useCourseEnrollmentStore } from '../../../src/features/course-enrollments/courseEnrollmentStore';
import type { Booking, Course, Instructor } from '../../../src/types';
import '../../../src/index.css';

const course = {
  id: 'accessibility-fixture',
  title: 'Ski course',
  discipline: 'ski',
  level: 'beginner',
  dates: '2026-12-15',
  duration: '3 days',
  availableSeats: 4,
  totalSeats: 8,
  priceKZT: 24000,
  benefits: ['Learn skiing'],
  program: [],
  faq: [],
  galleryPhotos: [],
} as Course;

const operational = {
  availableSeats: 4,
  totalSeats: 8,
  isEnrollmentEligible: true,
  isFull: false,
} as never;
useCourseEnrollmentStore.setState({
  catalogStatus: 'ready',
  catalogByCourseId: new Map([[course.id, operational]]),
});
const instructor = {
  id: 'fixture-coach',
  name: 'Ski coach',
  specialty: 'ski',
  rating: null,
  reviewsCount: 0,
  experienceYears: 5,
  isAvailable: true,
  pricePerHourKZT: 12000,
} as Instructor;

const lesson = {
  id: 'lesson_fixture',
  instructorId: 'coach',
  instructorName: 'Coach',
  date: '2099-12-15',
  time: '10:00',
  durationHours: 1,
  status: 'confirmed',
} as Booking;
function MigratedSurfaces() {
  const { setLanguage } = useLanguage();
  const [kind, setKind] = useState('');
  const [nested, setNested] = useState(false);
  const [pending, setPending] = useState(false);
  const close = () => setKind('');
  return (
    <>
      <button onClick={() => setLanguage('ru')}>Russian</button>
      <button onClick={() => setLanguage('en')}>English</button>
      {[
        'level',
        'review',
        'confirm',
        'lesson',
        'picker',
        'chat',
        'payment',
        'notifications',
        'nested',
        'simultaneous',
      ].map((key) => (
        <button
          key={key}
          onClick={() => {
            setKind(key);
            if (key === 'simultaneous') setNested(true);
          }}
        >
          Open {key}
        </button>
      ))}
      {kind === 'level' && <LevelUpModal level={2} theme="light" onClose={close} />}
      {kind === 'review' && (
        <ReviewModal
          booking={lesson}
          rating={5}
          setRating={() => {}}
          comment=""
          setComment={() => {}}
          onClose={close}
          isSubmitting={pending}
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
          }}
        />
      )}
      {kind === 'confirm' && (
        <ConfirmActionModal
          message="Confirm?"
          reason=""
          setReason={() => {}}
          onCancel={close}
          onConfirm={() => {}}
        />
      )}
      {kind === 'lesson' && <LessonDetailsModal booking={lesson} courses={[]} onClose={close} />}
      <BookInstructorPickerModal
        open={kind === 'picker'}
        onClose={close}
        userProfile={{ uid: 'fixture' } as never}
        bookings={[]}
        instructors={[]}
      />
      {kind === 'chat' && (
        <ChatWindow booking={lesson} onClose={close}>
          <input aria-label="Message" />
        </ChatWindow>
      )}
      <PaymentGateway
        isOpen={kind === 'payment'}
        onClose={close}
        currentBalance={0}
        onPaymentSuccess={async () => {}}
      />
      <NotificationHubModal isOpen={kind === 'notifications'} onClose={close} />
      {(kind === 'nested' || kind === 'simultaneous') && (
        <AdminModal title="Parent" onClose={close} closeLabel="Close parent">
          <BookingAppleSelect
            aria-label="Select"
            value="1"
            onChange={() => {}}
            options={[
              { value: '1', label: 'One' },
              { value: '2', label: 'Two' },
            ]}
          />
          <BookingAppleDatePicker
            aria-label="Calendar"
            value="2099-12-15"
            onChange={() => {}}
            locale="en-US"
          />
          <button onClick={() => setNested(true)}>Open child</button>
          {nested && (
            <ConfirmActionModal
              message="Nested"
              reason=""
              setReason={() => {}}
              onCancel={() => setNested(false)}
              onConfirm={() => {}}
            />
          )}
        </AdminModal>
      )}
    </>
  );
}

export function Fixture() {
  const [details, setDetails] = useState(false);
  const [enroll, setEnroll] = useState(false);
  const [auth, setAuth] = useState(false);
  const [booking, setBooking] = useState(false);
  const [reviews, setReviews] = useState(false);
  return (
    <LanguageProvider>
      <CurrencyProvider>
        <NotificationProvider>
          <main tabIndex={-1} style={{ minHeight: 2400, padding: 24 }}>
            <button className="btn-primary p-3" onClick={() => setDetails(true)}>
              Open course
            </button>
            <button className="btn-primary p-3" onClick={() => setAuth(true)}>
              Open auth
            </button>
            <button className="btn-primary p-3" onClick={() => setEnroll(true)}>
              Open enrollment
            </button>
            <button onClick={() => setBooking(true)}>Open booking</button>
            <button onClick={() => setReviews(true)}>Open reviews</button>
            <a href="#background">Background link</a>
            <MigratedSurfaces />
            <CourseDetailsModal
              isOpen={details}
              onClose={() => setDetails(false)}
              rawCourse={course}
              course={course}
              instructors={[]}
              userProfile={null}
              isEnrolled={false}
              catalogOperational={operational}
              onEnroll={() => setEnroll(true)}
            />
            <CourseEnrollmentModal
              isOpen={enroll}
              onClose={() => setEnroll(false)}
              course={course}
              userProfile={null}
              onEnroll={() => {}}
            />
            <AuthModal isOpen={auth} onClose={() => setAuth(false)} />
            <BookingModal
              isOpen={booking}
              onClose={() => setBooking(false)}
              instructor={instructor}
              userProfile={null}
            />
            <InstructorReviewsModal
              isOpen={reviews}
              onClose={() => setReviews(false)}
              instructor={instructor}
              reviews={[]}
            />
          </main>
        </NotificationProvider>
      </CurrencyProvider>
    </LanguageProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
