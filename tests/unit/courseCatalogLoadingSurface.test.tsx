import { GroupCoursesSection } from '../../src/features/courses/components/GroupCoursesSection';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseCatalogReadModel } from '@ski-academy/shared-domain';
import type { Course } from '../../src/types';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';
import { CourseEnrollAction } from '../../src/features/courses/components/course_details/CourseEnrollAction';
import { GroupCourseCard } from '../../src/features/courses/components/GroupCourseCard';
import {
  useCourseCatalogReadSync,
  reloadCourseCatalog,
} from '../../src/features/course-enrollments/useCourseEnrollmentReadSync';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import {
  lookupCourseCatalogOperational,
  mapCourseCatalogReadModelToOperationalState,
} from '../../src/features/course-enrollments/courseEnrollmentViewModel';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useCoursesStore } from '../../src/features/courses/coursesStore';

const mocks = vi.hoisted(() => ({ language: 'en' as 'en' | 'ru', query: vi.fn() }));
vi.mock('../../src/app/providers/LanguageContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/providers/LanguageContext')>()),
  useLanguage: () => ({
    language: mocks.language,
    t: (key: TranslationKey) => translations[mocks.language][key],
  }),
  translateCourse: (course: Course) => course,
  formatCourseCardDuration: (duration: string) => duration,
}));
vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: String }),
}));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryCourseCatalogReadModels: mocks.query,
  queryCourseEnrollmentReadModels: vi.fn(),
}));
vi.mock('../../src/infrastructure/firebase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/infrastructure/firebase')>()),
  onSnapshot: vi.fn(() => vi.fn()),
}));

const catalogReadModel: CourseCatalogReadModel = {
  courseId: 'course_1784217360616',
  revision: 2,
  title: 'BASE — First Turns',
  price: 250_000,
  capacity: {
    totalSeats: 8,
    availableSeats: 8,
    isCapacityFrozen: false,
    isEnrollmentEligible: true,
    isFull: false,
  },
  scheduleSummary: {
    startAt: { seconds: 1_795_363_200, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_795_795_200, nanoseconds: 0 },
    courseDayCount: 5,
  },
  courseSchedule: {
    courseId: 'course_1784217360616',
    courseScheduleRevision: 1,
    courseDayCount: 5,
    startAt: { seconds: 1_795_363_200, nanoseconds: 0 },
    finalCourseDayEndsAt: { seconds: 1_795_795_200, nanoseconds: 0 },
    courseDays: [
      {
        courseDayId: 'course_day_1784217360616_01',
        dayOrder: 1,
        interval: {
          startsAt: { seconds: 1_795_363_200, nanoseconds: 0 },
          endsAt: { seconds: 1_795_377_600, nanoseconds: 0 },
        },
        timeZone: 'Asia/Almaty',
        revision: 1,
      },
    ],
  },
  updatedAt: { seconds: 1_795_363_200, nanoseconds: 0 },
};

const course = {
  id: catalogReadModel.courseId,
  title: 'BASE',
  dates: '',
  duration: '',
  availableSeats: 0,
  totalSeats: 8,
} as Course;
const catalogPage = { scopeKey: 'live', next: null, revisions: [null, null] };
const operational = mapCourseCatalogReadModelToOperationalState(catalogReadModel);

beforeEach(() => {
  useCourseEnrollmentStore.getState().reset();
  useCoursesStore.setState({ publicCoursesStatus: 'loading' });
  useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
  mocks.query.mockReset();
});

