import React from 'react';
import { X } from 'lucide-react';
import { Course } from '../../types';
import { getCourseLevelModalClass } from '../../lib/courseLevelStyles';
import { useLanguage } from '../../lib/LanguageContext';

interface CourseHeaderProps {
  course: Course;
  onClose: () => void;
}

export const CourseHeader: React.FC<CourseHeaderProps> = ({ course, onClose }) => {
  const { t } = useLanguage();

  return (
    <div className="relative h-40 sm:h-50 shrink-0 border-b border-[var(--border)] bg-black">
      <img
        src={
          course.bgImageUrl ||
          'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=1200'
        }
        referrerPolicy="no-referrer"
        alt={course.title}
        className="w-full h-full object-cover object-center sm:object-[center_-200px] grayscale opacity-75 brightness-[0.7] scale-102 transition duration-700 hover:scale-100"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/20" />

      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full border border-white/20 bg-black/50 hover:bg-black/90 text-white/80 hover:text-white transition cursor-pointer z-30"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="absolute top-4 left-4 flex items-center gap-2 z-20">
        <span className="font-mono text-[9px] uppercase tracking-widest text-sky-400 bg-sky-950/80 border border-sky-800/60 px-3 py-1 font-bold">
          {course.duration}
        </span>
        {course.badge && (
          <>
            {/^(https?:\/\/|\/|data:image\/)/.test(course.badge) ||
            /\.(png|jpg|jpeg|svg|gif|webp)/i.test(course.badge) ? (
              <img
                src={course.badge}
                referrerPolicy="no-referrer"
                alt={t('courseBadgeAlt')}
                className="h-7 w-auto object-contain max-w-[95px] drop-shadow-md"
              />
            ) : (
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-white border border-white/40 bg-black/40 backdrop-blur-[2px] px-3 py-1 shadow-md">
                {course.badge}
              </span>
            )}
          </>
        )}
      </div>

      <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 flex flex-col justify-end">
        {course.levelLabel && (
          <div
            className={`text-[10px] font-mono uppercase tracking-widest font-extrabold mb-1.5 flex items-center gap-1.5 drop-shadow ${getCourseLevelModalClass(course.level)}`}
          >
            {course.levelLabel}
          </div>
        )}
        <h1 className="font-serif text-2xl sm:text-4xl lg:text-5xl font-extralight text-white leading-tight tracking-tight max-w-3xl drop-shadow-sm">
          {course.title}
        </h1>
      </div>
    </div>
  );
};
