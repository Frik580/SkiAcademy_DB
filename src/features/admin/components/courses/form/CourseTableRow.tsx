import React from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff, Edit2, Trash2, Copy } from 'lucide-react';
import { Booking, Course, Instructor, UserProfile } from '../../../../../types';
import {
  translateCourse,
  translateInstructorName,
  type TranslationKey,
  type Language,
} from '../../../../../app/providers/LanguageContext';
import { getCourseLevelBadgeClass } from '../../../../../domain/course/courseLevelStyles';

interface CourseTableRowProps {
  course: Course;
  idx: number;
  sortedLength: number;
  instructors: Instructor[];
  usersList: UserProfile[];
  bookings: Booking[];
  language: Language;
  t: (key: TranslationKey) => string;
  onToggleVisibility: (course: Course) => void;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
  onClone: (course: Course) => void;
  onMove: (course: Course, direction: 'up' | 'down') => void;
}

export const CourseTableRow: React.FC<CourseTableRowProps> = ({
  course,
  idx,
  sortedLength,
  instructors,
  usersList,
  bookings,
  language,
  t,
  onToggleVisibility,
  onEdit,
  onDelete,
  onClone,
  onMove,
}) => {
  const translatedCourse = translateCourse(course, language);

  const levelClass = getCourseLevelBadgeClass(course.level);

  const courseBookings = bookings.filter(
    (b) => b.instructorId === `course_${course.id}` && b.status !== 'cancelled' && !b.isDeleted
  );
  const enrolledNames = courseBookings
    .map((b) => {
      const u = usersList.find((usr) => usr.uid === b.userId);
      return u?.displayName || u?.email || b.userId;
    })
    .filter(Boolean);

  return (
    <tr className="hover:bg-black/5 dark:hover:bg-white/5 transition">
      <td className="px-4 py-2">
        <img
          src={course.bgImageUrl}
          referrerPolicy="no-referrer"
          alt={translatedCourse.title}
          className="w-10 h-10 object-cover border border-[var(--border)] transition-all duration-300 group-hover:scale-105"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-[var(--ink)] block text-xs">
            {translatedCourse.title}
          </span>
          {translatedCourse.levelLabel && (
            <span
              className={`border text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-wide rounded-none shrink-0 ${levelClass}`}
            >
              {translatedCourse.levelLabel}
            </span>
          )}
          {course.isHidden && (
            <span className="bg-rose-950/20 text-rose-400 border border-rose-900/50 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-wide rounded-none shrink-0">
              {t('hiddenLabel')}
            </span>
          )}
        </div>
        {(translatedCourse.shortDescription || translatedCourse.description) && (
          <span className="text-[10px] text-[var(--ink-dim)] line-clamp-1 mt-0.5">
            {translatedCourse.shortDescription || translatedCourse.description}
          </span>
        )}

        {course.instructorIds && course.instructorIds.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[9px] text-[var(--ink-dim)] uppercase tracking-wider">
              {t('instructorsColon')}
            </span>
            {course.instructorIds.map((insId) => {
              const ins = instructors.find((i) => i.id === insId);
              if (!ins) return null;
              return (
                <span
                  key={insId}
                  className="bg-black/10 dark:bg-white/10 border border-[var(--border)] text-[9px] px-1.5 py-0.5 text-[var(--ink)] font-bold"
                >
                  {translateInstructorName(ins.name, language)}
                </span>
              );
            })}
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-[var(--ink)]">{translatedCourse.duration}</td>
      <td className="px-4 py-2 text-[var(--ink)] font-bold">{translatedCourse.dates}</td>
      <td className="px-4 py-2">
        <span
          className={`font-bold ${course.availableSeats === 0 ? 'text-rose-500' : 'text-emerald-500'}`}
        >
          {course.availableSeats} / {course.totalSeats}
        </span>
        {enrolledNames.length > 0 && (
          <div
            className="text-[9px] text-[var(--ink-dim)] mt-1 font-mono leading-tight max-w-[120px] truncate"
            title={enrolledNames.join(', ')}
          >
            <span className="font-bold text-[8px] uppercase tracking-wider block">
              {t('enrolledColon')}
            </span>
            {enrolledNames.join(', ')}
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-[var(--ink)] font-bold">
        <div>${course.price}</div>
        {course.priceKZT ? (
          <div className="text-[10px] text-[var(--ink-dim)] font-normal font-mono">
            {course.priceKZT.toLocaleString()} ₸
          </div>
        ) : null}
      </td>
      <td className="px-4 py-2 text-center">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onMove(course, 'up')}
            disabled={idx === 0}
            className={`p-1 border border-transparent rounded-none transition cursor-pointer ${
              idx === 0
                ? 'text-[var(--border)] cursor-not-allowed opacity-30'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--border)] bg-black/5 dark:bg-white/5'
            }`}
            title={t('moveUp')}
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMove(course, 'down')}
            disabled={idx === sortedLength - 1}
            className={`p-1 border border-transparent rounded-none transition cursor-pointer ${
              idx === sortedLength - 1
                ? 'text-[var(--border)] cursor-not-allowed opacity-30'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--border)] bg-black/5 dark:bg-white/5'
            }`}
            title={t('moveDown')}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onToggleVisibility(course)}
            className={`p-1.5 border border-transparent rounded-none transition cursor-pointer ${
              course.isHidden
                ? 'text-rose-400 hover:text-rose-300'
                : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
            }`}
            title={course.isHidden ? t('showCourse') : t('hideCourse')}
          >
            {course.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onEdit(course)}
            className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
            title={t('editCourse')}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onClone(course)}
            className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
            title={t('cloneCourse')}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(course)}
            className="p-1.5 text-rose-500 hover:text-rose-600 hover:border-rose-500/30 border border-transparent rounded-none transition cursor-pointer"
            title={t('deleteCourse')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};
