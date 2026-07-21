import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Calendar, Clock, DollarSign, Users, Award } from 'lucide-react';
import { Course, Instructor, UserProfile } from '../types';
import { useLanguage, translateInstructorName, splitCourseDates } from '../lib/LanguageContext';

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
  const { language } = useLanguage();

  if (!isOpen || !course || !rawCourse) return null;

  const { datePart, timePart } = splitCourseDates(course.dates);
  const seatsPercentage = Math.round((course.availableSeats / course.totalSeats) * 100);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Content Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-lg overflow-hidden transition-colors duration-300 rounded-none flex flex-col max-h-[90vh] z-10"
        >
          {/* Cover image header */}
          <div className="relative h-48 sm:h-56 shrink-0 border-b border-[var(--border)]">
            <img
              src={course.bgImageUrl || 'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800'}
              referrerPolicy="no-referrer"
              alt={course.title}
              className="w-full h-full object-cover grayscale brightness-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
            
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 border border-white/20 bg-black/40 hover:bg-black/70 text-white/80 hover:text-white transition cursor-pointer rounded-none z-20"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Float badge */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-sky-400 bg-sky-950/60 border border-sky-900/50 px-2.5 py-1">
                {course.duration}
              </span>
              {course.badge && (
                <>
                  {/^(https?:\/\/|\/|data:image\/)/.test(course.badge) || /\.(png|jpg|jpeg|svg|gif|webp)/i.test(course.badge) ? (
                    <img 
                      src={course.badge} 
                      referrerPolicy="no-referrer" 
                      alt="badge" 
                      className="h-6 w-auto object-contain max-w-[85px]" 
                    />
                  ) : (
                    <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white border border-white/50 bg-transparent backdrop-blur-[2px] px-2.5 py-1 shadow-md">
                      {course.badge}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Title in cover */}
            <div className="absolute bottom-0 inset-x-0 p-5 flex flex-col justify-end">
              <h3 className="font-serif text-xl sm:text-2xl font-light text-white leading-tight">
                {course.title}
              </h3>
              {course.levelLabel && (
                <div className={`text-[10px] font-mono uppercase tracking-wider font-bold mt-1 flex items-center gap-1.5 drop-shadow ${
                  course.level === 'beginner' ? 'text-emerald-400' :
                  course.level === 'intermediate' ? 'text-amber-400' :
                  course.level === 'advanced' ? 'text-rose-400' :
                  course.level === 'expert' ? 'text-stone-300' : 'text-white/90'
                }`}>
                  {course.levelLabel}
                </div>
              )}
            </div>
          </div>

          {/* Modal body */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 min-h-[200px]">
            {/* Description */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)]">
                {language === 'en' ? 'Course Description' : 'Описание курса'}
              </h4>
              <p className="text-xs sm:text-sm text-[var(--ink)] leading-relaxed font-sans font-light">
                {course.detailedDescription || course.description}
              </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 gap-4 border-t border-b border-[var(--border)]/50 py-4 font-mono text-[11px]">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <span className="text-[9px] uppercase text-[var(--ink-dim)] block leading-none mb-1">
                    {language === 'en' ? 'Dates' : 'Даты'}
                  </span>
                  <span className="text-[var(--ink)] font-bold">{datePart}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <span className="text-[9px] uppercase text-[var(--ink-dim)] block leading-none mb-1">
                    {language === 'en' ? 'Time' : 'Время'}
                  </span>
                  <span className="text-[var(--ink)] font-bold">{timePart}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-[9px] uppercase text-[var(--ink-dim)] block leading-none mb-1">
                    {language === 'en' ? 'Price' : 'Стоимость'}
                  </span>
                  <span className="text-[var(--ink)] font-bold text-sm">${course.price}</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Users className={`w-4 h-4 shrink-0 ${course.availableSeats === 0 ? 'text-rose-500' : course.availableSeats <= 3 ? 'text-amber-500' : 'text-emerald-500'}`} />
                <div className="w-full">
                  <span className="text-[9px] uppercase text-[var(--ink-dim)] block leading-none mb-1">
                    {language === 'en' ? 'Seats Available' : 'Доступные места'}
                  </span>
                  <span className={`font-mono text-xs font-bold ${course.availableSeats === 0 ? 'text-rose-500' : course.availableSeats <= 3 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {course.availableSeats === 0 ? (
                      language === 'en' ? 'Sold Out' : 'Мест нет'
                    ) : course.availableSeats <= 3 ? (
                      language === 'en' ? `Only ${course.availableSeats} left!` : `Всего ${course.availableSeats} осталось!`
                    ) : (
                      language === 'en' ? `${course.availableSeats} of ${course.totalSeats} free` : `${course.availableSeats} из ${course.totalSeats} свободно`
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Availability progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] font-mono uppercase text-[var(--ink-dim)]">
                <span>{language === 'en' ? 'Availability Ratio' : 'Степень заполнения'}</span>
                <span>{course.totalSeats - course.availableSeats} / {course.totalSeats} {language === 'en' ? 'booked' : 'занято'}</span>
              </div>
              <div className="w-full h-1.5 bg-black/10 dark:bg-white/5 border border-[var(--border)] overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, 100 - seatsPercentage))}%` }}
                />
              </div>
            </div>

            {/* Course Leads (Instructors) */}
            {rawCourse.instructorIds && rawCourse.instructorIds.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink-dim)] flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" />
                  {language === 'en' ? 'Your Instructors' : 'Ваши инструкторы'}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {rawCourse.instructorIds.map((insId) => {
                    const ins = instructors.find((i) => i.id === insId);
                    if (!ins) return null;
                    return (
                      <div
                        key={insId}
                        className="flex items-center gap-3 bg-black/5 dark:bg-white/5 border border-[var(--border)] p-2.5 transition-colors duration-300"
                      >
                        <img
                          src={ins.avatarUrl}
                          referrerPolicy="no-referrer"
                          alt={ins.name}
                          className="w-10 h-10 object-cover border border-[var(--border)] grayscale shrink-0"
                        />
                        <div className="min-w-0 leading-tight">
                          <p className="text-xs font-bold text-[var(--ink)] truncate">
                            {translateInstructorName(ins.name, language)}
                          </p>
                          <p className="text-[10px] text-[var(--ink-dim)] mt-0.5 truncate">
                            {ins.specialty === 'both'
                              ? language === 'en'
                                ? 'Ski & Snowboard'
                                : 'Лыжи и Сноуборд'
                              : ins.specialty === 'ski'
                              ? language === 'en'
                                ? 'Ski'
                                : 'Лыжи'
                              : language === 'en'
                              ? 'Snowboard'
                              : 'Сноуборд'}
                          </p>
                          <p className="text-[9px] font-mono text-sky-400 mt-1">
                            {language === 'en'
                              ? `${ins.experienceYears}Y Experience`
                              : `${ins.experienceYears} лет опыта`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="p-5 border-t border-[var(--border)] bg-black/5 shrink-0 flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border)] bg-transparent hover:bg-black/5 text-[var(--ink)] font-mono text-[10px] uppercase tracking-wider transition rounded-none cursor-pointer flex-1"
            >
              {language === 'en' ? 'Close' : 'Закрыть'}
            </button>

            <button
              onClick={() => {
                onEnroll(course.id);
                onClose();
              }}
              disabled={(course.availableSeats === 0 && !isEnrolled) || userProfile?.isClientActive === false}
              className={`px-6 py-2 border font-mono text-[10px] uppercase tracking-wider transition rounded-none flex-[2] ${
                isEnrolled
                  ? 'bg-black/30 dark:bg-black/60 border-[var(--border)]/60 text-[var(--ink-dim)] cursor-default'
                  : userProfile?.isClientActive === false
                  ? 'border-rose-900/40 text-rose-500 cursor-not-allowed bg-rose-950/10 font-bold'
                  : course.availableSeats === 0
                  ? 'border-[var(--border)] text-[var(--ink-dim)] cursor-not-allowed bg-black/5'
                  : 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] hover:bg-transparent hover:text-[var(--ink)] cursor-pointer'
              }`}
            >
              {isEnrolled
                ? (
                  <span className="flex items-center justify-center gap-1 normal-case font-sans">
                    <span className="text-emerald-500 font-bold text-xs">✔</span>{' '}
                    {language === 'en' ? 'Enrolled' : 'Вы записаны'}
                  </span>
                )
                : userProfile?.isClientActive === false
                ? language === 'en'
                  ? 'Access Suspended'
                  : 'Доступ приостановлен'
                : course.availableSeats === 0
                ? language === 'en'
                  ? 'Sold Out'
                  : 'Мест нет'
                : language === 'en'
                ? `Enroll Now`
                : `Записаться`}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
