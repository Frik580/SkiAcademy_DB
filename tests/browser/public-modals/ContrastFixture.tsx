import { HeroCarousel } from '../../../src/app/components/HeroCarousel';
import { FALLBACK_SLIDES } from '../../../src/app/config/fallbackHeroSlides';
import { useLanguage } from '../../../src/app/providers/LanguageContext';
import { GroupCourseCard } from '../../../src/features/courses/components/GroupCourseCard';
import { CourseEnrollAction } from '../../../src/features/courses/components/course_details/CourseEnrollAction';
import { InstructorCard } from '../../../src/features/profile/components/InstructorCard';
import type { Course, Instructor } from '../../../src/types';

// Real components with local props; no catalog writes or booking submissions.
const course = {
  id: 'contrast-fixture',
  title: 'Ski course',
  discipline: 'ski',
  level: 'beginner',
  dates: '2026-12-15',
  duration: '3 days',
  availableSeats: 4,
  totalSeats: 8,
  priceKZT: 24000,
  shortDescription: 'Course description',
  benefits: [],
  program: [],
  faq: [],
  galleryPhotos: [],
} as Course;
const instructor = {
  id: 'contrast-coach',
  name: 'Ski coach',
  specialty: 'ski',
  rating: 4.8,
  reviewsCount: 12,
  experienceYears: 5,
  isAvailable: true,
  languages: ['en', 'ru'],
  bio: 'Coach biography',
  pricePerHourKZT: 12000,
} as Instructor;
const operational = { availableSeats: 4, totalSeats: 8, isEnrollmentEligible: true, isFull: false };

export function ContrastFixture() {
  const { language } = useLanguage();
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const slide = Number(new URLSearchParams(location.search).get('slide') ?? 0);
  return (
    <>
      <HeroCarousel
        data={{
          slides: [FALLBACK_SLIDES[slide]],
          configReady: true,
          language,
          theme,
          slideIntervalSeconds: 1000,
          slidesRandomOrder: false,
          isAuthenticated: false,
        }}
        actions={{ onScrollToSection: () => {} }}
      />
      <section data-testid="contrast-cards">
        <GroupCourseCard
          rawCourse={course}
          catalogStatus="ready"
          catalogOperational={operational}
          courseEnrollments={[]}
          userProfile={null}
          language={language}
          onViewDetails={() => {}}
          onRequireAuth={() => {}}
        />
        <InstructorCard instructor={instructor} onBook={() => {}} onViewReviews={() => {}} />
      </section>
      {[4, 2, 0].map((seats) => (
        <section key={seats} data-testid={`contrast-seats-${seats}`}>
          <CourseEnrollAction
            course={{ ...course, availableSeats: seats }}
            datePart="15.12.2026"
            timePart="10:00"
            seatsPercentage={(seats / 8) * 100}
            catalogStatus="ready"
            catalogOperational={{ ...operational, availableSeats: seats, isFull: seats === 0 }}
            userProfile={null}
            isEnrolled={false}
            onEnroll={() => {}}
          />
        </section>
      ))}
    </>
  );
}
