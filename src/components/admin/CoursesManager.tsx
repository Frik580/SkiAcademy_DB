import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Check,
  X,
  Loader2,
  BookOpenCheck,
  Edit2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Camera,
} from 'lucide-react';
import { Booking, Course, Instructor, UserProfile } from '../../types';
import {
  useLanguage,
  translateInstructorName,
  translateCourse,
  parseCourseDates,
  formatCourseDates,
} from '../../lib/LanguageContext';
import { useNotifications } from '../PushNotificationHub';
import { formatDateLocalYMD, getSpecialtyLabel } from './scheduleUtils';

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
  function optimizeCourseImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('File is not an image'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 600;

          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx!.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // Slightly higher quality for backgrounds
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Failed to load image source'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }



  function getDaysInMonth(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 1 is Monday...
    // Adjust Sunday to be 6 (so Monday is 0, Sunday is 6)
    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Previous month's trailing days
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    const prevDays = [];
    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      prevDays.push({
        day: prevMonthTotalDays - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthTotalDays - i)
      });
    }
    
    // Current month's days
    const currentDays = [];
    for (let i = 1; i <= totalDays; i++) {
      currentDays.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      });
    }
    
    // Next month's leading days to complete the grid (usually 42 cells total for 6 rows)
    const nextDaysCount = 42 - (prevDays.length + currentDays.length);
    const nextDays = [];
    for (let i = 1; i <= nextDaysCount; i++) {
      nextDays.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      });
    }
    
    return [...prevDays, ...currentDays, ...nextDays];
  }

    // Course State and Form Fields
    const [showCourseForm, setShowCourseForm] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [courseTitle, setCourseTitle] = useState('');
    const [courseDuration, setCourseDuration] = useState('');
    const [courseDescription, setCourseDescription] = useState('');
    const [courseShortDescription, setCourseShortDescription] = useState('');
    const [courseShortDescriptionRu, setCourseShortDescriptionRu] = useState('');
    const [courseDetailedDescription, setCourseDetailedDescription] = useState('');
    const [courseDetailedDescriptionRu, setCourseDetailedDescriptionRu] = useState('');
    const [courseBadge, setCourseBadge] = useState('');
    const [courseBadgeRu, setCourseBadgeRu] = useState('');
    const [courseLevel, setCourseLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'expert' | ''>('');
    const [courseDates, setCourseDates] = useState('');
    const [courseTotalSeats, setCourseTotalSeats] = useState(10);
    const [coursePrice, setCoursePrice] = useState(199);
    const [courseBgImageUrl, setCourseBgImageUrl] = useState('');
    const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);
    const [isUploadingCourseImage, setIsUploadingCourseImage] = useState(false);
    const [isCourseDragOver, setIsCourseDragOver] = useState(false);
    const [courseIsHidden, setCourseIsHidden] = useState(false);
    const [selectedCourseInstructors, setSelectedCourseInstructors] = useState<string[]>([]);

    // Rich Course Page Details States
    const [showRichCourseDetails, setShowRichCourseDetails] = useState(false);
    const [courseVideoUrl, setCourseVideoUrl] = useState('');
    const [courseBenefitsEn, setCourseBenefitsEn] = useState('');
    const [courseBenefitsRu, setCourseBenefitsRu] = useState('');
    
    // Program Days States
    const [courseProgramDays, setCourseProgramDays] = useState<{
      titleEn: string;
      descEn: string;
      titleRu: string;
      descRu: string;
    }[]>([
      { titleEn: '', descEn: '', titleRu: '', descRu: '' }
    ]);
    
    // FAQ 1-3 States
    const [courseFaq1QEn, setCourseFaq1QEn] = useState('');
    const [courseFaq1AEn, setCourseFaq1AEn] = useState('');
    const [courseFaq1QRu, setCourseFaq1QRu] = useState('');
    const [courseFaq1ARu, setCourseFaq1ARu] = useState('');
    
    const [courseFaq2QEn, setCourseFaq2QEn] = useState('');
    const [courseFaq2AEn, setCourseFaq2AEn] = useState('');
    const [courseFaq2QRu, setCourseFaq2QRu] = useState('');
    const [courseFaq2ARu, setCourseFaq2ARu] = useState('');
    
    const [courseFaq3QEn, setCourseFaq3QEn] = useState('');
    const [courseFaq3AEn, setCourseFaq3AEn] = useState('');
    const [courseFaq3QRu, setCourseFaq3QRu] = useState('');
    const [courseFaq3ARu, setCourseFaq3ARu] = useState('');
    
    const [courseGalleryPhotos, setCourseGalleryPhotos] = useState('');

    // Calendar Course Date/Time States
    const [courseStartDate, setCourseStartDate] = useState<string>(() => formatDateLocalYMD(new Date()));
    const [courseEndDate, setCourseEndDate] = useState<string>(() => {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      return formatDateLocalYMD(d);
    });
    const [courseStartTime, setCourseStartTime] = useState<string>('09:00');
    const [courseEndTime, setCourseEndTime] = useState<string>('13:00');
    const [calendarViewMonth, setCalendarViewMonth] = useState<Date>(() => new Date());
    const [showCalendarPopover, setShowCalendarPopover] = useState<boolean>(false);

    // Automatically recalculate course dates and duration
    useEffect(() => {
      if (courseStartDate && courseEndDate) {
        const start = new Date(courseStartDate);
        const end = new Date(courseEndDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const formatted = formatCourseDates(start, end, courseStartTime, courseEndTime, language);
          setCourseDates(formatted);

          // Auto-calculate Duration
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          
          let hoursPerDay = 4; // default
          if (courseStartTime && courseEndTime) {
            const [startH, startM] = courseStartTime.split(':').map(Number);
            const [endH, endM] = courseEndTime.split(':').map(Number);
            hoursPerDay = (endH + endM / 60) - (startH + startM / 60);
            if (hoursPerDay <= 0) hoursPerDay = 4;
          }
          
          const totalHours = Math.round(diffDays * hoursPerDay);
          
          let durationText = "";
          if (language === 'en') {
            const daysStr = diffDays === 1 ? "1 Day" : `${diffDays} Days`;
            durationText = `${daysStr} (${totalHours} Hours)`;
          } else {
            const daysStr = diffDays === 1 ? "1 день" : (diffDays >= 2 && diffDays <= 4 ? `${diffDays} дня` : `${diffDays} дней`);
            durationText = `${daysStr} (${totalHours} ч.)`;
          }
          setCourseDuration(durationText);
        }
      }
    }, [courseStartDate, courseEndDate, courseStartTime, courseEndTime, language]);

    const calendarDays = useMemo(() => {
      return getDaysInMonth(calendarViewMonth);
    }, [calendarViewMonth]);

    const handlePrevMonth = () => {
      setCalendarViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
      setCalendarViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const handleCalendarDayClick = (dayDate: Date) => {
      const dateStr = formatDateLocalYMD(dayDate);
      
      const startObj = courseStartDate ? new Date(courseStartDate) : null;

      // If no start date, or both are set and they are different (starting a new selection),
      // or if the clicked date is before start date, treat it as a new start date.
      if (!courseStartDate || (courseStartDate && courseEndDate && courseStartDate !== courseEndDate) || (startObj && dayDate < startObj)) {
        setCourseStartDate(dateStr);
        setCourseEndDate(dateStr);
      } else {
        setCourseEndDate(dateStr);
      }
    };

    const processAndOptimizeCourseImage = async (file: File) => {
      if (!file.type.startsWith('image/')) {
        addNotification(
          'error',
          t('invalidFile'),
          t('invalidFileDesc')
        );
        return;
      }

      setIsUploadingCourseImage(true);
      try {
        const optimizedBase64 = await optimizeCourseImage(file);
        setCourseBgImageUrl(optimizedBase64);
        addNotification(
          'success',
          t('courseBgAttached'),
          t('courseBgAttachedDesc')
        );
      } catch (err) {
        console.error(err);
        addNotification(
          'error',
          t('uploadFailed'),
          t('courseBgFailedDesc')
        );
      } finally {
        setIsUploadingCourseImage(false);
      }
    };

    const handleCourseSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!courseTitle.trim() || !courseDuration.trim() || !courseDates.trim() || !courseDescription.trim()) {
        addNotification('warning', t('missingDetails'), t('fillCourseDetails'));
        return;
      }

      if (selectedCourseInstructors.length < 1 || selectedCourseInstructors.length > 2) {
        addNotification(
          'warning', 
          t('instructorsRequired'), 
          t('selectOneTwoInstructors')
        );
        return;
      }

      setIsSubmittingCourse(true);

      const benefitsArr = courseBenefitsEn.split('\n').map(b => b.trim()).filter(Boolean);
      const benefitsRuArr = courseBenefitsRu.split('\n').map(b => b.trim()).filter(Boolean);
      
      const programArr = courseProgramDays
        .map((day, idx) => ({
          day: `Day ${idx + 1}`,
          title: day.titleEn.trim(),
          desc: day.descEn.trim()
        }))
        .filter(p => p.title);
      
      const programRuArr = courseProgramDays
        .map((day, idx) => ({
          day: `День ${idx + 1}`,
          title: day.titleRu.trim(),
          desc: day.descRu.trim()
        }))
        .filter(p => p.title);
      
      const faqArr = [
        { q: courseFaq1QEn.trim(), a: courseFaq1AEn.trim() },
        { q: courseFaq2QEn.trim(), a: courseFaq2AEn.trim() },
        { q: courseFaq3QEn.trim(), a: courseFaq3AEn.trim() }
      ].filter(f => f.q && f.a);
      
      const faqRuArr = [
        { q: courseFaq1QRu.trim(), a: courseFaq1ARu.trim() },
        { q: courseFaq2QRu.trim(), a: courseFaq2ARu.trim() },
        { q: courseFaq3QRu.trim(), a: courseFaq3ARu.trim() }
      ].filter(f => f.q && f.a);
      
      const galleryArr = courseGalleryPhotos.split('\n').map(p => p.trim()).filter(Boolean);

      const courseId = editingCourse ? editingCourse.id : `course_${Date.now()}`;
      const courseData: any = {
        id: courseId
      };

      if (editingCourse) {
        if (courseTitle.trim()) courseData.title = courseTitle.trim();
        if (courseDuration.trim()) courseData.duration = courseDuration.trim();
        if (courseDescription.trim()) courseData.description = courseDescription.trim();
        if (courseDates.trim()) courseData.dates = courseDates.trim();
        if (courseTotalSeats) {
          courseData.totalSeats = Number(courseTotalSeats);
          courseData.availableSeats = Math.min(
            Number(courseTotalSeats),
            Number(courseTotalSeats) - (editingCourse.totalSeats - editingCourse.availableSeats)
          );
        }
        if (coursePrice) courseData.price = Number(coursePrice);
        if (courseBgImageUrl.trim()) courseData.bgImageUrl = courseBgImageUrl.trim();
        
        courseData.isHidden = courseIsHidden;
        
        if (selectedCourseInstructors.length > 0) courseData.instructorIds = selectedCourseInstructors;
        if (courseShortDescription.trim()) courseData.shortDescription = courseShortDescription.trim();
        if (courseShortDescriptionRu.trim()) courseData.shortDescriptionRu = courseShortDescriptionRu.trim();
        if (courseDetailedDescription.trim()) courseData.detailedDescription = courseDetailedDescription.trim();
        if (courseDetailedDescriptionRu.trim()) courseData.detailedDescriptionRu = courseDetailedDescriptionRu.trim();
        if (courseBadge.trim()) courseData.badge = courseBadge.trim();
        if (courseBadgeRu.trim()) courseData.badgeRu = courseBadgeRu.trim();
        if (courseLevel) courseData.level = courseLevel;
        if (courseVideoUrl.trim()) courseData.videoUrl = courseVideoUrl.trim();
        if (benefitsArr.length > 0) courseData.benefits = benefitsArr;
        if (benefitsRuArr.length > 0) courseData.benefitsRu = benefitsRuArr;
        if (programArr.length > 0) courseData.program = programArr;
        if (programRuArr.length > 0) courseData.programRu = programRuArr;
        if (faqArr.length > 0) courseData.faq = faqArr;
        if (faqRuArr.length > 0) courseData.faqRu = faqRuArr;
        if (galleryArr.length > 0) courseData.galleryPhotos = galleryArr;
      } else {
        courseData.title = courseTitle.trim();
        courseData.duration = courseDuration.trim();
        courseData.description = courseDescription.trim();
        courseData.dates = courseDates.trim();
        courseData.totalSeats = Number(courseTotalSeats) || 5;
        courseData.availableSeats = Number(courseTotalSeats) || 5;
        courseData.price = Number(coursePrice) || 150;
        courseData.bgImageUrl = courseBgImageUrl.trim() || 'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800';
        courseData.isHidden = courseIsHidden;
        courseData.instructorIds = selectedCourseInstructors;
        courseData.order = courses.length;
        
        if (courseShortDescription.trim()) courseData.shortDescription = courseShortDescription.trim();
        if (courseShortDescriptionRu.trim()) courseData.shortDescriptionRu = courseShortDescriptionRu.trim();
        if (courseDetailedDescription.trim()) courseData.detailedDescription = courseDetailedDescription.trim();
        if (courseDetailedDescriptionRu.trim()) courseData.detailedDescriptionRu = courseDetailedDescriptionRu.trim();
        if (courseBadge.trim()) courseData.badge = courseBadge.trim();
        if (courseBadgeRu.trim()) courseData.badgeRu = courseBadgeRu.trim();
        if (courseLevel) courseData.level = courseLevel;
        if (courseVideoUrl.trim()) courseData.videoUrl = courseVideoUrl.trim();
        if (benefitsArr.length > 0) courseData.benefits = benefitsArr;
        if (benefitsRuArr.length > 0) courseData.benefitsRu = benefitsRuArr;
        if (programArr.length > 0) courseData.program = programArr;
        if (programRuArr.length > 0) courseData.programRu = programRuArr;
        if (faqArr.length > 0) courseData.faq = faqArr;
        if (faqRuArr.length > 0) courseData.faqRu = faqRuArr;
        if (galleryArr.length > 0) courseData.galleryPhotos = galleryArr;
      }

      // Clean any undefined properties from courseData before sending to Firestore
      Object.keys(courseData).forEach(key => {
        if ((courseData as any)[key] === undefined) {
          delete (courseData as any)[key];
        }
      });

      try {
        if (editingCourse) {
          if (onUpdateCourse) {
            await onUpdateCourse(courseData);
          }
          setEditingCourse(null);
          addNotification('success', t('successTitle'), t('courseUpdated'));
        } else {
          if (onAddCourse) {
            await onAddCourse(courseData);
          }
          addNotification('success', t('successTitle'), t('courseAdded'));
        }

        resetCourseForm();
      } catch (err) {
        addNotification('error', t('errorTitle'), t('saveCourseFailed'));
      } finally {
        setIsSubmittingCourse(false);
      }
    };

    const startEditCourse = (course: Course) => {
      setEditingCourse(course);
      setCourseTitle(course.title);
      setCourseDuration(course.duration);
      setCourseDescription(course.description);
      setCourseShortDescription(course.shortDescription || '');
      setCourseShortDescriptionRu(course.shortDescriptionRu || '');
      setCourseDetailedDescription(course.detailedDescription || '');
      setCourseDetailedDescriptionRu(course.detailedDescriptionRu || '');
      setCourseBadge(course.badge || '');
      setCourseBadgeRu(course.badgeRu || '');
      setCourseLevel(course.level || '');
      setCourseDates(course.dates);
      setCourseTotalSeats(course.totalSeats);
      setCoursePrice(course.price);
      setCourseBgImageUrl(course.bgImageUrl);
      setCourseIsHidden(!!course.isHidden);
      setSelectedCourseInstructors(course.instructorIds || []);
      
      // Rich course fields
      setCourseVideoUrl(course.videoUrl || '');
      setCourseBenefitsEn((course.benefits || []).join('\n'));
      setCourseBenefitsRu((course.benefitsRu || []).join('\n'));
      
      const loadedProgramDays = [];
      const maxDays = Math.max(course.program?.length || 0, course.programRu?.length || 0);
      for (let i = 0; i < maxDays; i++) {
        loadedProgramDays.push({
          titleEn: course.program?.[i]?.title || '',
          descEn: course.program?.[i]?.desc || '',
          titleRu: course.programRu?.[i]?.title || '',
          descRu: course.programRu?.[i]?.desc || ''
        });
      }
      if (loadedProgramDays.length === 0) {
        loadedProgramDays.push({ titleEn: '', descEn: '', titleRu: '', descRu: '' });
      }
      setCourseProgramDays(loadedProgramDays);
      
      setCourseFaq1QEn(course.faq?.[0]?.q || '');
      setCourseFaq1AEn(course.faq?.[0]?.a || '');
      setCourseFaq1QRu(course.faqRu?.[0]?.q || '');
      setCourseFaq1ARu(course.faqRu?.[0]?.a || '');
      
      setCourseFaq2QEn(course.faq?.[1]?.q || '');
      setCourseFaq2AEn(course.faq?.[1]?.a || '');
      setCourseFaq2QRu(course.faqRu?.[1]?.q || '');
      setCourseFaq2ARu(course.faqRu?.[1]?.a || '');
      
      setCourseFaq3QEn(course.faq?.[2]?.q || '');
      setCourseFaq3AEn(course.faq?.[2]?.a || '');
      setCourseFaq3QRu(course.faqRu?.[2]?.q || '');
      setCourseFaq3ARu(course.faqRu?.[2]?.a || '');
      
      setCourseGalleryPhotos((course.galleryPhotos || []).join('\n'));
      setShowRichCourseDetails(false);
      
      setShowCourseForm(true);

      // Parse course dates into calendar states
      const parsed = parseCourseDates(course.dates);
      setCourseStartDate(formatDateLocalYMD(parsed.start));
      setCourseEndDate(formatDateLocalYMD(parsed.end));
      setCourseStartTime(parsed.startTime);
      setCourseEndTime(parsed.endTime);
      setCalendarViewMonth(new Date(parsed.start));
    };

    const resetCourseForm = () => {
      setCourseTitle('');
      setCourseDuration('');
      setCourseDescription('');
      setCourseShortDescription('');
      setCourseShortDescriptionRu('');
      setCourseDetailedDescription('');
      setCourseDetailedDescriptionRu('');
      setCourseBadge('');
      setCourseBadgeRu('');
      setCourseLevel('');
      setCourseDates('');
      setCourseTotalSeats(10);
      setCoursePrice(199);
      setCourseBgImageUrl('');
      setCourseIsHidden(false);
      setSelectedCourseInstructors([]);
      
      // Rich course fields
      setCourseVideoUrl('');
      setCourseBenefitsEn('');
      setCourseBenefitsRu('');
      setCourseProgramDays([{ titleEn: '', descEn: '', titleRu: '', descRu: '' }]);
      setCourseFaq1QEn('');
      setCourseFaq1AEn('');
      setCourseFaq1QRu('');
      setCourseFaq1ARu('');
      setCourseFaq2QEn('');
      setCourseFaq2AEn('');
      setCourseFaq2QRu('');
      setCourseFaq2ARu('');
      setCourseFaq3QEn('');
      setCourseFaq3AEn('');
      setCourseFaq3QRu('');
      setCourseFaq3ARu('');
      setCourseGalleryPhotos('');
      setShowRichCourseDetails(false);

      setEditingCourse(null);
      setShowCourseForm(false);

      // Reset calendar states
      const today = new Date();
      setCourseStartDate(formatDateLocalYMD(today));
      const afterTwoDays = new Date();
      afterTwoDays.setDate(today.getDate() + 2);
      setCourseEndDate(formatDateLocalYMD(afterTwoDays));
      setCourseStartTime('09:00');
      setCourseEndTime('13:00');
      setCalendarViewMonth(new Date());
    };


    const handleMoveCourse = async (course: Course, direction: 'up' | 'down') => {
      const sorted = [...courses].sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : 999;
        const orderB = b.order !== undefined ? b.order : 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.title.localeCompare(b.title);
      });

      const idx = sorted.findIndex(c => c.id === course.id);
      if (idx === -1) return;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;

      // Swap items in our local array
      const newSorted = [...sorted];
      const temp = newSorted[idx];
      newSorted[idx] = newSorted[targetIdx];
      newSorted[targetIdx] = temp;

      try {
        if (onUpdateCourse) {
          // Sequentially assign correct order indices to all courses
          for (let i = 0; i < newSorted.length; i++) {
            const c = newSorted[i];
            if (c.order !== i) {
              await onUpdateCourse({ ...c, order: i });
            }
          }
          addNotification(
            'success',
            t('orderChanged'),
            t('courseOrderUpdated')
          );
        }
      } catch (err) {
        addNotification(
          'error',
          t('errorTitle'),
          t('courseOrderFailed')
        );
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

  return (
    <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
                  <BookOpenCheck className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
                  {t('coursesDatabaseTitle')}
                </h3>
                <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
                  {t('coursesDatabaseSub')}
                </p>
              </div>

              <button
                onClick={() => {
                  if (showCourseForm) {
                    resetCourseForm();
                  } else {
                    setShowCourseForm(true);
                  }
                }}
                className="py-1.5 px-3 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer flex items-center gap-1.5"
              >
                {showCourseForm ? (
                  <>
                    <X className="w-3.5 h-3.5" />
                    {t('closeForm')}
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    {t('addCourse')}
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Courses List Table */}
              <div className={`${showCourseForm ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4`}>
                <div className="overflow-x-auto border border-[var(--border)]">
                  <table className="w-full text-left border-collapse font-mono text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-[var(--border)] text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">
                        <th className="px-4 py-3 font-bold w-[60px]">{t('courseImageColumn')}</th>
                        <th className="px-4 py-3 font-bold">{t('courseTitleColumn')}</th>
                        <th className="px-4 py-3 font-bold w-[120px]">{t('durationColumn')}</th>
                        <th className="px-4 py-3 font-bold w-[140px]">{t('datesColumn')}</th>
                        <th className="px-4 py-3 font-bold w-[100px]">{t('seatsColumn')}</th>
                        <th className="px-4 py-3 font-bold w-[80px]">{t('priceColumn')}</th>
                        <th className="px-4 py-3 font-bold w-[80px] text-center">{t('orderColumn')}</th>
                        <th className="px-4 py-3 font-bold w-[90px] text-right">{t('actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/40">
                      {(() => {
                        const sortedCourses = [...courses].sort((a, b) => {
                          const orderA = a.order !== undefined ? a.order : 999;
                          const orderB = b.order !== undefined ? b.order : 999;
                          if (orderA !== orderB) return orderA - orderB;
                          return a.title.localeCompare(b.title);
                        });
                        return sortedCourses.map((course, idx) => {
                          const translatedCourse = translateCourse(course, language);
                          return (
                            <tr key={course.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition">
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
                                  <span className="font-bold text-[var(--ink)] block text-xs">{translatedCourse.title}</span>
                                  {translatedCourse.levelLabel && (
                                    <span className={`border text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-wide rounded-none shrink-0 ${
                                      course.level === 'beginner' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50' :
                                      course.level === 'intermediate' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50' :
                                      course.level === 'advanced' ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50' :
                                      course.level === 'expert' ? 'bg-stone-50 dark:bg-stone-950/20 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-900/50' :
                                      'bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/50'
                                    }`}>
                                      {translatedCourse.levelLabel}
                                    </span>
                                  )}
                                  {course.isHidden && (
                                    <span className="bg-rose-950/20 text-rose-400 border border-rose-900/50 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-wide rounded-none shrink-0">
                                      {t('hiddenLabel')}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-[var(--ink-dim)] line-clamp-1 mt-0.5">{translatedCourse.description}</span>
                                
                                {course.instructorIds && course.instructorIds.length > 0 && (
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <span className="text-[9px] text-[var(--ink-dim)] uppercase tracking-wider">{t('instructorsColon')}</span>
                                    {course.instructorIds.map((insId) => {
                                      const ins = instructors.find(i => i.id === insId);
                                      if (!ins) return null;
                                      return (
                                        <span key={insId} className="bg-black/10 dark:bg-white/10 border border-[var(--border)] text-[9px] px-1.5 py-0.5 text-[var(--ink)] font-bold">
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
                                <span className={`font-bold ${course.availableSeats === 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                  {course.availableSeats} / {course.totalSeats}
                                </span>
                                {(() => {
                                  const courseBookings = bookings.filter(
                                    (b) => b.instructorId === `course_${course.id}` && b.status !== 'cancelled' && !b.isDeleted
                                  );
                                  const enrolledNames = courseBookings.map((b) => {
                                    const u = usersList.find((usr) => usr.uid === b.userId);
                                    return u?.displayName || u?.email || b.userId;
                                  }).filter(Boolean);
                                  if (enrolledNames.length > 0) {
                                    return (
                                      <div className="text-[9px] text-[var(--ink-dim)] mt-1 font-mono leading-tight max-w-[120px] truncate" title={enrolledNames.join(', ')}>
                                        <span className="font-bold text-[8px] uppercase tracking-wider block">{t('enrolledColon')}</span>
                                        {enrolledNames.join(', ')}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </td>
                              <td className="px-4 py-2 text-[var(--ink)] font-bold">${course.price}</td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleMoveCourse(course, 'up')}
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
                                    onClick={() => handleMoveCourse(course, 'down')}
                                    disabled={idx === sortedCourses.length - 1}
                                    className={`p-1 border border-transparent rounded-none transition cursor-pointer ${
                                      idx === sortedCourses.length - 1 
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
                                    onClick={async () => {
                                      if (onUpdateCourse) {
                                        await onUpdateCourse({ ...course, isHidden: !course.isHidden });
                                        addNotification(
                                          'success',
                                          t('courseVisibilityUpdated'),
                                          `${t('courseNowPrefix')} "${translatedCourse.title}" ${t('courseNowSuffix')} ${!course.isHidden ? t('hiddenWord') : t('visibleWord')}.`
                                        );
                                      }
                                    }}
                                    className={`p-1.5 border border-transparent rounded-none transition cursor-pointer ${
                                      course.isHidden 
                                        ? 'text-rose-400 hover:text-rose-300' 
                                        : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                                    }`}
                                    title={
                                      course.isHidden 
                                        ? (t('showCourse')) 
                                        : (t('hideCourse'))
                                    }
                                  >
                                    {course.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                  <button
                                    onClick={() => startEditCourse(course)}
                                    className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
                                    title={t('editCourse')}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCourseClick(course)}
                                    className="p-1.5 text-rose-500 hover:text-rose-600 hover:border-rose-500/30 border border-transparent rounded-none transition cursor-pointer"
                                    title={t('deleteCourse')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      {courses.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-xs text-[var(--ink-dim)]">
                            {t('noCoursesFound')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column: Add / Edit Course Form */}
              {showCourseForm && (
                <div className="lg:col-span-4 border border-[var(--border)] p-6 bg-transparent space-y-4 animate-fade-in shrink-0">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                    <h4 className="font-serif text-lg font-light text-[var(--ink)]">
                      {editingCourse ? (t('editCourseForm')) : (t('newCourseForm'))}
                    </h4>
                    <button
                      onClick={resetCourseForm}
                      className="p-1 text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleCourseSubmit} className="space-y-4 font-mono text-xs">
                    {/* Title */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                        {t('courseTitleField')}
                      </label>
                      <input
                        type="text"
                        required
                        value={courseTitle}
                        onChange={(e) => setCourseTitle(e.target.value)}
                        placeholder={t('courseTitlePlaceholder')}
                        className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                      />
                    </div>

                    {/* Duration */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                        {t('durationDescription')}
                      </label>
                      <input
                        type="text"
                        required
                        value={courseDuration}
                        onChange={(e) => setCourseDuration(e.target.value)}
                        placeholder={t('durationPlaceholder')}
                        className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                      />
                    </div>

                    {/* Dates & Calendar Selection */}
                    <div className="space-y-2">
                      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                        {t('datesTimeOfCourse')}
                      </label>
                      
                      {/* Visual trigger / current selection display */}
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            required
                            readOnly
                            value={courseDates}
                            className="w-full px-3.5 py-2 pr-10 border border-[var(--border)] bg-black/5 dark:bg-white/5 text-[var(--ink)] text-xs font-mono focus:outline-none cursor-pointer rounded-none"
                            onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                            placeholder={t('openCalendarPlaceholder')}
                          />
                          <Calendar className="absolute right-3 top-2.5 w-4.5 h-4.5 text-[var(--ink-dim)] pointer-events-none" />
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                          className="px-3 py-2 border border-[var(--border)] text-xs text-[var(--ink)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition rounded-none font-mono font-bold"
                        >
                          {showCalendarPopover ? t('closeCalendar') : t('openCalendar')}
                        </button>
                      </div>

                      {/* Calendar Popover / Expanded Section */}
                      {showCalendarPopover && (
                        <div className="border border-[var(--border)] p-4 bg-black/5 dark:bg-white/5 space-y-4 animate-fade-in rounded-none">
                          {/* Month Navigation */}
                          <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                            <span className="font-serif text-xs font-bold text-[var(--ink)] capitalize">
                              {calendarViewMonth.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric' })}
                            </span>
                            
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={handlePrevMonth}
                                className="p-1 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition bg-transparent rounded-none"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleNextMonth}
                                className="p-1 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition bg-transparent rounded-none"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Calendar Grid */}
                          <div className="grid grid-cols-7 gap-1 text-center font-mono">
                            {/* Weekday Headers */}
                            {(language === 'ru' ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']).map((wd) => (
                              <span key={wd} className="text-[9px] font-bold text-[var(--ink-dim)] py-1">
                                {wd}
                              </span>
                            ))}

                            {/* Month Days */}
                            {calendarDays.map((cell, idx) => {
                              const cellDateStr = formatDateLocalYMD(cell.date);
                              const isStart = cellDateStr === courseStartDate;
                              const isEnd = cellDateStr === courseEndDate;
                              
                              const startObj = courseStartDate ? new Date(courseStartDate) : null;
                              const endObj = courseEndDate ? new Date(courseEndDate) : null;
                              const isRange = startObj && endObj && cell.date >= startObj && cell.date <= endObj;
                              
                              let cellBgClass = "bg-transparent text-[var(--ink)] hover:bg-black/10 dark:hover:bg-white/10";
                              if (isStart || isEnd) {
                                cellBgClass = "bg-[var(--ink)] text-[var(--bg)] font-bold";
                              } else if (isRange) {
                                cellBgClass = "bg-sky-550/20 text-[var(--ink)] font-bold border-y border-dashed border-sky-500/20";
                              } else if (!cell.isCurrentMonth) {
                                cellBgClass = "text-[var(--ink-dim)] opacity-40 hover:bg-black/5 dark:hover:bg-white/5";
                              }

                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleCalendarDayClick(cell.date)}
                                  className={`h-7 w-7 text-[10px] flex items-center justify-center transition cursor-pointer rounded-none border border-transparent ${cellBgClass}`}
                                >
                                  {cell.day}
                                </button>
                              );
                            })}
                          </div>

                          {/* Guide Text */}
                          <div className="text-[9px] text-[var(--ink-dim)] font-mono text-center">
                            {t('calendarRangeHint')}
                          </div>

                          {/* Time Slot Customizer within calendar panel */}
                          <div className="border-t border-[var(--border)] pt-3 space-y-3">
                            <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold block flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {t('dailyHours')}
                            </span>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <label className="text-[9px] text-[var(--ink-dim)] block">
                                  {t('startTime')}
                                </label>
                                <input
                                  type="time"
                                  required
                                  value={courseStartTime}
                                  onChange={(e) => setCourseStartTime(e.target.value)}
                                  className="w-full px-2 py-1 bg-transparent border border-[var(--border)] text-[var(--ink)] text-xs font-mono focus:outline-none focus:border-[var(--ink)] rounded-none"
                                />
                              </div>
                              
                              <div className="space-y-1">
                                <label className="text-[9px] text-[var(--ink-dim)] block">
                                  {t('endTime')}
                                </label>
                                <input
                                  type="time"
                                  required
                                  value={courseEndTime}
                                  onChange={(e) => setCourseEndTime(e.target.value)}
                                  className="w-full px-2 py-1 bg-transparent border border-[var(--border)] text-[var(--ink)] text-xs font-mono focus:outline-none focus:border-[var(--ink)] rounded-none"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                        {t('fallbackDescEn')}
                      </label>
                      <textarea
                        required
                        rows={2}
                        value={courseDescription}
                        onChange={(e) => setCourseDescription(e.target.value)}
                        placeholder={t('fallbackDescPlaceholder')}
                        className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none leading-relaxed text-xs"
                      />
                    </div>

                    {/* Course Level (Difficulty) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                        {t('courseDifficultyLevel')}
                      </label>
                      <select
                        value={courseLevel}
                        onChange={(e) => setCourseLevel(e.target.value as any)}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono"
                      >
                        <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{t('selectLevelNone')}</option>
                        <option value="beginner" className="bg-[var(--bg)] text-[var(--ink)]">🟢 LEVEL 1 • BEGINNER</option>
                        <option value="intermediate" className="bg-[var(--bg)] text-[var(--ink)]">🟡 LEVEL 2 • CARVE</option>
                        <option value="advanced" className="bg-[var(--bg)] text-[var(--ink)]">🔴 LEVEL 3 • PRO</option>
                        <option value="expert" className="bg-[var(--bg)] text-[var(--ink)]">⚫ LEVEL 4 • EXPERT</option>
                      </select>
                    </div>

                    {/* Additional Details & Translations */}
                    <div className="border-t border-[var(--border)]/40 pt-4 space-y-4">
                      <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold block">
                        {t('badgeDescriptionsSection')}
                      </span>

                      {/* Badges Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-[var(--ink-dim)] block">
                            {t('cardBadgeEn')}
                          </label>
                          <input
                            type="text"
                            value={courseBadge}
                            onChange={(e) => setCourseBadge(e.target.value)}
                            placeholder="e.g. PRO or https://example.com/badge.png"
                            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-[var(--ink-dim)] block">
                            {t('cardBadgeRu')}
                          </label>
                          <input
                            type="text"
                            value={courseBadgeRu}
                            onChange={(e) => setCourseBadgeRu(e.target.value)}
                            placeholder="напр. ПРО или https://example.com/badge.png"
                            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs"
                          />
                        </div>
                      </div>

                      {/* Short Descriptions Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-[var(--ink-dim)] block">
                            {t('shortDescEnCard')}
                          </label>
                          <textarea
                            rows={2}
                            value={courseShortDescription}
                            onChange={(e) => setCourseShortDescription(e.target.value)}
                            placeholder="Short catchy summary..."
                            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-[var(--ink-dim)] block">
                            {t('shortDescRuCard')}
                          </label>
                          <textarea
                            rows={2}
                            value={courseShortDescriptionRu}
                            onChange={(e) => setCourseShortDescriptionRu(e.target.value)}
                            placeholder="Краткое описание на русском..."
                            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
                          />
                        </div>
                      </div>

                      {/* Detailed Descriptions Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-[var(--ink-dim)] block">
                            {t('detailedDescEnModal')}
                          </label>
                          <textarea
                            rows={3}
                            value={courseDetailedDescription}
                            onChange={(e) => setCourseDetailedDescription(e.target.value)}
                            placeholder="Full curriculum details..."
                            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-[var(--ink-dim)] block">
                            {t('detailedDescRuModal')}
                          </label>
                          <textarea
                            rows={3}
                            value={courseDetailedDescriptionRu}
                            onChange={(e) => setCourseDetailedDescriptionRu(e.target.value)}
                            placeholder="Подробное описание на русском..."
                            className="w-full px-3 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Grid for Seats & Price */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                          {t('totalSeats')}
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={courseTotalSeats}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCourseTotalSeats(val);
                          }}
                          className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                          {t('priceUsd')}
                        </label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={coursePrice}
                          onChange={(e) => setCoursePrice(Number(e.target.value))}
                          className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                        />
                      </div>
                    </div>

                    {/* Background Image URL & File Upload */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                        {t('backgroundImageUrl')}
                      </label>
                      <input
                        type="url"
                        value={courseBgImageUrl}
                        onChange={(e) => setCourseBgImageUrl(e.target.value)}
                        placeholder="https://images.unsplash.com/..."
                        className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none mb-1"
                      />
                      
                      {/* File Upload zone */}
                      <div 
                        onDragOver={(e) => { e.preventDefault(); setIsCourseDragOver(true); }}
                        onDragLeave={() => setIsCourseDragOver(false)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          setIsCourseDragOver(false);
                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            await processAndOptimizeCourseImage(e.dataTransfer.files[0]);
                          }
                        }}
                        className={`border border-dashed p-4 text-center cursor-pointer transition ${isCourseDragOver ? 'border-[var(--ink)] bg-black/10' : 'border-[var(--border)] hover:border-[var(--ink)]'}`}
                        onClick={() => document.getElementById('course-image-input')?.click()}
                      >
                        <input 
                          id="course-image-input" 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={async (e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              await processAndOptimizeCourseImage(e.target.files[0]);
                            }
                          }} 
                        />
                        <div className="flex flex-col items-center gap-1">
                          {isUploadingCourseImage ? (
                            <Loader2 className="w-5 h-5 text-[var(--ink-dim)] animate-spin" />
                          ) : (
                            <Camera className="w-5 h-5 text-[var(--ink-dim)]" />
                          )}
                          <span className="text-[10px] text-[var(--ink-dim)]">
                            {t('dragUploadBgPhoto')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Instructor Assignment */}
                    <div className="space-y-2">
                      <label className="text-[10px] text-[var(--ink-dim)] uppercase block font-bold">
                        {t('assignedInstructors')}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {instructors.map((ins) => {
                          const isSelected = selectedCourseInstructors.includes(ins.id);
                          return (
                            <button
                              key={ins.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedCourseInstructors(prev => prev.filter(id => id !== ins.id));
                                } else {
                                  if (selectedCourseInstructors.length >= 2) {
                                    setSelectedCourseInstructors(prev => [prev[1], ins.id]);
                                  } else {
                                    setSelectedCourseInstructors(prev => [...prev, ins.id]);
                                  }
                                }
                              }}
                              className={`flex items-center gap-2 p-2 border transition text-left cursor-pointer rounded-none ${
                                isSelected 
                                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)] font-bold' 
                                  : 'border-[var(--border)] hover:border-[var(--ink)] bg-transparent text-[var(--ink)]'
                              }`}
                            >
                              <img 
                                src={ins.avatarUrl} 
                                referrerPolicy="no-referrer"
                                alt={ins.name} 
                                className={`w-6 h-6 object-cover border shrink-0 ${isSelected ? 'border-[var(--bg)]' : 'border-[var(--border)] grayscale'}`} 
                              />
                              <div className="min-w-0 leading-tight">
                                <p className="text-[9px] font-bold truncate">
                                  {translateInstructorName(ins.name, language)}
                                </p>
                                <p className={`text-[8px] truncate ${isSelected ? 'text-[var(--bg)]/80' : 'text-[var(--ink-dim)]'}`}>
                                  {getSpecialtyLabel(ins.specialty, language)}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-[var(--ink-dim)] italic">
                        {t('instructorSelectHint')}
                      </p>
                    </div>

                    {/* Rich Details Trigger Button */}
                    <div className="pt-2 border-t border-[var(--border)]/40">
                      <button
                        type="button"
                        onClick={() => setShowRichCourseDetails(!showRichCourseDetails)}
                        className="w-full py-2 px-3 border border-[var(--border)] hover:border-[var(--ink)] bg-black/5 dark:bg-white/5 text-[var(--ink)] font-mono text-[10px] uppercase tracking-wider flex items-center justify-between transition rounded-none cursor-pointer"
                      >
                        <span>
                          {t('editCoursePageDetails')}
                        </span>
                        <span className="font-bold text-xs">{showRichCourseDetails ? '−' : '+'}</span>
                      </button>
                    </div>

                    {/* Collapsible Rich Details Section */}
                    {showRichCourseDetails && (
                      <div className="space-y-4 p-3 border border-[var(--border)] bg-black/5 dark:bg-white/5 animate-fade-in font-mono text-xs">
                        <p className="text-[9px] text-[var(--ink-dim)] uppercase tracking-widest font-bold border-b border-[var(--border)] pb-1.5 mb-2">
                          {t('courseDetailsOverrides')}
                        </p>

                        {/* Video URL */}
                        <div className="space-y-1">
                          <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
                            {t('promoVideoUrl')}
                          </label>
                          <input
                            type="url"
                            value={courseVideoUrl}
                            onChange={(e) => setCourseVideoUrl(e.target.value)}
                            placeholder="https://player.vimeo.com/external/...mp4 or other direct stream URL"
                            className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                          />
                        </div>

                        {/* Benefits Section */}
                        <div className="grid grid-cols-1 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
                              {t('benefitsEn')}
                            </label>
                            <textarea
                              rows={3}
                              value={courseBenefitsEn}
                              onChange={(e) => setCourseBenefitsEn(e.target.value)}
                              placeholder="e.g.&#10;Professional video analysis&#10;Custom ski tuning advice&#10;Skipass inclusion"
                              className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
                              {t('benefitsRu')}
                            </label>
                            <textarea
                              rows={3}
                              value={courseBenefitsRu}
                              onChange={(e) => setCourseBenefitsRu(e.target.value)}
                              placeholder="напр.&#10;Профессиональный видеоанализ&#10;Советы по подготовке лыж&#10;Скипасс включен в стоимость"
                              className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                            />
                          </div>
                        </div>

                        {/* Program Section */}
                        <div className="border-t border-[var(--border)] pt-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold">
                              {t('dayByDayProgram')}
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (courseProgramDays.length > 1) {
                                    setCourseProgramDays(courseProgramDays.slice(0, -1));
                                  }
                                }}
                                disabled={courseProgramDays.length <= 1}
                                className="px-2 py-1 border border-[var(--border)] text-[9px] uppercase tracking-wider hover:border-[var(--ink)] disabled:opacity-50 disabled:cursor-not-allowed font-mono text-[var(--ink)] bg-transparent rounded-none transition cursor-pointer"
                              >
                                {t('removeDay')}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCourseProgramDays([...courseProgramDays, { titleEn: '', descEn: '', titleRu: '', descRu: '' }]);
                                }}
                                className="px-2 py-1 border border-[var(--border)] text-[9px] uppercase tracking-wider hover:border-[var(--ink)] font-mono text-[var(--ink)] bg-transparent rounded-none transition cursor-pointer"
                              >
                                {t('addDay')}
                              </button>
                            </div>
                          </div>

                          {courseProgramDays.map((day, idx) => (
                            <div key={idx} className="space-y-2 border-l border-[var(--border)] pl-2.5">
                              <p className="text-[9px] font-bold uppercase text-[var(--ink-dim)]">
                                {`${t('dayPrefix')} ${idx + 1}`}
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={day.titleEn}
                                  onChange={(e) => {
                                    const updated = [...courseProgramDays];
                                    updated[idx] = { ...updated[idx], titleEn: e.target.value };
                                    setCourseProgramDays(updated);
                                  }}
                                  placeholder="Title (EN)"
                                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                                />
                                <input
                                  type="text"
                                  value={day.titleRu}
                                  onChange={(e) => {
                                    const updated = [...courseProgramDays];
                                    updated[idx] = { ...updated[idx], titleRu: e.target.value };
                                    setCourseProgramDays(updated);
                                  }}
                                  placeholder="Название (RU)"
                                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <textarea
                                  rows={2}
                                  value={day.descEn}
                                  onChange={(e) => {
                                    const updated = [...courseProgramDays];
                                    updated[idx] = { ...updated[idx], descEn: e.target.value };
                                    setCourseProgramDays(updated);
                                  }}
                                  placeholder="Description (EN)"
                                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                                />
                                <textarea
                                  rows={2}
                                  value={day.descRu}
                                  onChange={(e) => {
                                    const updated = [...courseProgramDays];
                                    updated[idx] = { ...updated[idx], descRu: e.target.value };
                                    setCourseProgramDays(updated);
                                  }}
                                  placeholder="Описание (RU)"
                                  className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* FAQ 1-3 Section */}
                        <div className="border-t border-[var(--border)] pt-3 space-y-3">
                          <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold block">
                            {t('faqSection')}
                          </span>

                          {/* FAQ 1 */}
                          <div className="space-y-2 border-l border-[var(--border)] pl-2.5">
                            <p className="text-[9px] font-bold uppercase text-[var(--ink-dim)]">{t('faq1')}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={courseFaq1QEn}
                                onChange={(e) => setCourseFaq1QEn(e.target.value)}
                                placeholder="Question (EN)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                              />
                              <input
                                type="text"
                                value={courseFaq1QRu}
                                onChange={(e) => setCourseFaq1QRu(e.target.value)}
                                placeholder="Вопрос (RU)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <textarea
                                rows={2}
                                value={courseFaq1AEn}
                                onChange={(e) => setCourseFaq1AEn(e.target.value)}
                                placeholder="Answer (EN)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                              />
                              <textarea
                                rows={2}
                                value={courseFaq1ARu}
                                onChange={(e) => setCourseFaq1ARu(e.target.value)}
                                placeholder="Ответ (RU)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                              />
                            </div>
                          </div>

                          {/* FAQ 2 */}
                          <div className="space-y-2 border-l border-[var(--border)] pl-2.5">
                            <p className="text-[9px] font-bold uppercase text-[var(--ink-dim)]">{t('faq2')}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={courseFaq2QEn}
                                onChange={(e) => setCourseFaq2QEn(e.target.value)}
                                placeholder="Question (EN)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                              />
                              <input
                                type="text"
                                value={courseFaq2QRu}
                                onChange={(e) => setCourseFaq2QRu(e.target.value)}
                                placeholder="Вопрос (RU)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <textarea
                                rows={2}
                                value={courseFaq2AEn}
                                onChange={(e) => setCourseFaq2AEn(e.target.value)}
                                placeholder="Answer (EN)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                              />
                              <textarea
                                rows={2}
                                value={courseFaq2ARu}
                                onChange={(e) => setCourseFaq2ARu(e.target.value)}
                                placeholder="Ответ (RU)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                              />
                            </div>
                          </div>

                          {/* FAQ 3 */}
                          <div className="space-y-2 border-l border-[var(--border)] pl-2.5">
                            <p className="text-[9px] font-bold uppercase text-[var(--ink-dim)]">{t('faq3')}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={courseFaq3QEn}
                                onChange={(e) => setCourseFaq3QEn(e.target.value)}
                                placeholder="Question (EN)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                              />
                              <input
                                type="text"
                                value={courseFaq3QRu}
                                onChange={(e) => setCourseFaq3QRu(e.target.value)}
                                placeholder="Вопрос (RU)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none text-xs font-mono"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <textarea
                                rows={2}
                                value={courseFaq3AEn}
                                onChange={(e) => setCourseFaq3AEn(e.target.value)}
                                placeholder="Answer (EN)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                              />
                              <textarea
                                rows={2}
                                value={courseFaq3ARu}
                                onChange={(e) => setCourseFaq3ARu(e.target.value)}
                                placeholder="Ответ (RU)"
                                className="w-full px-2 py-1 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Gallery Photos Section */}
                        <div className="border-t border-[var(--border)] pt-3 space-y-1">
                          <label className="text-[9px] text-[var(--ink-dim)] uppercase block">
                            {t('galleryPhotos')}
                          </label>
                          <textarea
                            rows={3}
                            value={courseGalleryPhotos}
                            onChange={(e) => setCourseGalleryPhotos(e.target.value)}
                            placeholder="https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800"
                            className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* Visibility Toggle */}
                    <div className="flex items-center gap-2 border border-[var(--border)] p-2.5 bg-black/5 dark:bg-white/5 transition">
                      <input
                        id="course-is-hidden"
                        type="checkbox"
                        checked={courseIsHidden}
                        onChange={(e) => setCourseIsHidden(e.target.checked)}
                        className="w-4 h-4 rounded-none border-[var(--border)] text-[var(--ink)] focus:ring-0 bg-transparent cursor-pointer"
                      />
                      <label htmlFor="course-is-hidden" className="text-[10px] text-[var(--ink)] uppercase tracking-wider font-bold cursor-pointer select-none">
                        {t('hideCourseFromUsers')}
                      </label>
                    </div>

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={isSubmittingCourse}
                      className="w-full py-2.5 px-4 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingCourse ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          {editingCourse ? (t('updateCourse')) : (t('createCourse'))}
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
  );
};
