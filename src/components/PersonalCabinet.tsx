import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Booking, UserProfile, LessonDifficulty, Review, Course } from '../types';
import { 
  Calendar, 
  Clock, 
  X, 
  Star, 
  Edit2, 
  Trash2, 
  Loader2,
  Wallet,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Shield,
  Bell
} from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage, translateInstructorName, translateCourse, parseCourseDates, parseDurationHours, splitCourseDates } from '../lib/LanguageContext';
import { db, collection, query, getDocs, where } from '../lib/firebase';

interface PersonalCabinetProps {
  userProfile: UserProfile;
  bookings: Booking[];
  reviews: Review[];
  dismissedReviewIds?: string[];
  onDismissReview?: (bookingId: string) => void;
  onReschedule: (id: string, newDate: string, newTime: string) => Promise<void>;
  onCancel: (id: string, reason?: string) => Promise<void>;
  onAddReview: (newReview: Omit<Review, 'id' | 'userId' | 'userName' | 'userAvatar' | 'date'>) => Promise<void>;
  onSignOut: () => void;
  onUpdateProfile?: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  courses?: Course[];
}

function optimizeProfileImage(file: File): Promise<string> {
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
        const MAX_SIZE = 200; // 200x200px is perfect for profile avatars
        let width = img.width;
        let height = img.height;

        // Crop to a perfect square centered
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = width;
        let sourceHeight = height;

        if (width > height) {
          sourceX = (width - height) / 2;
          sourceWidth = height;
        } else {
          sourceY = (height - width) / 2;
          sourceHeight = width;
        }

        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get 2D context'));
          return;
        }

        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          MAX_SIZE,
          MAX_SIZE
        );

        // Compress to JPEG with 70% quality (ideal balance between visual crispness and microscopic size)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image source'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const PersonalCabinet: React.FC<PersonalCabinetProps> = ({
  userProfile,
  bookings: rawBookings,
  reviews,
  dismissedReviewIds = [],
  onDismissReview,
  onReschedule,
  onCancel,
  onAddReview,
  onSignOut,
  onUpdateProfile,
  courses = []
}) => {
  const { addNotification } = useNotifications();
  const { language } = useLanguage();

  // Translate instructorName and merge live course details in bookings list
  const bookings = useMemo(() => {
    return rawBookings.map((b) => {
      const isCourse = b.instructorId.startsWith('course_');
      let name = b.instructorName;
      let avatar = b.instructorAvatar;
      let durationHours = b.durationHours;
      let notes = b.notes;
      let date = b.date;
      let time = b.time;

      if (isCourse) {
        const courseId = b.instructorId.replace('course_', '');
        const liveCourse = (courses || []).find((c) => c.id === courseId);
        if (liveCourse) {
          const translated = translateCourse(liveCourse, language);
          name = language === 'ru' ? `${translated.title} (Групповой курс)` : `${translated.title} (Group Course)`;
          avatar = translated.bgImageUrl || b.instructorAvatar;
          durationHours = parseDurationHours(translated.duration, b.durationHours);
          notes = `${language === 'en' ? 'Group Course enrollment' : 'Запись на групповой курс'}: ${translated.description}`;
          
          if (translated.dates) {
            const { datePart, timePart } = splitCourseDates(translated.dates);
            date = datePart;
            time = timePart;
          }
        } else {
          if (name.includes('(Group Course)') || name.includes('(Групповой курс)')) {
            const cleanTitle = name.replace(/\s*\(Group Course\)/i, '').replace(/\s*\(Групповой курс\)/i, '').trim();
            const dummyCourse = { id: '', title: cleanTitle, duration: '', description: '', dates: '', totalSeats: 0, availableSeats: 0, price: 0, bgImageUrl: '' };
            const translated = translateCourse(dummyCourse, language);
            name = language === 'ru' ? `${translated.title} (Групповой курс)` : `${translated.title} (Group Course)`;
          }
          if (time === 'Group Schedule') {
            const { datePart, timePart } = splitCourseDates(date);
            date = datePart;
            time = timePart;
          }
        }
      } else {
        name = translateInstructorName(name, language);
      }
      return {
        ...b,
        instructorName: name,
        instructorAvatar: avatar,
        durationHours,
        notes,
        date,
        time
      };
    });
  }, [rawBookings, courses, language]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string>('');
  const [newTime, setNewTime] = useState<string>('09:00');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleInstructorBookings, setRescheduleInstructorBookings] = useState<Booking[]>([]);
  const [isLoadingInstructorBookings, setIsLoadingInstructorBookings] = useState<boolean>(false);

  // Fetch coach's bookings when reschedule is active
  useEffect(() => {
    if (!rescheduleId) {
      setRescheduleInstructorBookings([]);
      return;
    }
    const currentBooking = bookings.find((b) => b.id === rescheduleId);
    if (!currentBooking) return;

    const fetchInstructorBookings = async () => {
      setIsLoadingInstructorBookings(true);
      try {
        const q = query(
          collection(db, 'bookings'),
          where('instructorId', '==', currentBooking.instructorId)
        );
        const snap = await getDocs(q);
        const list: Booking[] = [];
        if (snap && !snap.empty) {
          snap.forEach((doc) => {
            const b = { id: doc.id, ...doc.data() } as Booking;
            if (b.status !== 'cancelled' && b.id !== rescheduleId) {
              list.push(b);
            }
          });
        }
        setRescheduleInstructorBookings(list);
      } catch (err) {
        console.error('Error fetching instructor bookings for reschedule:', err);
      } finally {
        setIsLoadingInstructorBookings(false);
      }
    };

    fetchInstructorBookings();
  }, [rescheduleId, bookings, userProfile?.uid]);

  const availableSlots = useMemo(() => {
    const currentBooking = rescheduleId ? bookings.find((b) => b.id === rescheduleId) : null;
    if (!currentBooking || !newDate) return [];

    const duration = currentBooking.durationHours;
    const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

    const timeToMinutes = (tStr: string): number => {
      const [h, m] = tStr.split(':').map(Number);
      return h * 60 + m;
    };

    const toYMD = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    return timeSlots.filter((slot) => {
      const start = timeToMinutes(slot);
      const end = start + duration * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00

      // Check standard bookings overlap
      for (const b of rescheduleInstructorBookings) {
        if (b.date !== newDate) continue;
        const bStart = timeToMinutes(b.time);
        const bEnd = bStart + b.durationHours * 60;

        if (start < bEnd && end > bStart) {
          return false;
        }
      }

      // Check group courses overlap
      if (currentBooking.instructorId) {
        const hasCourseOverlap = (courses || []).some((course) => {
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId)) return false;
          
          const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
          const startStr = toYMD(cStart);
          const endStr = toYMD(cEnd);
          
          if (newDate < startStr || newDate > endStr) return false;
          
          const cStartMin = timeToMinutes(cStartTime);
          const cEndMin = timeToMinutes(cEndTime);
          return start < cEndMin && end > cStartMin;
        });
        
        if (hasCourseOverlap) return false;
      }

      return true;
    });
  }, [rescheduleId, bookings, newDate, rescheduleInstructorBookings, courses]);

  // Auto-select first available slot if current selected slot is not available
  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.includes(newTime)) {
      setNewTime(availableSlots[0]);
    }
  }, [availableSlots, newTime]);

  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [isDraggingAvatar, setIsDraggingAvatar] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    showReasonInput?: boolean;
    onConfirm: (reason?: string) => void | Promise<void>;
  } | null>(null);

  const userBookings = bookings.filter((b) => b.userId === userProfile.uid && !b.isDeleted);

  const [hideCancelled, setHideCancelled] = useState<boolean>(() => {
    const saved = localStorage.getItem('alpine_glide_hide_cancelled_bookings');
    return saved === 'true';
  });

  const handleToggleHideCancelled = (val: boolean) => {
    setHideCancelled(val);
    localStorage.setItem('alpine_glide_hide_cancelled_bookings', String(val));
  };

  const unreviewedCompletedBookings = useMemo(() => {
    return userBookings.filter((b) => {
      if (b.status !== 'completed') return false;
      if (dismissedReviewIds.includes(b.id)) return false;
      const alreadyReviewed = reviews.some(
        (r) => r.bookingId === b.id || (r.userId === userProfile.uid && r.instructorId === b.instructorId && r.date === b.date)
      );
      return !alreadyReviewed;
    });
  }, [userBookings, reviews, userProfile.uid, dismissedReviewIds]);

  // --- Calendar Integration and Visual Grid Features ---
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const upcoming = userBookings.find(b => b.status === 'confirmed');
    if (upcoming) {
      const d = new Date(upcoming.date);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null);

  const MONTHS_RU = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  const MONTHS_EN = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const WEEKDAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  const getDaysInMonth = (y: number, m: number) => {
    return new Date(y, m + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (y: number, m: number) => {
    const day = new Date(y, m, 1).getDay();
    return day === 0 ? 6 : day - 1; // Adjust so Monday is 0, Sunday is 6
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() - 1);
      return next;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  };

  const formatDateStr = (dayNum: number) => {
    const mm = String(currentMonth.getMonth() + 1).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    return `${currentMonth.getFullYear()}-${mm}-${dd}`;
  };

  const filteredBookings = useMemo(() => {
    return userBookings.filter(b => {
      if (hideCancelled && b.status === 'cancelled') return false;
      return true;
    });
  }, [userBookings, hideCancelled]);

  const getBookingsOnDate = (dateStr: string) => {
    return filteredBookings.filter(b => {
      if (b.instructorId.startsWith('course_')) {
        const { start, end } = parseCourseDates(b.date);
        const checkDate = new Date(dateStr);
        // Adjust for timezone differences by comparing dates only
        const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        const currentDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate());
        
        return currentDate >= startDate && currentDate <= endDate;
      }
      return b.date === dateStr;
    });
  };

  const getGoogleCalendarUrl = (b: Booking) => {
    const startClean = b.date.replace(/-/g, '') + 'T' + b.time.replace(/:/g, '') + '00';
    const startDate = new Date(`${b.date}T${b.time}:00`);
    const endDate = new Date(startDate.getTime() + b.durationHours * 60 * 60 * 1000);
    
    const endYear = endDate.getFullYear();
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDate.getDate()).padStart(2, '0');
    const endHours = String(endDate.getHours()).padStart(2, '0');
    const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
    const endClean = `${endYear}${endMonth}${endDay}T${endHours}${endMinutes}00`;

    const title = language === 'ru' 
      ? `Занятие с инструктором ${b.instructorName}`
      : `Lesson with ${b.instructorName} (${b.difficulty})`;

    const details = language === 'ru'
      ? `Индивидуальная тренировка на склоне с инструктором ${b.instructorName}.\nПродолжительность: ${b.durationHours} ч.\nЗаметки: ${b.notes || 'Нет'}\n\nЗабронировано через Carve Academy.`
      : `Ski/Snowboard coaching session with instructor ${b.instructorName}.\nDuration: ${b.durationHours} hours\nNotes: ${b.notes || 'None'}\n\nBooked via Carve Academy.`;

    const location = language === 'ru'
      ? `Академия карвинга Carve Academy, Склоны`
      : `Carve Academy, Slopes`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startClean}/${endClean}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
  };

  const handleDownloadIcs = (b: Booking) => {
    const startClean = b.date.replace(/-/g, '') + 'T' + b.time.replace(/:/g, '') + '00';
    const startDate = new Date(`${b.date}T${b.time}:00`);
    const endDate = new Date(startDate.getTime() + b.durationHours * 60 * 60 * 1000);
    
    const endYear = endDate.getFullYear();
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDate.getDate()).padStart(2, '0');
    const endHours = String(endDate.getHours()).padStart(2, '0');
    const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
    const endClean = `${endYear}${endMonth}${endDay}T${endHours}${endMinutes}00`;

    const title = language === 'ru' 
      ? `Занятие с инструктором ${b.instructorName}`
      : `Lesson with ${b.instructorName} (${b.difficulty})`;

    const details = language === 'ru'
      ? `Индивидуальная тренировка на склоне с инструктором ${b.instructorName}. Продолжительность: ${b.durationHours} ч.`
      : `Coaching session with ${b.instructorName}. Duration: ${b.durationHours} hours.`;

    const location = language === 'ru'
      ? `Академия карвинга Carve Academy, Склоны`
      : `Carve Academy, Slopes`;

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Carve Academy//Bookings//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `DTSTART:${startClean}`,
      `DTEND:${endClean}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${details}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'SEQUENCE:0',
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `booking_${b.id}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addNotification(
      'success',
      language === 'en' ? 'Calendar File Saved' : 'Файл календаря сохранен',
      language === 'en' ? 'You can import this .ics file into your device calendar.' : 'Вы можете импортировать этот .ics файл в календарь своего устройства.'
    );
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);

  const daysArray: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysArray.push(d);
  }

  
  // ----------------------------------------------------

  const getDifficultyLabel = (diff: LessonDifficulty) => {
    if (language === 'ru') {
      switch (diff) {
        case 'beginner': return '🟢 Начинающий (Зеленые)';
        case 'intermediate': return '🔵 Средний уровень (Синие)';
        case 'advanced': return '🔴 Продвинутый (Черные)';
        case 'freeride': return '🏔️ Фрирайд';
        case 'freestyle': return '🛹 Фристайл';
      }
    }
    switch (diff) {
      case 'beginner': return '🟢 Beginner (Green)';
      case 'intermediate': return '🔵 Intermediate (Blue)';
      case 'advanced': return '🔴 Advanced (Black)';
      case 'freeride': return '🏔️ Freeride';
      case 'freestyle': return '🛹 Freestyle';
    }
  };

  const displayedBookings = selectedDateFilter
    ? getBookingsOnDate(selectedDateFilter)
    : filteredBookings;

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleId || !newDate) return;

    const currentBooking = bookings.find((b) => b.id === rescheduleId);
    if (!currentBooking) return;

    setIsRescheduling(true);
    try {
      let conflictBooking: Booking | null = null;

      const timeToMinutes = (tStr: string): number => {
        const [h, m] = tStr.split(':').map(Number);
        return h * 60 + m;
      };

      const checkOverlap = (
        targetDate: string,
        targetTime: string,
        duration: number,
        existing: Booking[]
      ): Booking | null => {
        const start = timeToMinutes(targetTime);
        const end = start + duration * 60;

        for (const b of existing) {
          if (b.date !== targetDate) continue;
          const bStart = timeToMinutes(b.time);
          const bEnd = bStart + b.durationHours * 60;

          if (start < bEnd && end > bStart) {
            return b;
          }
        }
        return null;
      };

      // Fetch confirmed/active bookings for this instructor
      const q = query(
        collection(db, 'bookings'),
        where('instructorId', '==', currentBooking.instructorId),
        where('date', '==', newDate)
      );
      const snap = await getDocs(q);
      const activeBookings: Booking[] = [];
      if (snap && !snap.empty) {
        snap.forEach((doc) => {
          const b = { id: doc.id, ...doc.data() } as Booking;
          if (b.status !== 'cancelled' && b.id !== rescheduleId) {
            activeBookings.push(b);
          }
        });
      }
      conflictBooking = checkOverlap(newDate, newTime, currentBooking.durationHours, activeBookings);

      if (conflictBooking) {
        addNotification(
          'error',
          language === 'en' ? 'Instructor Busy' : 'Инструктор занят',
          language === 'en'
            ? `${currentBooking.instructorName} is already booked on ${newDate} around ${newTime}. Please choose another date or time.`
            : `${currentBooking.instructorName} уже забронирован(а) на ${newDate} около ${newTime}. Пожалуйста, выберите другую дату или время.`
        );
        setIsRescheduling(false);
        return;
      }

      // Check group courses overlap
      let conflictCourse: Course | null = null;
      if (currentBooking.instructorId) {
        const toYMD = (d: Date): string => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };

        const start = timeToMinutes(newTime);
        const end = start + currentBooking.durationHours * 60;

        for (const course of courses || []) {
          if (!course.instructorIds || !course.instructorIds.includes(currentBooking.instructorId)) continue;
          
          const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
          const startStr = toYMD(cStart);
          const endStr = toYMD(cEnd);
          
          if (newDate >= startStr && newDate <= endStr) {
            const cStartMin = timeToMinutes(cStartTime);
            const cEndMin = timeToMinutes(cEndTime);
            
            if (start < cEndMin && end > cStartMin) {
              conflictCourse = course;
              break;
            }
          }
        }
      }

      if (conflictCourse) {
        addNotification(
          'error',
          language === 'en' ? 'Instructor Reserved' : 'Инструктор зарезервирован',
          language === 'en'
            ? `${currentBooking.instructorName} is leading the group course "${conflictCourse.title}" on ${newDate} at this time (${conflictCourse.dates}). Please choose another date or time.`
            : `${currentBooking.instructorName} ведет групповой курс «${conflictCourse.title}» ${newDate} в это время (${conflictCourse.dates}). Пожалуйста, выберите другую дату или время.`
        );
        setIsRescheduling(false);
        return;
      }

      await onReschedule(rescheduleId, newDate, newTime);
      addNotification('success', language === 'en' ? 'Lesson Rescheduled' : 'Урок перенесен', language === 'en' ? 'Your coaching session date was successfully updated.' : 'Дата вашей тренировки была успешно обновлена.');
      setRescheduleId(null);
    } catch (err) {
      addNotification('error', 'Update Failed', language === 'en' ? 'Failed to update lesson schedule.' : 'Не удалось обновить расписание урока.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCancelClick = (booking: Booking) => {
    const confirmationText = language === 'en' 
      ? `Are you sure you want to request cancellation for your lesson with ${booking.instructorName}? This request will be sent to the administrator for approval.`
      : `Вы уверены, что хотите запросить отмену урока с ${booking.instructorName}? Этот запрос будет отправлен администратору на согласование.`;

    setCancelReason('');
    setConfirmModal({
      message: confirmationText,
      showReasonInput: true,
      onConfirm: async (reason?: string) => {
        try {
          await onCancel(booking.id, reason);
          addNotification(
            'success', 
            language === 'en' ? 'Cancellation Requested' : 'Запрос на отмену отправлен', 
            language === 'en' 
              ? `Your cancellation request was sent to the administrator for approval.`
              : `Ваш запрос на отмену занятия был отправлен администратору на согласование.`
          );
        } catch (err) {
          addNotification('error', 'Request Failed', language === 'en' ? 'Failed to request cancellation.' : 'Не удалось отправить запрос на отмену.');
        }
      }
    });
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewBooking) return;

    if (!reviewComment.trim()) {
      addNotification('warning', 'Review Empty', language === 'en' ? 'Please provide feedback comments.' : 'Пожалуйста, напишите отзыв.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      await onAddReview({
        instructorId: reviewBooking.instructorId,
        rating: reviewRating,
        comment: reviewComment.trim(),
        bookingId: reviewBooking.id
      });
      addNotification('success', language === 'en' ? 'Review Shared' : 'Отзыв отправлен', language === 'en' ? 'Thank you for rating your instructor!' : 'Спасибо за вашу оценку работы инструктора!');
      setReviewBooking(null);
      setReviewComment('');
      setReviewRating(5);
    } catch (err) {
      addNotification('error', 'Review Failed', language === 'en' ? 'Failed to post review to Firestore.' : 'Не удалось сохранить отзыв.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAvatar(true);
  };

  const handleDragLeave = () => {
    setIsDraggingAvatar(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAvatar(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processAndUploadFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processAndUploadFile(file);
    }
  };

  const processAndUploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addNotification('error', language === 'en' ? 'Invalid File' : 'Неверный файл', language === 'en' ? 'Please select an image file.' : 'Пожалуйста, выберите изображение.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const optimizedBase64 = await optimizeProfileImage(file);
      if (onUpdateProfile) {
        await onUpdateProfile({ avatarUrl: optimizedBase64 });
        addNotification(
          'success',
          language === 'en' ? 'Profile Photo Changed' : 'Фото профиля изменено',
          language === 'en' ? 'Your profile image has been compressed and updated.' : 'Ваше изображение было сжато и успешно обновлено.'
        );
      }
    } catch (err: any) {
      console.error(err);
      addNotification(
        'error',
        language === 'en' ? 'Upload Failed' : 'Ошибка загрузки',
        language === 'en' ? 'Could not optimize profile image.' : 'Не удалось обработать и сохранить изображение.'
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  const getStatusLabelTranslated = (status: string) => {
    if (language === 'ru') {
      switch (status) {
        case 'confirmed': return 'Подтверждено';
        case 'cancelled': return 'Отменено';
        case 'completed': return 'Завершено';
        case 'pending': return 'Ожидает';
        case 'pending_cancellation': return 'Ожидает отмены';
        default: return status;
      }
    }
    switch (status) {
      case 'pending_cancellation': return 'Pending Cancellation';
      default: return status;
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 animate-fade-in">
      {/* Profile Info Left Panel */}
      <div className="lg:col-span-4 border border-[var(--border)] p-6 flex flex-col justify-between space-y-6 self-start bg-transparent">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            {/* Interactive Drag & Drop Avatar */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative w-16 h-16 rounded-none border bg-transparent overflow-hidden shrink-0 group cursor-pointer transition-all duration-300 ${
                isDraggingAvatar 
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 scale-105' 
                  : 'border-[var(--border)] hover:border-[var(--ink)]'
              }`}
              title={language === 'en' ? "Drag & drop or click to change profile photo" : "Перетащите сюда или нажмите для смены фото"}
            >
              {isUploadingAvatar ? (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center z-10">
                  <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
              <img src={userProfile.avatarUrl} alt={userProfile.displayName} className="w-full h-full object-cover" />
              
              {/* Camera Icon Badge */}
              <div className="absolute bottom-0 right-0 bg-[var(--ink)] p-1 rounded-none text-[var(--bg)] shadow-md border border-[var(--border)] group-hover:scale-110 transition-transform z-20">
                <Camera className="w-2.5 h-2.5" />
              </div>
            </div>

            <input 
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <div>
              <h3 className="font-serif text-lg font-light tracking-tight text-[var(--ink)] leading-tight">
                {userProfile.displayName}
              </h3>
              <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1">{userProfile.email}</p>
              <span className="inline-block mt-2 text-[8px] font-mono uppercase tracking-widest text-[var(--ink)] border border-[var(--border)] px-2 py-0.5 bg-black/10">
                {userProfile.role === 'admin' ? `🛡️ ${language === 'en' ? 'Resort Admin' : 'Администратор'}` : `👤 ${language === 'en' ? 'Ski Member' : 'Лыжник'}`}
              </span>
            </div>
          </div>

          <div className="border border-[var(--border)] p-4 flex items-center justify-between bg-black/10">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[var(--ink)]" />
              <div>
                <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{language === 'en' ? 'Wallet Balance' : 'Баланс кошелька'}</span>
                <span className="text-xl font-serif font-light text-[var(--ink)]">${userProfile.balanceUSD}</span>
              </div>
            </div>
            <div className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">Mock USD</div>
          </div>

          {userProfile.phoneNumber && (
            <div className="text-[10px] font-mono text-[var(--ink)] border border-[var(--border)] p-3 flex justify-between uppercase tracking-wider bg-transparent">
              <span className="text-[var(--ink-dim)]">{language === 'en' ? 'Phone' : 'Телефон'}:</span>
              <span className="font-bold">{userProfile.phoneNumber}</span>
            </div>
          )}
        </div>

        <button
          onClick={onSignOut}
          className="w-full py-2 border border-[var(--border)] hover:border-[var(--ink)] hover:bg-black/10 rounded-none text-[10px] font-mono uppercase tracking-widest text-[var(--ink)] transition mt-4 cursor-pointer bg-transparent"
        >
          {language === 'en' ? 'Sign Out of Account' : 'Выйти из аккаунта'}
        </button>
      </div>

      {/* Bookings Right Panel */}
      <div className="lg:col-span-8 border border-[var(--border)] p-6 space-y-5 transition-colors duration-300 bg-transparent">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
          <div>
            <h3 className="text-xl font-serif font-light text-[var(--ink)] tracking-tight">
              {language === 'en' ? 'Your Slopes Calendar' : 'Ваш календарь тренировок'}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1">
              {language === 'en' ? 'Manage scheduled ski and snowboard lessons' : 'Управление забронированными уроками'}
            </p>
          </div>

          {userBookings.some(b => b.status === 'cancelled') && (
            <div className="flex items-center gap-2 border border-[var(--border)] px-3 py-1.5 self-start sm:self-auto bg-black/10">
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideCancelled}
                  onChange={(e) => handleToggleHideCancelled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-[var(--border)] peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-4 peer-checked:after:border-transparent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--ink)] after:rounded-none after:h-3 after:w-3.5 after:transition-all peer-checked:bg-[var(--ink)] peer-checked:after:bg-[var(--bg)]"></div>
                <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {language === 'ru' ? 'Скрыть отмененные' : 'Hide cancelled'}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Review Invitations / Notifications Box */}
        {unreviewedCompletedBookings.length > 0 && (
          <div className="border border-[var(--border)] p-4 space-y-3 bg-indigo-950/20 animate-fade-in">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Bell className="w-4 h-4 text-indigo-400" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-none animate-ping" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-none" />
              </div>
              <h4 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
                {language === 'ru' ? 'Новые уведомления' : 'New Notifications'} ({unreviewedCompletedBookings.length})
              </h4>
            </div>
            <div className="space-y-2">
              {unreviewedCompletedBookings.map((inv) => (
                <div 
                   key={inv.id} 
                   id={`review-invitation-card-${inv.id}`}
                   className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/25 p-3 rounded-none border border-[var(--border)] hover:border-[var(--ink)] transition duration-200"
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={inv.instructorAvatar} 
                      alt={inv.instructorName} 
                      className="w-8.5 h-8.5 rounded-none object-cover shrink-0 border border-[var(--border)] filter grayscale" 
                    />
                    <div>
                      <p className="text-[11px] font-sans text-[var(--ink)] leading-relaxed">
                        {language === 'ru' ? (
                          <>Ваше занятие с инструктором <span className="font-bold">{inv.instructorName}</span> успешно завершилось! Напишите отзыв, чтобы поделиться впечатлениями.</>
                        ) : (
                          <>Your coaching session with <span className="font-bold">{inv.instructorName}</span> has completed! Leave feedback to share your experience.</>
                        )}
                      </p>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block mt-1">
                        {inv.date} • {inv.time}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      id={`notify-review-btn-${inv.id}`}
                      onClick={() => {
                        setReviewBooking(inv);
                        setReviewComment('');
                        setReviewRating(5);
                      }}
                      className="shrink-0 text-[9px] font-mono uppercase tracking-widest bg-[var(--ink)] hover:bg-[var(--ink)]/80 text-[var(--bg)] px-3 py-1.5 rounded-none font-bold cursor-pointer transition"
                    >
                      🌟 {language === 'ru' ? 'Оставить отзыв' : 'Write Review'}
                    </button>
                    {onDismissReview && (
                      <button
                        onClick={() => onDismissReview(inv.id)}
                        className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-black/20 rounded-none transition cursor-pointer"
                        title={language === 'ru' ? 'Скрыть' : 'Hide'}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Calendar Grid (only shown if there are bookings) */}
        {userBookings.length > 0 && (
          <div className="border border-[var(--border)] p-4 rounded-none bg-black/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink)] font-bold flex items-center gap-1.5">
                📅 {language === 'ru' ? 'Интерактивный календарь' : 'Interactive Calendar'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-black/20 rounded-none text-[var(--ink)] transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono uppercase tracking-wider min-w-[100px] text-center text-[var(--ink)]">
                  {language === 'ru' ? MONTHS_RU[month] : MONTHS_EN[month]} {year}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-black/20 rounded-none text-[var(--ink)] transition cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekdays Row */}
            <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] pb-1 border-b border-[var(--border)]">
              {(language === 'ru' ? WEEKDAYS_RU : WEEKDAYS_EN).map(day => (
                <div key={day}>{day}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {daysArray.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-8" />;
                }

                const dateStr = formatDateStr(day);
                const dayBookings = getBookingsOnDate(dateStr);
                const isSelected = selectedDateFilter === dateStr;
                const hasCourse = dayBookings.some(b => b.instructorId.startsWith('course_'));
                const hasLesson = dayBookings.some(b => !b.instructorId.startsWith('course_'));

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => {
                      if (hasCourse || hasLesson) {
                        setSelectedDateFilter(isSelected ? null : dateStr);
                      }
                    }}
                    className={`h-9 flex flex-col items-center justify-center rounded-none transition text-[10px] font-mono relative cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--ink)] text-[var(--bg)] font-bold' // Selected day
                        : hasCourse
                        ? 'border border-violet-500 text-violet-200 bg-violet-950/40 font-bold hover:bg-violet-950/60 cursor-pointer' // Course day
                        : hasLesson
                        ? 'border border-[var(--ink)] text-[var(--ink)] bg-black/20 font-bold hover:bg-black/30 cursor-pointer' // Lesson day
                        : 'text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--border)] border border-transparent cursor-default' // Empty day
                    }`}
                  >
                    <span>{day}</span>
                    {hasLesson && !isSelected && (
                      <span className="w-1 h-1 bg-[var(--ink)] rounded-none absolute bottom-1.5" />
                    )}
                    {hasCourse && !isSelected && (
                      <span className="w-1 h-1 bg-violet-400 rounded-none absolute bottom-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Date Filter Notification Badge */}
        {selectedDateFilter && (
          <div className="flex items-center justify-between border border-[var(--border)] bg-black/25 px-3 py-2 rounded-none">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
              {language === 'ru' 
                ? `Показаны тренировки на: ${selectedDateFilter}` 
                : `Showing lessons scheduled for: ${selectedDateFilter}`}
            </span>
            <button
              onClick={() => setSelectedDateFilter(null)}
              className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
            >
              {language === 'ru' ? 'Сбросить фильтр' : 'Show All'}
            </button>
          </div>
        )}

        {userBookings.length === 0 ? (
          <div className="py-16 text-center border border-[var(--border)] bg-black/10">
            <Calendar className="w-8 h-8 text-[var(--ink-dim)] mx-auto mb-3" />
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] leading-relaxed">
              {language === 'en' ? "You haven't scheduled any coaching sessions yet." : "У вас пока нет запланированных тренировок."}
            </p>
            <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] opacity-70 mt-1">
              {language === 'en' ? 'Browse our ski or snowboard instructors above to get started!' : 'Выберите тренера в каталоге ниже, чтобы начать!'}
            </p>
          </div>
        ) : displayedBookings.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-[var(--border)] rounded-none bg-black/10">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
              {selectedDateFilter 
                ? (language === 'ru' ? 'На выбранный день тренировок нет.' : 'No sessions scheduled on this selected date.')
                : (language === 'ru' ? 'Все занятия скрыты настройками фильтрации.' : 'All sessions are hidden by filter settings.')}
            </p>
            {selectedDateFilter ? (
              <button
                onClick={() => setSelectedDateFilter(null)}
                className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 hover:underline mt-2 cursor-pointer"
              >
                {language === 'ru' ? 'Показать все тренировки' : 'Clear filter to see all'}
              </button>
            ) : (
              <button
                onClick={() => handleToggleHideCancelled(false)}
                className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 hover:text-indigo-300 hover:underline mt-2 cursor-pointer"
              >
                {language === 'ru' ? 'Показать отмененные занятия' : 'Show cancelled sessions'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedBookings.map((b) => {

              const isCourse = b.instructorId.startsWith('course_');
              let displayDate = b.date;
              let displayTime = b.time;

              if (isCourse && b.time === 'Group Schedule') {
                const { datePart, timePart } = splitCourseDates(b.date);
                displayDate = datePart;
                displayTime = timePart;
              }

              return (
              <div key={b.id} id={`booking-card-${b.id}`} className={`p-4 rounded-none border flex flex-col md:flex-row lg:flex-col 2xl:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${
                b.instructorId.startsWith('course_')
                  ? 'border-violet-500/40 hover:border-violet-400 bg-violet-950/20'
                  : 'border-[var(--border)] hover:border-[var(--ink)] bg-black/15'
              }`}>
                {/* Instructor name and details */}
                <div className="flex flex-1 items-center gap-4 min-w-0 w-full lg:flex-row lg:items-center 2xl:flex-row 2xl:items-center">
                  <div className="w-16 h-16 rounded-none overflow-hidden shrink-0 border border-[var(--border)]">
                    <img src={b.instructorAvatar} alt={b.instructorName} className="w-full h-full object-cover" />
                  </div>
                  <div className="space-y-1 min-w-0 w-full">
                    <h4 className="text-xs font-serif text-[var(--ink)] flex items-center gap-2 flex-wrap">
                      {b.instructorName}
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] font-normal">• {b.durationHours} {language === 'en' ? 'hr session' : 'ч. тренировки'}</span>
                    </h4>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-0.5">{getDifficultyLabel(b.difficulty)}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink)] border border-[var(--border)] px-2 py-0.5 rounded-none flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {displayDate}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--ink-dim)] border border-[var(--border)] px-2 py-0.5 rounded-none flex items-center gap-1 bg-black/15">
                        <Clock className="w-3 h-3" /> {displayTime}
                      </span>
                    </div>
                    {b.status === 'pending_cancellation' && b.cancellationReason && (
                      <p className="text-[9px] font-mono uppercase tracking-wider text-rose-400 mt-2 bg-rose-950/20 border border-rose-900/40 px-2.5 py-1.5 rounded-none">
                        <span className="font-bold">{language === 'en' ? 'Reason: ' : 'Причина: '}</span>{b.cancellationReason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pricing, status and operations */}
                <div className="flex flex-shrink-0 items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-[var(--border)] flex-wrap">
                  <div className="text-left md:text-right">
                    <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{language === 'en' ? 'TOTAL FEE' : 'ИТОГО К ОПЛАТЕ'}</span>
                    <span className="text-base font-serif font-light text-[var(--ink)]">${b.totalPrice}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 text-[8px] font-mono uppercase tracking-widest border rounded-none font-bold ${
                        b.status === 'confirmed' ? 'border-emerald-600/30 text-emerald-700 bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-950/20' :
                        b.status === 'completed' ? 'border-indigo-600/30 text-indigo-700 bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-400 dark:bg-indigo-950/20' :
                        b.status === 'cancelled' ? 'border-rose-600/30 text-rose-700 bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:bg-rose-950/20' :
                        b.status === 'pending_cancellation' ? 'border-amber-600/30 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:bg-amber-950/20' :
                        'border-amber-600/30 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:bg-amber-950/20'
                      }`}
                    >
                      {getStatusLabelTranslated(b.status)}
                    </span>

                    {/* Export / Sync Options */}
                    {b.status === 'confirmed' && (
                      <div className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded-none border border-[var(--border)]">
                        {/* Google Calendar Link */}
                        <a
                          href={getGoogleCalendarUrl(b)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={language === 'en' ? 'Add to Google Calendar' : 'Добавить в Google Календарь'}
                          className="p-1 hover:bg-black/20 rounded text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        {/* Apple/Outlook Download */}
                        <button
                          type="button"
                          onClick={() => handleDownloadIcs(b)}
                          title={language === 'en' ? 'Download .ics Calendar File' : 'Скачать файл .ics для календаря'}
                          className="p-1 hover:bg-black/20 rounded text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Actions based on Status */}
                    {b.status === 'confirmed' && (
                      <div className="flex items-center gap-1">
                        <button
                          id={`reschedule-btn-${b.id}`}
                          onClick={() => {
                            setRescheduleId(b.id);
                            setNewDate(b.date);
                            setNewTime(b.time);
                          }}
                          title={language === 'en' ? 'Reschedule Session' : 'Перенести'}
                          className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:bg-black/20 rounded-none border border-transparent hover:border-[var(--border)] transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`cancel-btn-${b.id}`}
                          onClick={() => handleCancelClick(b)}
                          title={language === 'en' ? 'Cancel Booking & Refund' : 'Отменить'}
                          className="p-1.5 text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/40 rounded-none border border-transparent transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}


                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>      {/* Reschedule Modal */}
      {rescheduleId && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-sm overflow-hidden animate-scale-up rounded-none">
            <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-black/10">
              <h4 className="font-serif text-sm font-light text-[var(--ink)]">{language === 'en' ? 'Reschedule Coaching' : 'Перенести урок'}</h4>
              <button
                onClick={() => setRescheduleId(null)}
                className="p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleRescheduleSubmit} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">{language === 'en' ? 'NEW DATE' : 'НОВАЯ ДАТА'}</label>
                <input
                  type="date"
                  required
                  min={tomorrowStr}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-none border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">{language === 'en' ? 'NEW TIME SLOT' : 'НОВОЕ ВРЕМЯ'}</label>
                {isLoadingInstructorBookings ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-dim)] py-2.5 px-3 bg-black/10 rounded-none border border-[var(--border)]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--ink)]" />
                    <span>{language === 'en' ? 'Checking availability...' : 'Проверка доступности...'}</span>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-xs text-rose-400 font-mono py-2.5 px-3 bg-rose-955/20 rounded-none border border-rose-900/40">
                    ⚠️ {language === 'en' ? 'No available slots on this date' : 'Нет доступного времени на эту дату'}
                  </div>
                ) : (
                  <select
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-none border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition cursor-pointer"
                  >
                    {availableSlots.map((slot) => (
                      <option key={slot} value={slot} className="bg-[var(--bg)] text-[var(--ink)]">{slot}</option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="submit"
                disabled={isRescheduling || isLoadingInstructorBookings || availableSlots.length === 0}
                className="w-full py-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isRescheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (language === 'en' ? 'Confirm Rescheduling' : 'Подтвердить перенос')}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Review Modal */}
      {reviewBooking && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-[var(--bg)] border border-[var(--border)] shadow-2xl w-full max-w-sm overflow-hidden animate-scale-up rounded-none">
            <div className="flex justify-between items-center p-4 border-b border-[var(--border)] bg-black/10">
              <h4 className="font-serif text-sm font-light text-[var(--ink)]">
                {language === 'en' ? `Review ${reviewBooking.instructorName}` : `Отзыв о ${reviewBooking.instructorName}`}
              </h4>
              <button
                onClick={() => setReviewBooking(null)}
                className="p-1 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] transition cursor-pointer rounded-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleReviewSubmit} className="p-5 space-y-4">
              {/* Star rating selector */}
              <div className="space-y-1.5 text-center">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">{language === 'en' ? 'RATE INSTRUCTOR' : 'ОЦЕНКА ИНСТРУКТОРА'}</label>
                <div className="flex items-center justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1 hover:scale-110 transition cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= reviewRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-200 dark:text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback comment input */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">{language === 'en' ? 'YOUR FEEDBACK' : 'ВАШ ОТЗЫВ'}</label>
                <textarea
                  required
                  rows={3}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder={language === 'en' ? 'Share details about your lesson experience. What did you learn?' : 'Поделитесь впечатлениями о занятии. Чему вы научились?'}
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition h-20 resize-none rounded-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingReview}
                className="w-full py-2.5 border border-[var(--border)] bg-transparent hover:border-[var(--ink)] hover:bg-black/5 disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {isSubmittingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (language === 'en' ? 'Post Instructor Review' : 'Опубликовать отзыв')}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {confirmModal && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-55 p-4 animate-fade-in">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-sm p-6 shadow-2xl relative space-y-4 animate-scale-up transition-colors duration-300">
            <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
              <Shield className="w-4.5 h-4.5 text-[var(--ink-dim)] animate-pulse" />
              {language === 'en' ? 'Confirm Action' : 'Подтверждение'}
            </h4>
            <p className="text-xs text-[var(--ink-dim)] leading-relaxed">
              {confirmModal.message}
            </p>
            {confirmModal.showReasonInput && (
              <div className="space-y-1.5 text-left">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                  {language === 'en' ? 'Reason for cancellation (Required)' : 'Причина отмены (Обязательно)'}
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={language === 'en' ? 'Please explain why you need to cancel this lesson...' : 'Пожалуйста, напишите, почему вы хотите отменить урок...'}
                  rows={3}
                  className="w-full px-3 py-2 text-xs border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none resize-none font-mono"
                  required
                />
              </div>
            )}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmModal(null);
                  setCancelReason('');
                }}
                className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
              >
                {language === 'en' ? 'Cancel' : 'Отмена'}
              </button>
              <button
                type="button"
                disabled={confirmModal.showReasonInput ? !cancelReason.trim() : false}
                onClick={async () => {
                  if (confirmModal.showReasonInput && !cancelReason.trim()) return;
                  const action = confirmModal.onConfirm;
                  const reason = cancelReason;
                  setConfirmModal(null);
                  setCancelReason('');
                  await action(reason);
                }}
                className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
              >
                {language === 'en' ? 'Confirm' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

