import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Users, Star, Heart } from 'lucide-react';
import { Course, Instructor, UserProfile } from '../../../types';
import {
  useLanguage,
  translateInstructorName,
  splitCourseDates,
} from '../../../app/providers/LanguageContext';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';
import { getCourseEnrichedData } from '../../../features/courses/components/course_details/courseEnrichedData';
import { CourseHeader } from '../../../features/courses/components/course_details/CourseHeader';
import { CourseProgram } from '../../../features/courses/components/course_details/CourseProgram';
import { CourseGallery } from '../../../features/courses/components/course_details/CourseGallery';
import { CourseFAQ } from '../../../features/courses/components/course_details/CourseFAQ';
import { CourseEnrollAction } from '../../../features/courses/components/course_details/CourseEnrollAction';

interface CourseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawCourse: Course | null;
  course: Course | null;
  instructors: Instructor[];
  userProfile: UserProfile | null;
  isEnrolled: boolean;
  onEnroll: (courseId: string) => void;
}

export const CourseDetailsModal: React.FC<CourseDetailsModalProps> = ({
  isOpen,
  onClose,
  rawCourse,
  course,
  instructors,
  userProfile,
  isEnrolled,
  onEnroll,
}) => {
  const { language, t } = useLanguage();

  if (!isOpen || !course || !rawCourse) return null;

  const { datePart, timePart } = splitCourseDates(course.dates, language);
  const seatsPercentage = Math.round((course.availableSeats / course.totalSeats) * 100);

  const defaultEnriched = getCourseEnrichedData(
    course.id,
    course.level || 'beginner',
    course.title,
    language
  );

  const benefits =
    (language === 'ru' ? rawCourse.benefitsRu : rawCourse.benefits) || defaultEnriched.benefits;
  const program =
    (language === 'ru' ? rawCourse.programRu : rawCourse.program) || defaultEnriched.program;
  const faq = (language === 'ru' ? rawCourse.faqRu : rawCourse.faq) || defaultEnriched.faq;
  const photos = rawCourse.galleryPhotos || defaultEnriched.photos;
  const videoUrl = rawCourse.videoUrl?.trim() || '';
  const reviews = defaultEnriched.reviews;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <BodyScrollLock />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="ui-modal-overlay fixed inset-0 z-40"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="ui-modal relative shadow-2xl w-full max-w-4xl lg:max-w-5xl overflow-hidden transition-colors duration-300 flex flex-col m-auto z-50 max-h-[80vh] rounded-2xl bg-[var(--card-bg)] text-[var(--ink)] border border-[var(--border)]"
        >
          <CourseHeader course={course} onClose={onClose} />

          <div className="overflow-y-auto flex-1 bg-[var(--bg)]">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 p-6 sm:p-8">
              <div className="space-y-10">
                <CourseProgram course={course} benefits={benefits} program={program} />

                <CourseGallery photos={photos} videoUrl={videoUrl} courseTitle={course.title} />

                {rawCourse.instructorIds && rawCourse.instructorIds.length > 0 && (
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                      <Users className="w-4 h-4 text-violet-500" />
                      <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                        {t('courseYourInstructors')}
                      </h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {rawCourse.instructorIds.map((insId) => {
                        const ins = instructors.find((i) => i.id === insId);
                        if (!ins) return null;
                        return (
                          <div
                            key={insId}
                            className="flex items-center gap-3.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] p-3 transition hover:border-[var(--ink)] duration-300"
                          >
                            <img
                              src={ins.avatarUrl}
                              referrerPolicy="no-referrer"
                              alt={ins.name}
                              className="w-14 h-14 object-cover border border-[var(--border)] grayscale shrink-0"
                            />
                            <div className="min-w-0 leading-tight">
                              <p className="text-xs font-extrabold text-[var(--ink)] truncate">
                                {translateInstructorName(ins.name, language)}
                              </p>
                              <p className="text-[10px] text-[var(--ink-dim)] mt-0.5 uppercase tracking-wide font-mono">
                                {ins.specialty === 'both'
                                  ? t('bothSpecialties')
                                  : ins.specialty === 'ski'
                                    ? t('courseSkiSpecialist')
                                    : t('courseSnowboardSpecialist')}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[9px] font-mono text-sky-500 bg-sky-500/10 dark:bg-sky-500/20 px-1.5 py-0.5 font-bold">
                                  {ins.experienceYears} {t('courseYearsExperienceShort')}
                                </span>
                                <span className="flex items-center gap-0.5 text-[9px] font-mono text-amber-500 font-bold">
                                  <Star className="w-2.5 h-2.5 fill-amber-500 text-transparent" />
                                  {ins.rating.toFixed(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
                    <Heart className="w-4 h-4 text-pink-500" />
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink)] font-bold">
                      {t('courseStudentReviews')}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {reviews.map((rev, idx) => (
                      <div
                        key={idx}
                        className="p-4 border border-[var(--border)]/70 bg-black/5 dark:bg-white/5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={rev.avatar}
                              referrerPolicy="no-referrer"
                              alt={rev.name}
                              className="w-7 h-7 object-cover grayscale border border-[var(--border)]"
                            />
                            <div>
                              <p className="text-xs font-bold text-[var(--ink)]">{rev.name}</p>
                              <p className="text-[9px] font-mono text-[var(--ink-dim)]">
                                {rev.date}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-0.5">
                            {[...Array(rev.rating)].map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-amber-500 text-transparent" />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-[var(--ink-dim)] italic leading-relaxed font-sans font-light">
                          {'"'}
                          {rev.comment}
                          {'"'}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <CourseFAQ faq={faq} />
              </div>

              <CourseEnrollAction
                course={course}
                datePart={datePart}
                timePart={timePart}
                seatsPercentage={seatsPercentage}
                userProfile={userProfile}
                isEnrolled={isEnrolled}
                onEnroll={onEnroll}
                onClose={onClose}
              />
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
