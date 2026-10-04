import React from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { useLanguage, type Language } from '../../../app/providers/LanguageContext';
import { Course, UserProfile } from '../../../types';
import { GroupCourseCard, sortVisibleCourses } from './GroupCourseCard';
import type {
  CourseCatalogOperationalState,
  CourseEnrollmentCabinetItem,
} from '../../course-enrollments';
import { lookupCourseCatalogOperational } from '../../course-enrollments';

interface GroupCoursesSectionProps {
  data: {
    courses: Course[];
    courseEnrollments: readonly CourseEnrollmentCabinetItem[];
    catalogByCourseId: ReadonlyMap<string, CourseCatalogOperationalState>;
    userProfile: UserProfile | null;
    language: Language;
    selectedParticipantId?: string;
  };
  actions: {
    onViewDetails: (course: Course, enrollmentId?: string) => void;
    onRequireAuth: (course: Course) => void;
  };
}

export const GroupCoursesSection: React.FC<GroupCoursesSectionProps> = ({
  data: {
    courses,
    courseEnrollments,
    catalogByCourseId,
    userProfile,
    language,
    selectedParticipantId,
  },
  actions: { onViewDetails, onRequireAuth },
}) => {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const visibleCourses = sortVisibleCourses(courses);

  return (
    <div
      id="courses-grid"
      className="space-y-6 w-full max-w-[1200px] mx-auto"
    >
      <div>
        <h3 className="ui-section-title">
          {t('intensiveGroupCourses')}
        </h3>

        <p className="ui-section-eyebrow mt-2">
          {t('intensiveGroupCoursesSub')}
        </p>
      </div>

      <div
        className="grid gap-8 justify-center"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, 370px)',
        }}
      >
        {visibleCourses.map((rawCourse, index) => (
          <m.div
            key={rawCourse.id}
            initial={
              shouldReduceMotion
                ? false
                : { opacity: 0, y: 32, scale: 0.985 }
            }
            whileInView={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            viewport={{
              once: true,
              amount: 0.1,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 1.2,
              delay: shouldReduceMotion
                ? 0
                : Math.min(index * 0.12, 0.36),
              ease: [0.22, 1, 0.36, 1],
            }}
            className="w-[370px] h-full"
          >
            <GroupCourseCard
              rawCourse={rawCourse}
              courseEnrollments={courseEnrollments}
              selectedParticipantId={selectedParticipantId}
              catalogOperational={lookupCourseCatalogOperational(
                catalogByCourseId,
                rawCourse.id
              )}
              userProfile={userProfile}
              language={language}
              onViewDetails={onViewDetails}
              onRequireAuth={onRequireAuth}
              className="h-full w-full"
            />
          </m.div>
        ))}
      </div>

      {visibleCourses.length === 0 && (
        <div className="ui-empty-state">
          {t('noIntensiveCoursesAvailable')}
        </div>
      )}
    </div>
  );
};