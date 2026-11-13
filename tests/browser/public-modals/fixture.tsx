import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { CurrencyProvider } from '../../../src/app/providers/CurrencyContext';
import { NotificationProvider } from '../../../src/features/notifications';
import { CourseDetailsModal } from '../../../src/features/courses/components/CourseDetailsModal';
import { CourseEnrollmentModal } from '../../../src/features/courses/components/CourseEnrollmentModal';
import { AuthModal } from '../../../src/features/auth/components/AuthModal';
import { BookingModal } from '../../../src/features/bookings/components/BookingModal';
import { InstructorReviewsModal } from '../../../src/features/profile/components/InstructorReviewsModal';
import { useCourseEnrollmentStore } from '../../../src/features/course-enrollments/courseEnrollmentStore';
import type { Course, Instructor } from '../../../src/types';
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