for (const language of ['en', 'ru'] as const) {
  for (const surface of ['card', 'details'] as const) {
    it(`${surface} separates loading, closed, full and error in ${language}`, () => {
      mocks.language = language;
      const t = translations[language];
      const onEnroll = vi.fn();
      const onRetryCatalog = vi.fn();
      const view = (
        catalogStatus: 'loading' | 'ready' | 'error',
        catalogOperational = operational
      ) =>
        surface === 'card' ? (
          <GroupCourseCard
            rawCourse={course}
            courseEnrollments={[]}
            userProfile={null}
            language={language}
            onViewDetails={vi.fn()}
            onRequireAuth={onEnroll}
            catalogStatus={catalogStatus}
            catalogOperational={catalogOperational}
            onRetryCatalog={onRetryCatalog}
          />
        ) : (
          <CourseEnrollAction
            course={course}
            datePart=""
            timePart=""
            seatsPercentage={100}
            userProfile={null}
            isEnrolled={false}
            onEnroll={onEnroll}
            catalogStatus={catalogStatus}
            catalogOperational={catalogOperational}
            onRetryCatalog={onRetryCatalog}
          />
        );
      const { rerender } = render(view('loading'));
      expect(screen.getByRole('button', { name: t.loading })).toBeDisabled();
      expect(screen.queryByText(t.courseEnrollmentUnavailable)).not.toBeInTheDocument();
      expect(screen.queryByText(t.courseSoldOut)).not.toBeInTheDocument();
      rerender(view('ready'));
      fireEvent.click(
        screen.getByRole('button', { name: surface === 'card' ? t.enroll : t.courseConfirmBooking })
      );
      expect(onEnroll).toHaveBeenCalledTimes(1);
      rerender(view('ready', { ...operational, isEnrollmentEligible: false }));
      expect(screen.getByRole('button', { name: t.courseEnrollmentUnavailable })).toBeDisabled();
      rerender(
        view('ready', {
          ...operational,
          availableSeats: 0,
          isFull: true,
          isEnrollmentEligible: false,
        })
      );
      expect(screen.getByRole('button', { name: t.courseSoldOut })).toBeDisabled();
      rerender(view('error'));
      expect(screen.getByRole('alert')).toHaveTextContent(t.courseCatalogLoadError);
      expect(screen.queryByText(t.courseEnrollmentUnavailable)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: t.retry }));
      expect(onRetryCatalog).toHaveBeenCalledOnce();
      rerender(view('loading'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: t.retry })).not.toBeInTheDocument();
    });
  }
}

function CatalogDetails({ selectedCourse }: { selectedCourse: Course }) {
  useCourseCatalogReadSync(true);
  const catalogStatus = useCourseEnrollmentStore((state) => state.catalogStatus);
  const catalogOperational = useCourseEnrollmentStore((state) =>
    lookupCourseCatalogOperational(state.catalogByCourseId, selectedCourse.id)
  );
  return (
    <CourseEnrollAction
      course={selectedCourse}
      datePart=""
      timePart=""
      seatsPercentage={100}
      userProfile={null}
      isEnrolled={false}
      onEnroll={vi.fn()}
      catalogStatus={catalogStatus}
      catalogOperational={catalogOperational}
      onRetryCatalog={reloadCourseCatalog}
    />
  );
}

it('retries the source once, clears errors and keeps late course A data out of B', async () => {
  mocks.language = 'en';
  mocks.query.mockRejectedValueOnce(new Error('Firestore unavailable'));
  const { rerender } = render(<CatalogDetails selectedCourse={course} />);
  await screen.findByRole('alert');
  let finish!: (result: unknown) => void;
  mocks.query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: translations.en.retry }));
  void reloadCourseCatalog();
  expect(mocks.query).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: translations.en.loading })).toBeDisabled();
  const courseB = { ...course, id: 'course_b', title: 'Course B' };
  rerender(<CatalogDetails selectedCourse={courseB} />);
  await act(async () =>
    finish({
      page: catalogPage,
      items: [
        catalogReadModel,
        {
          ...catalogReadModel,
          courseId: courseB.id,
          capacity: { ...catalogReadModel.capacity, isEnrollmentEligible: false },
        },
      ],
    })
  );
  expect(
    screen.getByRole('button', { name: translations.en.courseEnrollmentUnavailable })
  ).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText(course.title)).not.toBeInTheDocument();
  rerender(<CatalogDetails selectedCourse={course} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: translations.en.courseConfirmBooking })).toBeEnabled()
  );
});

it('offers retry for a failed empty course list', async () => {
  mocks.language = 'en';
  useCourseEnrollmentStore.setState({ catalogStatus: 'error' });
  mocks.query.mockResolvedValue({ items: [], page: catalogPage });
  render(
    <GroupCoursesSection
      data={{
        courses: [],
        courseEnrollments: [],
        catalogByCourseId: new Map(),
        userProfile: null,
        language: 'en',
      }}
      actions={{ onViewDetails: vi.fn(), onRequireAuth: vi.fn() }}
    />
  );
  expect(screen.getByRole('alert')).toHaveTextContent(translations.en.courseCatalogLoadError);
  expect(screen.queryByText(translations.en.noIntensiveCoursesAvailable)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: translations.en.retry }));
  await waitFor(() => expect(useCourseEnrollmentStore.getState().catalogStatus).toBe('ready'));
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('status')).toBeVisible();
  expect(screen.queryByText(translations.en.noIntensiveCoursesAvailable)).not.toBeInTheDocument();
  act(() => useCoursesStore.setState({ publicCoursesStatus: 'ready' }));
  expect(screen.getByText(translations.en.noIntensiveCoursesAvailable)).toBeVisible();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
