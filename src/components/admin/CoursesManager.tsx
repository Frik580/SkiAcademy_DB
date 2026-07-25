import React from 'react';
import { Booking, Course, Instructor, UserProfile } from '../../types';
import { useLanguage, translateCourse } from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { useCourseForm } from './courses_manager/useCourseForm';
import { CoursesManagerToolbar } from './courses_manager/CoursesManagerToolbar';
import { CoursesTable } from './courses_manager/CoursesTable';
import { CourseForm } from './courses_manager/CourseForm';

interface CoursesManagerProps {
  courses: Course[];
  bookings: Booking[];
  usersList: UserProfile[];
  instructors: Instructor[];
  onAddCourse?: (course: Course) => Promise<void>;
  onUpdateCourse?: (course: Course) => Promise<void>;
  onDeleteCourse?: (courseId: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export const CoursesManager: React.FC<CoursesManagerProps> = ({
  courses,
  bookings,
  usersList,
  instructors,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  onRequestConfirm,
}) => {
  const { t, language } = useLanguage();
  const { addNotification } = useNotifications();
  const form = useCourseForm({ courses, onAddCourse, onUpdateCourse });

  const handleMoveCourse = async (course: Course, direction: 'up' | 'down') => {
    const sorted = [...courses].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : 999;
      const orderB = b.order !== undefined ? b.order : 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.title.localeCompare(b.title);
    });

    const idx = sorted.findIndex((c) => c.id === course.id);
    if (idx === -1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const newSorted = [...sorted];
    const temp = newSorted[idx];
    newSorted[idx] = newSorted[targetIdx];
    newSorted[targetIdx] = temp;

    try {
      if (onUpdateCourse) {
        for (let i = 0; i < newSorted.length; i++) {
          const c = newSorted[i];
          if (c.order !== i) {
            await onUpdateCourse({ ...c, order: i });
          }
        }
        addNotification('success', t('orderChanged'), t('courseOrderUpdated'));
      }
    } catch (err) {
      addNotification('error', t('errorTitle'), t('courseOrderFailed'));
    }
  };

  const handleDeleteCourseClick = (course: Course) => {
    const confirmMsg = `${t('deleteCourseConfirmPrefix')} "${course.title}"?`;

    onRequestConfirm(confirmMsg, async () => {
      try {
        if (onDeleteCourse) {
          await onDeleteCourse(course.id);
          addNotification('success', t('deletedTitle'), t('courseDeleted'));
        }
      } catch (err) {
        addNotification('error', t('errorTitle'), t('deleteCourseFailed'));
      }
    });
  };

  const handleToggleVisibility = async (course: Course) => {
    if (onUpdateCourse) {
      await onUpdateCourse({ ...course, isHidden: !course.isHidden });
      const translatedCourse = translateCourse(course, language);
      addNotification(
        'success',
        t('courseVisibilityUpdated'),
        `${t('courseNowPrefix')} "${translatedCourse.title}" ${t('courseNowSuffix')} ${!course.isHidden ? t('hiddenWord') : t('visibleWord')}.`
      );
    }
  };

  return (
    <div className="space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden">
      <CoursesManagerToolbar
        t={t}
        showCourseForm={form.showCourseForm}
        onToggle={form.toggleCourseForm}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={`${form.showCourseForm ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4`}>
          <CoursesTable
            courses={courses}
            bookings={bookings}
            usersList={usersList}
            instructors={instructors}
            language={language}
            t={t}
            onToggleVisibility={handleToggleVisibility}
            onEdit={form.startEditCourse}
            onDelete={handleDeleteCourseClick}
            onMove={handleMoveCourse}
          />
        </div>

        <CourseForm form={form} instructors={instructors} />
      </div>
    </div>
  );
};
