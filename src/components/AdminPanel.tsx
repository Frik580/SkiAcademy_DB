import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Instructor, Booking, UserProfile, Course, ErrorLog, OperationType } from '../types';
import { db, doc, deleteDoc, collection, query, orderBy, onSnapshot, handleFirestoreError } from '../lib/firebase';
import { 
  Users, 
  BookOpen, 
  DollarSign, 
  Plus, 
  Trash2, 
  ToggleLeft, 
  ToggleRight, 
  Check, 
  X, 
  Loader2, 
  BookOpenCheck,
  Edit2,
  Shield,
  Search,
  UserPlus,
  UserMinus,
  Calendar,
  Clock,
  Coffee,
  ChevronLeft,
  ChevronRight,
  Lock,
  Upload,
  Camera,
  Settings,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  AlertTriangle
} from 'lucide-react';
import { useNotifications } from './PushNotificationHub';
import { useLanguage, translateInstructorName, translateCourse, parseCourseDates, formatCourseDates, parseDurationHours, splitCourseDates } from '../lib/LanguageContext';
import { BookingChatModal } from './BookingChatModal';

interface AdminPanelProps {
  instructors: Instructor[];
  bookings: Booking[];
  usersList?: UserProfile[];
  deletedCompletedStats?: { revenue: number; count: number };
  currentUserEmail?: string;
  onUpdateUserRole?: (targetUid: string, newRole: 'admin' | 'user') => Promise<void>;
  onAddInstructor: (ins: Instructor) => Promise<void>;
  onUpdateInstructor: (ins: Instructor) => Promise<void>;
  onDeleteInstructor: (id: string) => Promise<void>;
  onConfirmBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onAddUser?: (user: UserProfile) => Promise<void>;
  onUpdateUser?: (user: UserProfile) => Promise<void>;
  onDeleteUser?: (uid: string) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onAddBooking?: (booking: Booking) => Promise<void>;
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  courses?: Course[];
  onAddCourse?: (course: Course) => Promise<void>;
  onUpdateCourse?: (course: Course) => Promise<void>;
  onDeleteCourse?: (courseId: string) => Promise<void>;
}

function optimizeInstructorImage(file: File): Promise<string> {
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
        const MAX_SIZE = 400; // 400x400px is perfect for instructor cards
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

        // Compress to JPEG with 80% quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image source'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

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

function formatDateLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

export const AdminPanel: React.FC<AdminPanelProps> = ({
  instructors,
  bookings: rawBookings,
  usersList = [],
  courses = [],
  deletedCompletedStats = { revenue: 0, count: 0 },
  currentUserEmail = '',
  onUpdateUserRole,
  onAddInstructor,
  onUpdateInstructor,
  onDeleteInstructor,
  onConfirmBooking,
  onCompleteBooking,
  onCancelBooking,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onRescheduleBooking,
  onDeleteBooking,
  onAddBooking,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  filtersEnabled = true,
  onToggleFilters
}) => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();

  // Translate instructorName in bookings list and merge live course details
  const bookings = useMemo(() => {
    return rawBookings.map((b) => {
      const isCourse = b.instructorId.startsWith('course_');
      let name = b.instructorName;
      let avatar = b.instructorAvatar;
      let durationHours = b.durationHours;
      let notes = b.notes;
      let date = b.date;
      let time = b.time;
      let totalPrice = b.totalPrice;

      if (isCourse) {
        const courseId = b.instructorId.substring('course_'.length);
        const liveCourse = (courses || []).find((c) => c.id === courseId);
        if (liveCourse) {
          const translated = translateCourse(liveCourse, language);
          name = language === 'ru' ? `${translated.title} (Групповой курс)` : `${translated.title} (Group Course)`;
          avatar = translated.bgImageUrl || b.instructorAvatar;
          durationHours = parseDurationHours(translated.duration, b.durationHours);
          notes = `${language === 'en' ? 'Group Course enrollment' : 'Запись на групповой курс'}: ${translated.description}`;
          totalPrice = liveCourse.price;
          
          if (translated.dates) {
            const { datePart, timePart } = splitCourseDates(translated.dates);
            date = datePart;
            time = timePart;
          }
        }
      } else {
        name = translateInstructorName(b.instructorName, language);
      }

      return {
        ...b,
        instructorName: name,
        instructorAvatar: avatar,
        durationHours,
        notes,
        date,
        time,
        totalPrice
      };
    });
  }, [rawBookings, courses, language]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIns, setEditingIns] = useState<Instructor | null>(null);

  // Schedule Board states
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeSlotModal, setActiveSlotModal] = useState<{
    instructor: Instructor;
    time: string;
    booking?: Booking;
  } | null>(null);
  const [selectedChatBooking, setSelectedChatBooking] = useState<Booking | null>(null);

  const selectedDate = useMemo(() => formatDateLocalYMD(currentDate), [currentDate]);

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Modal form states
  const [modalTab, setModalTab] = useState<'break' | 'day_off' | 'booking'>('break');
  const [blockDuration, setBlockDuration] = useState(1);
  const [blockNotes, setBlockNotes] = useState('');
  const [selectedClientUid, setSelectedClientUid] = useState('');
  const [bookingDuration, setBookingDuration] = useState(1);
  const [bookingDifficulty, setBookingDifficulty] = useState<'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle'>('beginner');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isSlotActionSubmitting, setIsSlotActionSubmitting] = useState(false);
  const [newMoveDate, setNewMoveDate] = useState('');
  const [newMoveTime, setNewMoveTime] = useState('');

  const currentAdminUser = useMemo(() => {
    if (!currentUserEmail) return null;
    return (usersList || []).find((u) => u.email.toLowerCase() === currentUserEmail.toLowerCase());
  }, [usersList, currentUserEmail]);

  const adminProfile = useMemo(() => {
    return currentAdminUser || {
      uid: 'admin',
      email: currentUserEmail || 'admin@example.com',
      displayName: language === 'en' ? 'Administrator' : 'Администратор',
      role: 'admin',
      avatarUrl: '',
      balanceUSD: 0
    } as UserProfile;
  }, [currentAdminUser, currentUserEmail, language]);

  // Form Fields
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState<'ski' | 'snowboard' | 'both'>('ski');
  const [languages, setLanguages] = useState('English, German');
  const [experienceYears, setExperienceYears] = useState(5);
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [pricePerHour, setPricePerHour] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Course State and Form Fields
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDuration, setCourseDuration] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseDates, setCourseDates] = useState('');
  const [courseTotalSeats, setCourseTotalSeats] = useState(10);
  const [coursePrice, setCoursePrice] = useState(199);
  const [courseBgImageUrl, setCourseBgImageUrl] = useState('');
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);
  const [isUploadingCourseImage, setIsUploadingCourseImage] = useState(false);
  const [isCourseDragOver, setIsCourseDragOver] = useState(false);
  const [courseIsHidden, setCourseIsHidden] = useState(false);
  const [selectedCourseInstructors, setSelectedCourseInstructors] = useState<string[]>([]);

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
        language === 'en' ? 'Invalid File' : 'Неверный файл',
        language === 'en' ? 'Please select an image file.' : 'Пожалуйста, выберите изображение.'
      );
      return;
    }

    setIsUploadingCourseImage(true);
    try {
      const optimizedBase64 = await optimizeCourseImage(file);
      setCourseBgImageUrl(optimizedBase64);
      addNotification(
        'success',
        language === 'en' ? 'Background Image Attached' : 'Фон загружен',
        language === 'en' ? 'Course background image was successfully optimized.' : 'Фоновая картинка курса была успешно оптимизирована.'
      );
    } catch (err) {
      console.error(err);
      addNotification(
        'error',
        language === 'en' ? 'Optimization Failed' : 'Ошибка оптимизации',
        language === 'en' ? 'Failed to process the background image.' : 'Не удалось обработать изображение фона.'
      );
    } finally {
      setIsUploadingCourseImage(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await processAndOptimizeImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processAndOptimizeImage(file);
    }
  };

  const processAndOptimizeImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addNotification(
        'error',
        language === 'en' ? 'Invalid File' : 'Неверный файл',
        language === 'en' ? 'Please select an image file.' : 'Пожалуйста, выберите изображение.'
      );
      return;
    }

    setIsUploadingImage(true);
    try {
      const optimizedBase64 = await optimizeInstructorImage(file);
      setAvatarUrl(optimizedBase64);
      addNotification(
        'success',
        language === 'en' ? 'Photo Attached' : 'Фотография прикреплена',
        language === 'en' ? 'Instructor photo was successfully optimized and loaded.' : 'Фото инструктора было успешно оптимизировано и загружено.'
      );
    } catch (err) {
      console.error(err);
      addNotification(
        'error',
        language === 'en' ? 'Optimization Failed' : 'Ошибка оптимизации',
        language === 'en' ? 'Could not optimize the selected image.' : 'Не удалось обработать выбранное изображение.'
      );
    } finally {
      setIsUploadingImage(false);
    }
  };

  // User/Admin Management States
  const [userSearchText, setUserSearchText] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);

  // Client Management States
  const [clientSearchText, setClientSearchText] = useState('');
  const [showClientAddForm, setShowClientAddForm] = useState(false);
  const [editingClient, setEditingClient] = useState<UserProfile | null>(null);

  // Client Form Fields
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientBalance, setClientBalance] = useState(250);
  const [clientRole, setClientRole] = useState<'user' | 'admin'>('user');
  const [clientIsInstructor, setClientIsInstructor] = useState(false);
  const [clientIsActive, setClientIsActive] = useState(true);
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);

  // Active Bookings Monitor filter states
  const [monitorSearch, setMonitorSearch] = useState('');
  const [monitorStatusFilter, setMonitorStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'pending_cancellation'>('all');
  const [monitorInstructorFilter, setMonitorInstructorFilter] = useState('all');
  const [monitorClientFilter, setMonitorClientFilter] = useState('all');
  const [monitorSortBy, setMonitorSortBy] = useState<'date_desc' | 'date_asc' | 'client_asc' | 'client_desc'>('date_desc');
  const [monitorPage, setMonitorPage] = useState(1);

  useEffect(() => {
    setMonitorPage(1);
  }, [monitorSearch, monitorStatusFilter, monitorInstructorFilter, monitorClientFilter, monitorSortBy]);

  // Error Logs States
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorLogsLoading, setErrorLogsLoading] = useState(true);
  const [logSearch, setLogSearch] = useState('');
  const [logSourceFilter, setLogSourceFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null);

  useEffect(() => {
    setErrorLogsLoading(true);
    const q = query(collection(db, 'error_logs'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const logs: ErrorLog[] = [];
      snapshot.forEach((doc) => {
        logs.push(doc.data() as ErrorLog);
      });
      setErrorLogs(logs);
      setErrorLogsLoading(false);
    }, (error) => {
      console.error('Error fetching logs:', error);
      setErrorLogsLoading(false);
    });

    return () => unsub();
  }, []);

  const handleDeleteLog = async (logId: string) => {
    try {
      await deleteDoc(doc(db, 'error_logs', logId));
      addNotification('success', language === 'en' ? 'Log Deleted' : 'Лог удален', language === 'en' ? 'The error log has been removed.' : 'Запись об ошибке удалена.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `error_logs/${logId}`);
    }
  };

  const handleClearAllLogs = async () => {
    const confirmMsg = language === 'en'
      ? 'Are you sure you want to clear all error logs?'
      : 'Вы уверены, что хотите удалить все логи ошибок?';

    setConfirmModal({
      message: confirmMsg,
      onConfirm: async () => {
        try {
          const deletePromises = errorLogs.map(log => deleteDoc(doc(db, 'error_logs', log.id)));
          await Promise.all(deletePromises);
          addNotification('success', language === 'en' ? 'Logs Cleared' : 'Логи очищены', language === 'en' ? 'All error logs have been deleted.' : 'Все логи ошибок успешно удалены.');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'error_logs');
        }
      }
    });
  };

  const filteredLogs = useMemo(() => {
    return errorLogs.filter(log => {
      if (logSourceFilter !== 'all' && log.source !== logSourceFilter) {
        return false;
      }
      if (!logSearch) return true;
      const search = logSearch.toLowerCase();
      return (
        (log.message || '').toLowerCase().includes(search) ||
        (log.stack || '').toLowerCase().includes(search) ||
        (log.userEmail || '').toLowerCase().includes(search) ||
        (log.url || '').toLowerCase().includes(search)
      );
    });
  }, [errorLogs, logSearch, logSourceFilter]);

  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim()) {
      addNotification('warning', 'Missing Details', language === 'en' ? 'Please enter name and email.' : 'Пожалуйста, укажите имя и email.');
      return;
    }

    setIsSubmittingClient(true);

    const uId = editingClient ? editingClient.uid : `client_${Math.random().toString(36).substring(2, 9)}`;
    const defaultAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(clientName.trim().replace(/\s+/g, '_').toLowerCase())}`;

    const wasInstructor = editingClient ? !!editingClient.isInstructor : false;
    const isNowInstructor = clientIsInstructor;
    const oldInstructorId = editingClient?.instructorId || '';
 
    // Если статус инструктора активирован, убедимся, что у него есть ID.
    // Если ID нет, сгенерируем новый.
    const finalInstructorId = isNowInstructor
      ? (oldInstructorId || `ins_${uId}`)
      : ''; 
    
    const baseData = {
      displayName: (clientName || '').trim(),
      email: (clientEmail || '').trim().toLowerCase(),
      phoneNumber: (clientPhone || '').trim() || '',
      isClientActive: clientIsActive,
      balanceUSD: Number(clientBalance),
      role: clientRole,
      isInstructor: clientIsInstructor,
      instructorId: finalInstructorId,
    };

    const clientData: UserProfile = editingClient ? {
      ...editingClient,
      ...baseData
    } : {
      ...baseData,
      uid: uId,
      avatarUrl: defaultAvatar,
    };

    try {
      // Логика для создания/обновления инструктора при изменении статуса
      if (isNowInstructor && !wasInstructor) {
        // Статус инструктора был только что присвоен
        const exists = instructors.some(ins => ins.id === finalInstructorId);
        if (!exists) {
          const newIns: Instructor = {
            id: finalInstructorId,
            name: (clientName || '').trim(),
            specialty: 'both',
            rating: editingClient?.instructorId ? (instructors.find(i => i.id === editingClient.instructorId)?.rating || 0) : 0,
            reviewsCount: 0,
            languages: [language === 'en' ? 'English' : 'Русский'],
            experienceYears: 1,
            bio: language === 'en' 
              ? `Professional ski and snowboard instructor, certified coach.` 
              : `Профессиональный инструктор по лыжам и сноуборду, сертифицированный тренер.`,
            pricePerHour: 50,
            isAvailable: true,
            avatarUrl: clientData.avatarUrl
          };
          await onAddInstructor(newIns);
        } else {
          const existingIns = instructors.find(ins => ins.id === finalInstructorId);
          if (existingIns && !existingIns.isAvailable) { await onUpdateInstructor({ ...existingIns, isAvailable: true, name: (clientName || '').trim(), avatarUrl: clientData.avatarUrl }); }
        }
      } else if (wasInstructor && !isNowInstructor) {
        // Статус инструктора был снят, делаем его неактивным
        const existingIns = instructors.find(ins => ins.id === oldInstructorId);
        if (existingIns) {
          await onUpdateInstructor({ ...existingIns, isAvailable: false });
        }
      }

      if (editingClient) {
        if (onUpdateUser) {
          await onUpdateUser(clientData);
        }
        setEditingClient(null);
      } else {
        if (onAddUser) {
          await onAddUser(clientData);
        }
      }

      // Reset fields
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setClientBalance(250);
      setClientRole('user');
      setClientIsInstructor(false);
      setClientIsActive(true);
      setShowClientAddForm(false);
    } catch (err) {
      addNotification('error', 'Error', language === 'en' ? 'Failed to save client profile.' : 'Не удалось сохранить профиль клиента.');
    } finally {
      setIsSubmittingClient(false);
    }
  };

  // Course management action handlers
  const handleCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim() || !courseDuration.trim() || !courseDates.trim() || !courseDescription.trim()) {
      addNotification('warning', language === 'en' ? 'Missing Details' : 'Не все поля заполнены', language === 'en' ? 'Please fill in all course details.' : 'Пожалуйста, заполните все данные о курсе.');
      return;
    }

    if (selectedCourseInstructors.length < 1 || selectedCourseInstructors.length > 2) {
      addNotification(
        'warning', 
        language === 'en' ? 'Instructors Required' : 'Инструкторы обязательны', 
        language === 'en' 
          ? 'Please select 1 or 2 instructors for this course.' 
          : 'Пожалуйста, выберите 1 или 2 инструкторов для этого курса.'
      );
      return;
    }

    setIsSubmittingCourse(true);

    const courseId = editingCourse ? editingCourse.id : `course_${Date.now()}`;
    const courseData: Course = {
      id: courseId,
      title: courseTitle.trim(),
      duration: courseDuration.trim(),
      description: courseDescription.trim(),
      dates: courseDates.trim(),
      totalSeats: Number(courseTotalSeats),
      availableSeats: editingCourse 
        ? Math.min(Number(courseTotalSeats), Number(courseTotalSeats) - (editingCourse.totalSeats - editingCourse.availableSeats)) 
        : Number(courseTotalSeats),
      price: Number(coursePrice),
      bgImageUrl: courseBgImageUrl || 'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800',
      isHidden: courseIsHidden,
      instructorIds: selectedCourseInstructors,
      order: editingCourse && editingCourse.order !== undefined ? editingCourse.order : courses.length
    };

    try {
      if (editingCourse) {
        if (onUpdateCourse) {
          await onUpdateCourse(courseData);
        }
        setEditingCourse(null);
        addNotification('success', language === 'en' ? 'Success' : 'Успешно', language === 'en' ? 'Course updated successfully.' : 'Курс успешно обновлен.');
      } else {
        if (onAddCourse) {
          await onAddCourse(courseData);
        }
        addNotification('success', language === 'en' ? 'Success' : 'Успешно', language === 'en' ? 'Course added successfully.' : 'Курс успешно добавлен.');
      }

      resetCourseForm();
    } catch (err) {
      addNotification('error', language === 'en' ? 'Error' : 'Ошибка', language === 'en' ? 'Failed to save course.' : 'Не удалось сохранить курс.');
    } finally {
      setIsSubmittingCourse(false);
    }
  };

  const startEditCourse = (course: Course) => {
    setEditingCourse(course);
    setCourseTitle(course.title);
    setCourseDuration(course.duration);
    setCourseDescription(course.description);
    setCourseDates(course.dates);
    setCourseTotalSeats(course.totalSeats);
    setCoursePrice(course.price);
    setCourseBgImageUrl(course.bgImageUrl);
    setCourseIsHidden(!!course.isHidden);
    setSelectedCourseInstructors(course.instructorIds || []);
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
    setCourseDates('');
    setCourseTotalSeats(10);
    setCoursePrice(199);
    setCourseBgImageUrl('');
    setCourseIsHidden(false);
    setSelectedCourseInstructors([]);
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
          language === 'en' ? 'Order Changed' : 'Порядок изменен',
          language === 'en' ? 'Course order updated successfully.' : 'Порядок курсов успешно изменен.'
        );
      }
    } catch (err) {
      addNotification(
        'error',
        language === 'en' ? 'Error' : 'Ошибка',
        language === 'en' ? 'Failed to update course order.' : 'Не удалось изменить порядок курсов.'
      );
    }
  };

  const handleDeleteCourseClick = (course: Course) => {
    const confirmMsg = language === 'en'
      ? `Are you absolutely sure you want to delete course "${course.title}"?`
      : `Вы абсолютно уверены, что хотите удалить курс «${course.title}»?`;

    setConfirmModal({
      message: confirmMsg,
      onConfirm: async () => {
        try {
          if (onDeleteCourse) {
            await onDeleteCourse(course.id);
            addNotification('success', language === 'en' ? 'Deleted' : 'Удалено', language === 'en' ? 'Course deleted successfully.' : 'Курс успешно удален.');
          }
        } catch (err) {
          addNotification('error', language === 'en' ? 'Error' : 'Ошибка', language === 'en' ? 'Failed to delete course.' : 'Не удалось удалить курс.');
        }
      }
    });
  };

  const startEditClient = (u: UserProfile) => {
    setEditingClient(u);
    setClientName(u.displayName);
    setClientEmail(u.email);
    setClientPhone(u.phoneNumber || '');
    setClientBalance(u.balanceUSD);
    setClientRole(u.role);
    setClientIsInstructor(u.isInstructor || false);
    setClientIsActive(u.isClientActive === undefined ? true : u.isClientActive);
    setShowClientAddForm(true);
  };

  const handleDeleteClient = (u: UserProfile) => {
    const confirmMsg = language === 'en'
      ? `Are you absolutely sure you want to delete client ${u.displayName} (${u.email})?`
      : `Вы абсолютно уверены, что хотите удалить клиента ${u.displayName} (${u.email})?`;

    setConfirmModal({
      message: confirmMsg,
      onConfirm: async () => {
        try {
          if (u.isInstructor && u.instructorId) {
            await onDeleteInstructor(u.instructorId);
          }
          if (onDeleteUser) {
            await onDeleteUser(u.uid);
          }
        } catch (err) {
          addNotification('error', language === 'en' ? 'Deletion Failed' : 'Ошибка удаления', language === 'en' ? 'Failed to remove client.' : 'Не удалось удалить клиента.');
        }
      }
    });
  };

  const isSuperAdmin = currentUserEmail.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';

  // Calculations
  const totalRevenue = bookings
    .filter(b => (b.status === 'confirmed' || b.status === 'completed') && !b.userId?.startsWith('system_block_') && !b.isDeleted)
    .reduce((sum, b) => sum + b.totalPrice, 0) + (deletedCompletedStats?.revenue || 0);

  const activeBookings = bookings.filter(b => b.status === 'confirmed' && !b.userId?.startsWith('system_block_') && !b.isDeleted).length;
  const completedBookings = bookings.filter(b => b.status === 'completed' && !b.userId?.startsWith('system_block_') && !b.isDeleted).length + (deletedCompletedStats?.count || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !bio || !pricePerHour) {
      addNotification('warning', language === 'en' ? 'Missing Details' : 'Не все поля заполнены', language === 'en' ? 'Please complete the instructor profile form.' : 'Пожалуйста, заполните всю форму профиля инструктора.');
      return;
    }

    setIsSubmitting(true);
    const languagesArr = languages.split(',').map(l => l.trim()).filter(Boolean);
    const defaultAvatar = `https://images.unsplash.com/photo-${Math.random() > 0.5 ? '1534528741775-53994a69daeb' : '1506794778202-cad84cf45f1d'}?auto=format&fit=crop&q=80&w=400`;

    const insData: Instructor = {
      id: editingIns ? editingIns.id : `ins_${Math.random().toString(36).substring(2, 9)}`,
      name,
      specialty,
      rating: editingIns ? editingIns.rating : 5.0,
      reviewsCount: editingIns ? editingIns.reviewsCount : 0,
      languages: languagesArr,
      experienceYears: Number(experienceYears),
      bio,
      avatarUrl: avatarUrl.trim() || defaultAvatar,
      pricePerHour: Number(pricePerHour),
      isAvailable: editingIns ? editingIns.isAvailable : true
    };

    try {
      if (editingIns) {
        await onUpdateInstructor(insData);
        addNotification('success', language === 'en' ? 'Coach Profile Updated' : 'Профиль тренера обновлен', language === 'en' ? `${name}'s information has been fully synced.` : `Информация о ${name} успешно синхронизирована.`);
        setEditingIns(null);
      } else {
        await onAddInstructor(insData);
        addNotification('success', language === 'en' ? 'New Coach Added' : 'Добавлен новый тренер', language === 'en' ? `${name} joined Carve Academy team!` : `${name} добавлен в команду Академии Карвинга!`);
      }
      
      // Reset fields
      setName('');
      setBio('');
      setAvatarUrl('');
      setLanguages('English, German');
      setPricePerHour(50);
      setExperienceYears(5);
      setShowAddForm(false);
    } catch (err) {
      addNotification('error', 'Sync Failed', language === 'en' ? 'An error occurred while updating instructors directory.' : 'Произошла ошибка при обновлении каталога.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (ins: Instructor) => {
    setEditingIns(ins);
    setName(ins.name);
    setSpecialty(ins.specialty);
    setLanguages(ins.languages.join(', '));
    setExperienceYears(ins.experienceYears);
    setBio(ins.bio);
    setAvatarUrl(ins.avatarUrl);
    setPricePerHour(ins.pricePerHour);
    setShowAddForm(true);
  };

  const handleToggleAvailability = async (ins: Instructor) => {
    if (ins.isAvailable) {
      const activeBookings = bookings.filter(
        (b) => b.instructorId === ins.id && (b.status === 'pending' || b.status === 'confirmed')
      );
      if (activeBookings.length > 0) {
        const bookingsListStr = activeBookings
          .map((b) => `• ${b.date} @ ${b.time} (${b.durationHours}h)`)
          .join('\n');
        const bookingsListStrRu = activeBookings
          .map((b) => `• ${b.date} в ${b.time} (${b.durationHours} ч.)`)
          .join('\n');

        addNotification(
          'error',
          language === 'en' ? 'Cannot Make Unavailable' : 'Невозможно сделать недоступным',
          language === 'en'
            ? `Instructor ${ins.name} has ${activeBookings.length} active booking(s). Please reschedule or cancel these lessons before disabling the instructor:\n\n${bookingsListStr}`
            : `У инструктора ${ins.name} есть активные занятия (${activeBookings.length} шт.). Пожалуйста, перенесите или отмените их перед тем, как отключить доступность:\n\n${bookingsListStrRu}`
        );
        return;
      }
    }

    const updated = { ...ins, isAvailable: !ins.isAvailable };
    try {
      await onUpdateInstructor(updated);
      const isAvailStr = updated.isAvailable ? (language === 'en' ? 'available' : 'доступен') : (language === 'en' ? 'unavailable' : 'недоступен');
      addNotification('info', language === 'en' ? 'Status Updated' : 'Статус обновлен', `${ins.name} ${language === 'en' ? 'is now' : 'теперь'} ${isAvailStr}.`);
    } catch (e) {
      addNotification('error', language === 'en' ? 'Status Toggle Failed' : 'Ошибка изменения статуса', language === 'en' ? 'Could not sync availability status.' : 'Не удалось синхронизировать статус.');
    }
  };

  const handleDeleteCoach = (ins: Instructor) => {
    const confirmMsg = language === 'en' 
      ? `Are you absolutely sure you want to remove ${ins.name} from Carve Academy roster?`
      : `Вы абсолютно уверены, что хотите удалить ${ins.name} из команды Академии Карвинга?`;

    setConfirmModal({
      message: confirmMsg,
      onConfirm: async () => {
        try {
          await onDeleteInstructor(ins.id);
          addNotification('success', language === 'en' ? 'Instructor Deleted' : 'Инструктор удален', language === 'en' ? `${ins.name} removed successfully.` : `${ins.name} успешно удален.`);
        } catch (err) {
          addNotification('error', 'Deletion Failed', language === 'en' ? 'Failed to remove instructor.' : 'Не удалось удалить инструктора.');
        }
      }
    });
  };

  // Schedule Helper methods
  const hourToMinutes = (hStr: string): number => {
    const [h, m] = hStr.split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const hasOverlap = (
    instructorId: string,
    date: string,
    time: string,
    durationHours: number,
    excludeBookingId?: string
  ): boolean => {
    const startMin = hourToMinutes(time);
    const endMin = startMin + durationHours * 60;

    const hasBookingOverlap = bookings.some((b) => {
      if (b.instructorId !== instructorId) return false;
      if (b.date !== date) return false;
      if (b.status === 'cancelled') return false;
      if (excludeBookingId && b.id === excludeBookingId) return false;

      const bStart = hourToMinutes(b.time);
      const bEnd = bStart + b.durationHours * 60;

      return startMin < bEnd && endMin > bStart;
    });

    if (hasBookingOverlap) return true;

    // Check group courses overlap
    const hasCourseOverlap = (courses || []).some((course) => {
      if (!course.instructorIds || !course.instructorIds.includes(instructorId)) return false;

      const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(course.dates);
      const startStr = formatDateLocalYMD(cStart);
      const endStr = formatDateLocalYMD(cEnd);

      if (date < startStr || date > endStr) return false;

      const cStartMin = hourToMinutes(cStartTime);
      const cEndMin = hourToMinutes(cEndTime);

      return startMin < cEndMin && endMin > cStartMin;
    });

    return hasCourseOverlap;
  };

  const availableMoveTimeSlots = useMemo(() => {
    if (!activeSlotModal?.booking) return [];
    const duration = activeSlotModal.booking.durationHours;
    const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

    return timeSlots.filter((slot) => {
      const start = hourToMinutes(slot);
      const end = start + duration * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00 (19 * 60 = 1140)

      return !hasOverlap(
        activeSlotModal.instructor.id,
        newMoveDate,
        slot,
        duration,
        activeSlotModal.booking?.id
      );
    });
  }, [activeSlotModal, newMoveDate, bookings]);

  useEffect(() => {
    if (activeSlotModal?.booking && availableMoveTimeSlots.length > 0) {
      if (!availableMoveTimeSlots.includes(newMoveTime)) {
        setNewMoveTime(availableMoveTimeSlots[0]);
      }
    }
  }, [availableMoveTimeSlots, newMoveTime, activeSlotModal]);

  const availableBreakDurations = useMemo(() => {
    if (!activeSlotModal || activeSlotModal.booking) return [];
    const maxDurations = [1, 2, 3, 4];
    const start = hourToMinutes(activeSlotModal.time);
    
    return maxDurations.filter((d) => {
      const end = start + d * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00 (19 * 60 = 1140)

      return !hasOverlap(
        activeSlotModal.instructor.id,
        selectedDate,
        activeSlotModal.time,
        d
      );
    });
  }, [activeSlotModal, selectedDate, bookings]);

  const availableBookingDurations = useMemo(() => {
    if (!activeSlotModal || activeSlotModal.booking) return [];
    const maxDurations = [1, 2, 3, 4];
    const start = hourToMinutes(activeSlotModal.time);
    
    return maxDurations.filter((d) => {
      const end = start + d * 60;
      if (end > 1140) return false; // Exceeds closing time 19:00 (19 * 60 = 1140)

      return !hasOverlap(
        activeSlotModal.instructor.id,
        selectedDate,
        activeSlotModal.time,
        d
      );
    });
  }, [activeSlotModal, selectedDate, bookings]);

  useEffect(() => {
    if (activeSlotModal && !activeSlotModal.booking) {
      if (modalTab === 'break' && availableBreakDurations.length > 0 && !availableBreakDurations.includes(blockDuration)) {
        setBlockDuration(availableBreakDurations[0]);
      } else if (modalTab === 'booking' && availableBookingDurations.length > 0 && !availableBookingDurations.includes(bookingDuration)) {
        setBookingDuration(availableBookingDurations[0]);
      }
    }
  }, [availableBreakDurations, availableBookingDurations, modalTab, activeSlotModal]);

  const adjustDate = (days: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + (days * 7));
      } else {
        newDate.setDate(newDate.getDate() + days);
      }
      return newDate;
    });
  };

  const handleOpenSlotAction = (ins: Instructor, slotTime: string, existingB?: Booking) => {
    setActiveSlotModal({
      instructor: ins,
      time: slotTime,
      booking: existingB
    });
    setModalTab('break');
    setBlockDuration(1);
    setBlockNotes('');
    setSelectedClientUid(usersList[0]?.uid || '');
    setBookingDuration(1);
    setBookingDifficulty('beginner');
    setBookingNotes('');
    if (existingB) {
      setNewMoveDate(existingB.date);
      setNewMoveTime(existingB.time);
    } else {
      setNewMoveDate(selectedDate);
      setNewMoveTime(slotTime);
    }
  };

  const handleSlotActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSlotModal || !onAddBooking) return;

    setIsSlotActionSubmitting(true);
    try {
      if (modalTab === 'break') {
        if (hasOverlap(activeSlotModal.instructor.id, selectedDate, activeSlotModal.time, blockDuration)) {
          addNotification(
            'error',
            language === 'en' ? 'Conflict Detected' : 'Обнаружен конфликт',
            language === 'en'
              ? 'The proposed break overlaps with an existing lesson or schedule block.'
              : 'Предлагаемый перерыв пересекается с существующим уроком или блоком расписания.'
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBlock: Booking = {
          id: `block_${Math.random().toString(36).substring(2, 9)}`,
          userId: 'system_block_break',
          instructorId: activeSlotModal.instructor.id,
          instructorName: activeSlotModal.instructor.name,
          instructorAvatar: activeSlotModal.instructor.avatarUrl,
          date: selectedDate,
          time: activeSlotModal.time,
          durationHours: blockDuration,
          totalPrice: 0,
          status: 'confirmed',
          difficulty: 'beginner',
          notes: blockNotes.trim() || (language === 'en' ? 'Break' : 'Перерыв')
        };
        await onAddBooking(newBlock);
        addNotification(
          'success',
          language === 'en' ? 'Break Added' : 'Перерыв установлен',
          language === 'en'
            ? `Break scheduled for ${activeSlotModal.instructor.name} at ${activeSlotModal.time}.`
            : `Перерыв для ${activeSlotModal.instructor.name} запланирован на ${activeSlotModal.time}.`
        );
      } else if (modalTab === 'day_off') {
        if (hasOverlap(activeSlotModal.instructor.id, selectedDate, '08:00', 11)) {
          addNotification(
            'error',
            language === 'en' ? 'Conflict Detected' : 'Обнаружен конфликт',
            language === 'en'
              ? 'This instructor already has scheduled breaks or lessons on this day.'
              : 'У этого инструктора уже запланированы занятия или перерывы на этот день.'
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBlock: Booking = {
          id: `block_${Math.random().toString(36).substring(2, 9)}`,
          userId: 'system_block_day_off',
          instructorId: activeSlotModal.instructor.id,
          instructorName: activeSlotModal.instructor.name,
          instructorAvatar: activeSlotModal.instructor.avatarUrl,
          date: selectedDate,
          time: '08:00',
          durationHours: 11, // covers 08:00 to 19:00
          totalPrice: 0,
          status: 'confirmed',
          difficulty: 'beginner',
          notes: language === 'en' ? 'Day Off' : 'Выходной'
        };
        await onAddBooking(newBlock);
        addNotification(
          'success',
          language === 'en' ? 'Day Off Set' : 'Выходной день установлен',
          language === 'en'
            ? `${activeSlotModal.instructor.name} has a day off on ${selectedDate}.`
            : `Для ${activeSlotModal.instructor.name} установлен выходной на ${selectedDate}.`
        );
      } else if (modalTab === 'booking') {
        if (!activeSlotModal.instructor.isAvailable) {
          addNotification(
            'error',
            language === 'en' ? 'Instructor Unavailable' : 'Инструктор недоступен',
            language === 'en'
              ? `${activeSlotModal.instructor.name} is currently set as unavailable and cannot receive new bookings.`
              : `${activeSlotModal.instructor.name} в данный момент отключен(а) из доступных и не может принимать новые записи.`
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        if (!selectedClientUid) {
          addNotification('warning', 'Missing Client', language === 'en' ? 'Please select a client.' : 'Пожалуйста, выберите клиента.');
          setIsSlotActionSubmitting(false);
          return;
        }
        if (hasOverlap(activeSlotModal.instructor.id, selectedDate, activeSlotModal.time, bookingDuration)) {
          addNotification(
            'error',
            language === 'en' ? 'Conflict Detected' : 'Обнаружен конфликт',
            language === 'en'
              ? 'The proposed lesson overlaps with an existing schedule block or lesson.'
              : 'Предлагаемое занятие пересекается с существующим уроком или блоком расписания.'
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const matchedClient = usersList.find(u => u.uid === selectedClientUid);
        const bookingPrice = activeSlotModal.instructor.pricePerHour * bookingDuration;

        if (matchedClient && matchedClient.balanceUSD < bookingPrice) {
          addNotification(
            'error',
            language === 'en' ? 'Insufficient Funds' : 'Недостаточно средств',
            language === 'en'
              ? `Client ${matchedClient.displayName} only has $${matchedClient.balanceUSD}, but this lesson costs $${bookingPrice}.`
              : `У клиента ${matchedClient.displayName} на балансе всего $${matchedClient.balanceUSD}, а стоимость занятия — $${bookingPrice}.`
          );
          setIsSlotActionSubmitting(false);
          return;
        }

        const newBooking: Booking = {
          id: `booking_${Math.random().toString(36).substring(2, 9)}`,
          userId: selectedClientUid,
          instructorId: activeSlotModal.instructor.id,
          instructorName: activeSlotModal.instructor.name,
          instructorAvatar: activeSlotModal.instructor.avatarUrl,
          date: selectedDate,
          time: activeSlotModal.time,
          durationHours: bookingDuration,
          totalPrice: bookingPrice,
          status: 'confirmed',
          difficulty: bookingDifficulty,
          notes: bookingNotes.trim() || ""
        };
        await onAddBooking(newBooking);
        addNotification(
          'success',
          language === 'en' ? 'Manual Booking Added' : 'Запись создана вручную',
          language === 'en'
            ? `Booked ${matchedClient?.displayName || 'Client'} with ${activeSlotModal.instructor.name}.`
            : `Записали ${matchedClient?.displayName || 'Клиента'} к ${activeSlotModal.instructor.name}.`
        );
      }
      setActiveSlotModal(null);
    } catch (err) {
      addNotification('error', 'Action Failed', language === 'en' ? 'Failed to update instructor schedule.' : 'Не удалось обновить расписание инструктора.');
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  const handleSlotMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSlotModal?.booking || !onRescheduleBooking) return;

    setIsSlotActionSubmitting(true);
    try {
      if (hasOverlap(
        activeSlotModal.instructor.id,
        newMoveDate,
        newMoveTime,
        activeSlotModal.booking.durationHours,
        activeSlotModal.booking.id
      )) {
        addNotification(
          'error',
          language === 'en' ? 'Conflict Detected' : 'Обнаружен конфликт',
          language === 'en'
            ? 'The rescheduled time overlaps with an existing schedule block or lesson.'
            : 'Время переноса пересекается с существующим уроком или блоком расписания.'
        );
        setIsSlotActionSubmitting(false);
        return;
      }

      await onRescheduleBooking(activeSlotModal.booking.id, newMoveDate, newMoveTime);
      addNotification(
        'success',
        language === 'en' ? 'Schedule Updated' : 'Занятие перенесено',
        language === 'en' ? 'The session has been rescheduled successfully.' : 'Занятие успешно перенесено.'
      );
      setActiveSlotModal(null);
    } catch (err) {
      addNotification('error', 'Update Failed', language === 'en' ? 'Failed to move session.' : 'Не удалось перенести занятие.');
    } finally {
      setIsSlotActionSubmitting(false);
    }
  };

  const handleSlotDeleteClick = (id: string) => {
    const confirmMsg = language === 'en'
      ? 'Are you absolutely sure you want to remove this schedule block?'
      : 'Вы абсолютно уверены, что хотите удалить этот блок расписания?';

    setConfirmModal({
      message: confirmMsg,
      onConfirm: async () => {
        try {
          if (onDeleteBooking) {
            await onDeleteBooking(id);
          } else {
            await onCancelBooking(id);
          }
          addNotification(
            'success',
            language === 'en' ? 'Block Removed' : 'Блок удален',
            language === 'en' ? 'The session or break has been removed.' : 'Занятие или перерыв успешно удалены.'
          );
          setActiveSlotModal(null);
        } catch (err) {
          addNotification('error', 'Error', language === 'en' ? 'Failed to remove schedule block.' : 'Не удалось удалить блок расписания.');
        }
      }
    });
  };

  // Render booking element
  const renderBookingCell = (b: Booking, ins: Instructor) => {
    const client = usersList.find((u) => u.uid === b.userId);

    if (b.userId === 'system_block_day_off') {
      return (
        <div className="relative group/cell h-11 bg-slate-100/50 dark:bg-slate-800/15 border border-slate-300/40 dark:border-slate-800/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-slate-650" />
            <span className="truncate">{language === 'en' ? 'Day Off' : 'Выходной'}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className="text-slate-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
            title={language === 'en' ? 'Cancel Day Off' : 'Отменить выходной'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    if (b.userId === 'system_block_break') {
      return (
        <div className="relative group/cell h-11 bg-amber-50/60 dark:bg-amber-950/15 border border-amber-200/40 dark:border-amber-900/40 rounded-xl px-2.5 py-1 flex items-center justify-between transition text-xs font-semibold text-amber-700 dark:text-amber-400">
          <div className="flex items-center gap-1.5 min-w-0">
            <Coffee className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-600" />
            <span className="truncate">{b.notes || (language === 'en' ? 'Break' : 'Перерыв')}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className="text-amber-400 hover:text-red-500 opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer"
            title={language === 'en' ? 'Cancel Break' : 'Отменить перерыв'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    const isPendingCancellation = b.status === 'pending_cancellation';
    const isCompleted = b.status === 'completed';

    let cardBgClasses = 'bg-indigo-50/60 dark:bg-indigo-950/15 border border-indigo-250/45 dark:border-indigo-900/40 hover:border-indigo-400 dark:hover:border-indigo-700 text-indigo-950 dark:text-indigo-200';
    let titleColorClasses = 'text-indigo-900 dark:text-indigo-200';
    let buttonColorClasses = 'text-indigo-400 hover:text-red-500';
    let textTimeClasses = 'text-indigo-600 dark:text-indigo-400';

    if (isPendingCancellation) {
      cardBgClasses = 'bg-rose-50/60 dark:bg-rose-950/15 border border-rose-250/45 dark:border-rose-900/40 hover:border-rose-400 dark:hover:border-rose-700 text-rose-950 dark:text-rose-200 animate-pulse';
      titleColorClasses = 'text-rose-900 dark:text-rose-300 font-semibold';
      buttonColorClasses = 'text-rose-400 hover:text-red-500';
      textTimeClasses = 'text-rose-600 dark:text-rose-400';
    } else if (isCompleted) {
      cardBgClasses = 'bg-emerald-50/60 dark:bg-emerald-950/10 border border-emerald-250/45 dark:border-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-700 text-emerald-950 dark:text-emerald-200';
      titleColorClasses = 'text-emerald-900 dark:text-emerald-300 line-through decoration-emerald-200/50 dark:decoration-emerald-800/40';
      buttonColorClasses = 'text-emerald-400 hover:text-red-500';
      textTimeClasses = 'text-emerald-650 dark:text-emerald-400';
    }

    return (
      <div
        onClick={() => handleOpenSlotAction(ins, b.time, b)}
        className={`relative group/cell h-11 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer ${cardBgClasses}`}
      >
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className={`font-bold truncate flex items-center gap-1.5 ${titleColorClasses}`}>
            {client?.avatarUrl && (
              <img 
                src={client.avatarUrl} 
                alt={client.displayName} 
                className="w-4 h-4 rounded-none border border-black/10 shrink-0"
              />
            )}
            <span className="truncate">{client?.displayName || b.notes || (language === 'en' ? 'Client Lesson' : 'Занятие')}</span>
            {isPendingCancellation && (
              <span className="ml-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                ({language === 'en' ? 'Cancel Req' : 'Запрос отмены'})
              </span>
            )}
            {isCompleted && (
              <span className="ml-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                ✓ ({language === 'en' ? 'Done' : 'Завершено'})
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSlotDeleteClick(b.id);
            }}
            className={`opacity-0 group-hover/cell:opacity-100 transition p-0.5 rounded cursor-pointer ${buttonColorClasses}`}
            title={language === 'en' ? 'Cancel Booking' : 'Отменить занятие'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className={`text-[10px] font-mono flex items-center gap-1 mt-0.5 ${textTimeClasses}`}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{b.time} ({b.durationHours}h)</span>
        </div>
      </div>
    );
  };

  // Timetable slots generator
  const renderTimetableSlots = (ins: Instructor) => {
    const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    const cells = [];
    let skipCount = 0;

    for (let i = 0; i < timeSlots.length; i++) {
      if (skipCount > 0) {
        skipCount--;
        continue;
      }

      const slotTime = timeSlots[i];

      // Find if this instructor has a course on this date covering the current slot
      const courseOverlap = (courses || []).find((c) => {
        if (!c.instructorIds || !c.instructorIds.includes(ins.id)) return false;
        const { start: cStart, end: cEnd, startTime: cStartTime, endTime: cEndTime } = parseCourseDates(c.dates);
        const startStr = formatDateLocalYMD(cStart);
        const endStr = formatDateLocalYMD(cEnd);
        
        if (selectedDate < startStr || selectedDate > endStr) return false;
        
        const cStartMin = hourToMinutes(cStartTime);
        const cEndMin = hourToMinutes(cEndTime);
        const slotStart = hourToMinutes(slotTime);
        const slotEnd = slotStart + 60;
        
        return slotStart < cEndMin && slotEnd > cStartMin;
      });

      if (courseOverlap) {
        // Calculate consecutive slots that overlap with this course
        let span = 1;
        for (let j = i + 1; j < timeSlots.length; j++) {
          const checkSlotTime = timeSlots[j];
          const { start: cStart, end: cEnd, endTime: cEndTime } = parseCourseDates(courseOverlap.dates);
          const startStr = formatDateLocalYMD(cStart);
          const endStr = formatDateLocalYMD(cEnd);
          
          if (selectedDate >= startStr && selectedDate <= endStr) {
            const cEndMin = hourToMinutes(cEndTime);
            const slotStart = hourToMinutes(checkSlotTime);
            
            if (slotStart < cEndMin) {
              span++;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        
        span = Math.min(span, timeSlots.length - i);
        skipCount = span - 1;

        const courseBookings = bookings.filter(
          (b) => b.instructorId === `course_${courseOverlap.id}` && b.status !== 'cancelled' && !b.isDeleted
        );
        const bookedCount = courseBookings.length;
        const enrolledNames = courseBookings.map((b) => {
          const u = usersList.find((usr) => usr.uid === b.userId);
          return u?.displayName || u?.email || b.userId;
        }).filter(Boolean);

        cells.push(
          <td key={slotTime} colSpan={span} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
            <div
              onClick={() => {
                const otherGuides = courseOverlap.instructorIds?.filter(id => id !== ins.id) || [];
                const guideNamesStr = otherGuides.map(id => instructors.find(i => i.id === id)?.name || id).join(', ');
                const guidesDetail = guideNamesStr ? (language === 'en' ? ` (with ${guideNamesStr})` : ` (совместно с ${guideNamesStr})`) : '';
                const enrolledDetailsStr = enrolledNames.length > 0 
                  ? (language === 'en' ? `\nClients enrolled: ${enrolledNames.join(', ')}` : `\nЗаписанные клиенты: ${enrolledNames.join(', ')}`)
                  : (language === 'en' ? '\nNo clients enrolled yet.' : '\nНет записанных клиентов.');
                addNotification(
                  'info',
                  courseOverlap.title,
                  (language === 'en'
                    ? `Group Course "${courseOverlap.title}"${guidesDetail}. Scheduled: ${courseOverlap.dates}\nSeats: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}`
                    : `Групповой курс «${courseOverlap.title}»${guidesDetail}. Запланирован: ${courseOverlap.dates}\nМеста: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}`) + enrolledDetailsStr
                );
              }}
              className="relative group/cell min-h-[44px] h-auto border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1.5 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer"
            >
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <div className="font-bold truncate text-violet-900 dark:text-violet-200 flex items-center gap-1">
                  <BookOpen className="w-3 h-3 text-violet-500 shrink-0" />
                  <span className="truncate">{translateCourse(courseOverlap, language).title}</span>
                  <span className="text-[8px] bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 font-mono uppercase tracking-wider font-extrabold shrink-0">
                    {language === 'en' ? 'Course' : 'Курс'}
                  </span>
                </div>
              </div>
              <div className="text-[10px] font-mono flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
                <Clock className="w-3.5 h-3.5 shrink-0 text-violet-400 dark:text-violet-500" />
                <span>
                  {(() => {
                    const { startTime, endTime } = parseCourseDates(courseOverlap.dates);
                    return `${startTime} - ${endTime}`;
                  })()}
                </span>
              </div>
              {/* Seats Info */}
              <div className="text-[9px] font-mono mt-1 text-violet-700 dark:text-violet-300 border-t border-violet-200/50 dark:border-violet-800/40 pt-1 flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span>{language === 'en' ? 'Seats:' : 'Места:'}</span>
                  <span className="font-bold">{courseOverlap.availableSeats} / {courseOverlap.totalSeats} ({bookedCount} {language === 'en' ? 'booked' : 'записано'})</span>
                </div>
                {enrolledNames.length > 0 && (
                  <div className="text-[8px] leading-tight text-violet-600 dark:text-violet-400 mt-0.5 max-w-full truncate" title={enrolledNames.join(', ')}>
                    <span className="font-bold">{language === 'en' ? 'Clients:' : 'Клиенты:'}</span> {enrolledNames.join(', ')}
                  </div>
                )}
              </div>
            </div>
          </td>
        );
      } else {
        // Find if a booking starts exactly at this slotTime
        const b = bookings.find(
          (book) =>
            book.instructorId === ins.id &&
            book.date === selectedDate &&
            book.status !== 'cancelled' &&
            !book.isDeleted &&
            book.time === slotTime
        );

        if (b) {
          // Determine how many slots it covers
          const span = Math.min(b.durationHours, timeSlots.length - i);
          skipCount = span - 1;

          cells.push(
            <td key={slotTime} colSpan={span} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
              {renderBookingCell(b, ins)}
            </td>
          );
        } else {
          // Check if covered by an ongoing booking
        const coveringB = bookings.find((book) => {
          if (book.instructorId !== ins.id || book.date !== selectedDate || book.status === 'cancelled' || book.isDeleted) return false;
          const bStart = hourToMinutes(book.time);
          const slotStart = hourToMinutes(slotTime);
          const bEnd = bStart + book.durationHours * 60;
          return slotStart >= bStart && slotStart < bEnd;
        });

        if (coveringB) {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40">
              {renderBookingCell(coveringB, ins)}
            </td>
          );
        } else if (!ins.isAvailable) {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center bg-slate-50/20 dark:bg-slate-950/5 select-none">
              <div 
                className="w-full h-11 border border-slate-100/40 dark:border-slate-800/20 bg-slate-100/30 dark:bg-slate-900/10 rounded-xl flex items-center justify-center text-slate-350 dark:text-slate-650"
                title={language === 'en' ? 'Instructor Unavailable' : 'Инструктор недоступен'}
              >
                <Lock className="w-3 h-3 text-slate-300 dark:text-slate-700 opacity-60" />
              </div>
            </td>
          );
        } else {
          cells.push(
            <td key={slotTime} className="p-1 align-middle border-r border-slate-200/50 dark:border-slate-800/40 text-center">
              <button
                onClick={() => handleOpenSlotAction(ins, slotTime)}
                className="w-full h-11 border border-dashed border-slate-200/60 dark:border-slate-800/40 hover:border-indigo-400 dark:hover:border-indigo-800 hover:bg-indigo-50/10 dark:hover:bg-indigo-950/10 rounded-xl transition flex items-center justify-center cursor-pointer group animate-fade-in"
                title={language === 'en' ? 'Manage Slot' : 'Управление слотом'}
              >
                <Plus className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 group-hover:text-indigo-500 transition duration-200" />
              </button>
            </td>
          );
        }
      }
    }
    }
    return cells;
  };

  const getWeekRange = (date: Date) => {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    start.setDate(diff);
    
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    
    return { start, end };
  };

  const { start: weekStart, end: weekEnd } = getWeekRange(currentDate);
  const weekDays: Date[] = Array.from({ length: 7 }).map((_, i) => new Date(new Date(weekStart).setDate(weekStart.getDate() + i)));

  const getSpecialtyLabel = (spec: string) => {
    if (language === 'ru') {
      switch (spec) {
        case 'ski': return 'Лыжи';
        case 'snowboard': return 'Сноуборд';
        case 'both': return 'Оба';
        default: return spec;
      }
    }
    return spec;
  };

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

  const filteredBookings = useMemo(() => bookings.filter((b) => {
    if (b.userId?.startsWith('system_block_')) return false;
    const client = usersList.find((u) => u.uid === b.userId);
    const clientNameStr = (client?.displayName || '').toLowerCase();
    const instructorNameStr = b.instructorName.toLowerCase();
    const notesStr = (b.notes || '').toLowerCase();
    const searchLower = monitorSearch.toLowerCase();
    const matchesSearch = !monitorSearch || 
      clientNameStr.includes(searchLower) || 
      instructorNameStr.includes(searchLower) || 
      notesStr.includes(searchLower) ||
      b.id.toLowerCase().includes(searchLower);

    const matchesStatus = monitorStatusFilter === 'all' || b.status === monitorStatusFilter;
    const matchesInstructor = monitorInstructorFilter === 'all' || b.instructorId === monitorInstructorFilter || b.instructorName === monitorInstructorFilter;
    const matchesClient = monitorClientFilter === 'all' || b.userId === monitorClientFilter;

    return matchesSearch && matchesStatus && matchesInstructor && matchesClient;
  }).sort((a, b) => {
    if (monitorSortBy === 'date_desc') {
      const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
      const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
      return dateB.getTime() - dateA.getTime();
    } else if (monitorSortBy === 'date_asc') {
      const dateA = new Date(`${a.date}T${a.time || '00:00'}`);
      const dateB = new Date(`${b.date}T${b.time || '00:00'}`);
      return dateA.getTime() - dateB.getTime();
    } else if (monitorSortBy === 'client_asc') {
      const clientA = usersList.find((u) => u.uid === a.userId)?.displayName || '';
      const clientB = usersList.find((u) => u.uid === b.userId)?.displayName || '';
      return clientA.localeCompare(clientB, language === 'ru' ? 'ru' : 'en');
    } else if (monitorSortBy === 'client_desc') {
      const clientA = usersList.find((u) => u.uid === a.userId)?.displayName || '';
      const clientB = usersList.find((u) => u.uid === b.userId)?.displayName || '';
      return clientB.localeCompare(clientA, language === 'ru' ? 'ru' : 'en');
    }
    return 0;
  }), [bookings, usersList, monitorSearch, monitorStatusFilter, monitorInstructorFilter, monitorClientFilter, monitorSortBy, language]);

  const paginatedBookings = useMemo(() => {
    const startIndex = (monitorPage - 1) * 10;
    return filteredBookings.slice(startIndex, startIndex + 10);
  }, [filteredBookings, monitorPage]);

  const monitorTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredBookings.length / 10));
  }, [filteredBookings]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Admin stats dashboard banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{t('totalRevenue')}</span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">${totalRevenue}</span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{t('activeLessons')}</span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">{activeBookings}</span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <BookOpen className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{t('completedLessons')}</span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">{completedBookings}</span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <BookOpenCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-transparent border border-[var(--border)] p-5 rounded-none flex items-center justify-between transition-colors duration-300">
          <div className="space-y-1.5">
            <span className="text-[9px] font-mono text-[var(--ink-dim)] uppercase tracking-widest block">{t('allGuidesCount')}</span>
            <span className="text-2xl font-serif font-light text-[var(--ink)]">{instructors.length}</span>
          </div>
          <div className="w-10 h-10 border border-[var(--border)] rounded-none flex items-center justify-center text-[var(--ink)] bg-black/5 dark:bg-white/5">
            <Users className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* ⚙️ Global App Settings Section */}
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 animate-fade-in transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
              <Settings className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
              {language === 'en' ? 'System Settings & Controls' : 'Глобальные настройки системы'}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {language === 'en' 
                ? 'Configure global student-facing features, interface toggles, and resort-wide controls' 
                : 'Настройка глобальных функций для студентов, интерфейсов и общих параметров курорта'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-[var(--border)] p-5 flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-none">
            <div className="space-y-1.5">
              <span className="font-mono text-xs uppercase tracking-wider font-bold text-[var(--ink)] block">
                {language === 'en' ? 'Instructor Filters' : 'Фильтры инструкторов'}
              </span>
              <span className="text-[10px] text-[var(--ink-dim)] block max-w-sm leading-relaxed">
                {language === 'en' 
                  ? 'Enable or disable the filtering panel (Search, Specialty, Languages, Sorting) for clients on the main page.' 
                  : 'Включение или отключение панели фильтров (Поиск, Специализация, Языки, Сортировка) для клиентов на главной странице.'}
              </span>
            </div>
            
            <button
              onClick={() => onToggleFilters?.(!filtersEnabled)}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-none border border-[var(--border)] transition-colors duration-200 ease-in-out focus:outline-none ${
                filtersEnabled ? 'bg-[var(--ink)]' : 'bg-transparent'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-none shadow-none ring-0 transition duration-200 ease-in-out ${
                  filtersEnabled ? 'translate-x-[20px] bg-[var(--bg)]' : 'translate-x-[1px] bg-[var(--ink)] mt-[1px]'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 🗓️ Instructor Hourly Schedule Board */}
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2.5">
              <Calendar className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
              {language === 'en' ? 'Instructor Timetable & Schedule Board' : 'Интерактивный планер и расписание инструкторов'}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {language === 'en' 
                ? 'Manage hourly slots, set days off, add breaks, delete or reschedule lessons in real-time' 
                : 'Управление почасовыми слотами, установка выходных, добавление перерывов и перенос занятий в реальном времени'}
            </p>
          </div>

          {/* Date Selector Controls */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1 border border-[var(--border)] p-1 rounded-none">
              <button
                onClick={() => setViewMode('day')}
                className={`px-2.5 py-1 text-xs font-mono rounded-none transition ${viewMode === 'day' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-transparent text-[var(--ink)]'}`}
              >
                {language === 'en' ? 'Day' : 'День'}
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-2.5 py-1 text-xs font-mono rounded-none transition ${viewMode === 'week' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-transparent text-[var(--ink)]'}`}
              >
                {language === 'en' ? 'Week' : 'Неделя'}
              </button>
            </div>

            <div className="flex items-center gap-1">
            <button
              onClick={() => adjustDate(-1)}
              className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition cursor-pointer bg-transparent rounded-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            {viewMode === 'day' ? (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setCurrentDate(new Date(e.target.value))}
                className="px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-none text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
              />
            ) : (
              <div className="px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-[var(--border)] rounded-none text-xs text-center text-[var(--ink)] w-48">
                {weekStart.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
            
            <button
              onClick={() => adjustDate(1)}
              className="p-1.5 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition cursor-pointer bg-transparent rounded-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2.5 py-1.5 text-xs border border-[var(--border)] text-[var(--ink)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer bg-transparent rounded-none"
            >
              {language === 'en' ? 'Today' : 'Сегодня'}
            </button>
            </div>
          </div>
        </div>

        {/* Timetable Grid with horizontal scroll */}
        {viewMode === 'day' ? (
          <div className="overflow-x-auto rounded-none border border-[var(--border)]">
            <table className="w-full min-w-[1100px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/40 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="w-[180px] p-3 text-left font-bold">
                    {language === 'en' ? 'Instructor' : 'Инструктор'}
                  </th>
                  {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map((time) => (
                    <th key={time} className="p-3 text-center font-bold w-[95px] border-l border-slate-200/50 dark:border-slate-800/40">
                      {time}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {instructors.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-8 text-center text-sm text-slate-400">
                      {language === 'en' ? 'No instructors available.' : 'Инструкторы не найдены.'}
                    </td>
                  </tr>
                ) : (
                  instructors.map((ins) => (
                    <tr key={ins.id} className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}>
                      {/* Instructor Profile Header */}
                      <td className={`p-3 align-middle border-r border-[var(--border)] bg-black/5 dark:bg-white/5 ${!ins.isAvailable ? 'opacity-75' : ''}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="relative">
                            <img
                              src={ins.avatarUrl}
                              alt={ins.name}
                              className={`w-7 h-7 rounded-none border border-[var(--border)] object-cover shrink-0 ${!ins.isAvailable ? 'grayscale opacity-60' : ''}`}
                              referrerPolicy="no-referrer"
                            />
                            {!ins.isAvailable && (
                              <div className="absolute inset-0 bg-rose-955/20 border border-rose-500/30 flex items-center justify-center">
                                <Lock className="w-2.5 h-2.5 text-rose-500" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className={`text-xs font-bold truncate flex items-center gap-1 ${!ins.isAvailable ? 'text-[var(--ink-dim)] line-through' : 'text-[var(--ink)]'}`}>
                              {ins.name}
                            </div>
                            <div className="text-[9px] text-[var(--ink-dim)] font-mono capitalize truncate flex items-center gap-1">
                              {!ins.isAvailable ? (
                                <span className="text-rose-500 font-bold uppercase tracking-wider text-[8px]">
                                  {language === 'en' ? 'Unavailable' : 'Недоступен'}
                                </span>
                              ) : (
                                `${getSpecialtyLabel(ins.specialty)} • $${ins.pricePerHour}/h`
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      {/* Hourly cells */}
                      {renderTimetableSlots(ins)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-none border border-[var(--border)]">
            <table className="w-full min-w-[1100px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/40 text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="w-[180px] p-3 text-left font-bold">{language === 'en' ? 'Instructor' : 'Инструктор'}</th>
                  {weekDays.map(day => (
                    <th key={day.toISOString()} className="p-3 text-center font-bold border-l border-slate-200/50 dark:border-slate-800/40">
                      {day.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short', day: 'numeric' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/40">
                {instructors.map(ins => (
                  <tr key={ins.id} className={`hover:bg-black/5 dark:hover:bg-white/5 transition duration-150 ${!ins.isAvailable ? 'bg-black/5' : ''}`}>
                    <td className={`p-3 align-middle border-r border-[var(--border)] bg-black/5 dark:bg-white/5 ${!ins.isAvailable ? 'opacity-75' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative">
                          <img
                            src={ins.avatarUrl}
                            alt={ins.name}
                            className={`w-7 h-7 rounded-none border border-[var(--border)] object-cover shrink-0 ${!ins.isAvailable ? 'grayscale opacity-60' : ''}`}
                            referrerPolicy="no-referrer"
                          />
                          {!ins.isAvailable && (
                            <div className="absolute inset-0 bg-rose-955/20 border border-rose-500/30 flex items-center justify-center">
                              <Lock className="w-2.5 h-2.5 text-rose-500" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-bold truncate flex items-center gap-1 ${!ins.isAvailable ? 'text-[var(--ink-dim)] line-through' : 'text-[var(--ink)]'}`}>
                            {ins.name}
                          </div>
                          <div className="text-[9px] text-[var(--ink-dim)] font-mono capitalize truncate flex items-center gap-1">
                            {!ins.isAvailable ? (<span className="text-rose-500 font-bold uppercase tracking-wider text-[8px]">{language === 'en' ? 'Unavailable' : 'Недоступен'}</span>) : (`${getSpecialtyLabel(ins.specialty)} • $${ins.pricePerHour}/h`)}
                          </div>
                        </div>
                      </div>
                    </td>
                    {weekDays.map(day => {
                      const dayStr = formatDateLocalYMD(day);
                      const dayBookings = bookings.filter(b => b.instructorId === ins.id && b.date === dayStr && b.status !== 'cancelled' && !b.isDeleted);
                      const dayCourses = (courses || []).filter((c) => {
                        if (!c.instructorIds || !c.instructorIds.includes(ins.id)) return false;
                        const { start: cStart, end: cEnd } = parseCourseDates(c.dates);
                        const startStr = formatDateLocalYMD(cStart);
                        const endStr = formatDateLocalYMD(cEnd);
                        return dayStr >= startStr && dayStr <= endStr;
                      });

                      const combinedEvents = [
                        ...dayBookings.map(b => ({
                          type: 'booking' as const,
                          time: b.time,
                          data: b,
                          id: b.id
                        })),
                        ...dayCourses.map(c => {
                          const { startTime } = parseCourseDates(c.dates);
                          return {
                            type: 'course' as const,
                            time: startTime,
                            data: c,
                            id: `course_event_${c.id}`
                          };
                        })
                      ].sort((a, b) => a.time.localeCompare(b.time));

                      return (
                        <td key={dayStr} className="p-1 align-top border-l border-slate-200/50 dark:border-slate-800/40 min-h-24">
                          <div className="space-y-1">
                            {combinedEvents.map(item => {
                              if (item.type === 'booking') {
                                return (
                                  <div key={item.id}>{renderBookingCell(item.data, ins)}</div>
                                );
                              } else {
                                const courseOverlap = item.data;
                                const courseBookings = bookings.filter(
                                  (b) => b.instructorId === `course_${courseOverlap.id}` && b.status !== 'cancelled' && !b.isDeleted
                                );
                                const bookedCount = courseBookings.length;
                                const enrolledNames = courseBookings.map((b) => {
                                  const u = usersList.find((usr) => usr.uid === b.userId);
                                  return u?.displayName || u?.email || b.userId;
                                }).filter(Boolean);

                                return (
                                  <div
                                    key={item.id}
                                    onClick={() => {
                                      const otherGuides = courseOverlap.instructorIds?.filter(id => id !== ins.id) || [];
                                      const guideNamesStr = otherGuides.map(id => instructors.find(i => i.id === id)?.name || id).join(', ');
                                      const guidesDetail = guideNamesStr ? (language === 'en' ? ` (with ${guideNamesStr})` : ` (совместно с ${guideNamesStr})`) : '';
                                      const enrolledDetailsStr = enrolledNames.length > 0 
                                        ? (language === 'en' ? `\nClients enrolled: ${enrolledNames.join(', ')}` : `\nЗаписанные клиенты: ${enrolledNames.join(', ')}`)
                                        : (language === 'en' ? '\nNo clients enrolled yet.' : '\nНет записанных клиентов.');
                                      addNotification(
                                        'info',
                                        courseOverlap.title,
                                        (language === 'en'
                                          ? `Group Course "${courseOverlap.title}"${guidesDetail}. Scheduled: ${courseOverlap.dates}\nSeats: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}`
                                          : `Групповой курс «${courseOverlap.title}»${guidesDetail}. Запланирован: ${courseOverlap.dates}\nМеста: ${courseOverlap.availableSeats} / ${courseOverlap.totalSeats}`) + enrolledDetailsStr
                                      );
                                    }}
                                    className="relative group/cell h-11 border border-violet-200/40 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/15 hover:border-violet-400 dark:hover:border-violet-700 text-violet-950 dark:text-violet-200 rounded-xl px-2.5 py-1 flex flex-col justify-center transition text-[11px] leading-tight cursor-pointer"
                                  >
                                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                                      <div className="font-bold truncate text-violet-900 dark:text-violet-200 flex items-center gap-1.5 w-full">
                                        <BookOpen className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                        <span className="truncate">{translateCourse(courseOverlap, language).title}</span>
                                        <span className="text-[8px] bg-violet-100 dark:bg-violet-900/40 border border-violet-250/45 dark:border-violet-800 text-violet-700 dark:text-violet-300 px-1 py-0.2 font-mono uppercase tracking-wider font-extrabold shrink-0 ml-auto">
                                          {language === 'en' ? 'Course' : 'Курс'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[9px] font-mono flex items-center gap-1 mt-0.5 text-violet-600 dark:text-violet-400">
                                      <Clock className="w-3 h-3 shrink-0 text-violet-400 dark:text-violet-500" />
                                      <span>{item.time} ({courseOverlap.availableSeats}/{courseOverlap.totalSeats}) • {bookedCount} {language === 'en' ? 'enrolled' : 'записано'}</span>
                                    </div>
                                  </div>
                                );
                              }
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {activeSlotModal && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-md p-6 shadow-2xl relative space-y-4 transition-colors duration-300 animate-scale-up">
            <button
              onClick={() => setActiveSlotModal(null)}
              className="absolute top-4 right-4 text-[var(--ink-dim)] hover:text-[var(--ink)] border border-[var(--border)] bg-black/5 hover:bg-black/10 transition p-1 rounded-none cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Header */}
            <div>
              <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
                <Clock className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
                {activeSlotModal.booking 
                  ? (language === 'en' ? 'Manage Schedule Block' : 'Управление блоком расписания')
                  : (language === 'en' ? 'Schedule Action' : 'Запланировать действие')}
              </h4>
              <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] mt-1.5">
                {activeSlotModal.instructor.name} • {selectedDate} @ {activeSlotModal.time}
              </p>
            </div>

            {/* 1. Modal for EXISTING booking (Reschedule / Move or Delete) */}
            {activeSlotModal.booking ? (
              <form onSubmit={handleSlotMoveSubmit} className="space-y-4">
                <div className="bg-black/10 p-3 rounded-none border border-[var(--border)] space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
                    {language === 'en' ? 'Current Details' : 'Текущие детали'}
                  </div>
                  <div className="text-xs text-[var(--ink-dim)]">
                    <strong>{language === 'en' ? 'Type' : 'Тип'}:</strong>{' '}
                    {activeSlotModal.booking.userId === 'system_block_break' 
                      ? (language === 'en' ? 'Break' : 'Перерыв') 
                      : activeSlotModal.booking.userId === 'system_block_day_off' 
                        ? (language === 'en' ? 'Day Off' : 'Выходной')
                        : (language === 'en' ? `Lesson (${usersList.find(u => u.uid === activeSlotModal.booking?.userId)?.displayName || 'Client'})` : `Занятие (${usersList.find(u => u.uid === activeSlotModal.booking?.userId)?.displayName || 'Клиент'})`)}
                  </div>
                  {activeSlotModal.booking.notes && (
                    <div className="text-xs text-[var(--ink-dim)] italic">
                      "{activeSlotModal.booking.notes}"
                    </div>
                  )}
                  {activeSlotModal.booking.status === 'pending_cancellation' && activeSlotModal.booking.cancellationReason && (
                    <div className="text-xs text-rose-400 font-mono bg-rose-955/20 px-2.5 py-1.5 border border-rose-900/40 mt-1 rounded-none">
                      <strong>{language === 'en' ? 'Cancellation Reason' : 'Причина отмены'}:</strong>{' '}
                      {activeSlotModal.booking.cancellationReason}
                    </div>
                  )}

                  {activeSlotModal.booking.userId !== 'system_block_break' && activeSlotModal.booking.userId !== 'system_block_day_off' && (
                    <button
                      type="button"
                      onClick={() => setSelectedChatBooking(activeSlotModal.booking!)}
                      className="w-full mt-2.5 py-2.5 px-3 border border-indigo-500/30 bg-indigo-950/20 hover:bg-indigo-950/40 hover:border-indigo-400 text-indigo-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                      {language === 'en' ? 'Open Chat / Discussion' : 'Открыть чат / Обсуждение'}
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <h5 className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                    {language === 'en' ? 'Reschedule / Move' : 'Перенос / Изменение времени'}
                  </h5>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                        {language === 'en' ? 'New Date' : 'Новая дата'}
                      </label>
                      <input
                        type="date"
                        required
                        value={newMoveDate}
                        onChange={(e) => setNewMoveDate(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                        {language === 'en' ? 'New Start Time' : 'Новое время'}
                      </label>
                      <select
                        required
                        value={newMoveTime}
                        onChange={(e) => setNewMoveTime(e.target.value)}
                        disabled={availableMoveTimeSlots.length === 0}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                      >
                        {availableMoveTimeSlots.length === 0 ? (
                          <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'No slots available' : 'Нет свободного времени'}</option>
                        ) : (
                          availableMoveTimeSlots.map((time: string) => (
                            <option key={time} value={time} className="bg-[var(--bg)] text-[var(--ink)]">{time}</option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                {activeSlotModal.booking.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (onCompleteBooking) {
                        setIsSlotActionSubmitting(true);
                        await onCompleteBooking(activeSlotModal.booking!.id);
                        setIsSlotActionSubmitting(false);
                        setActiveSlotModal(null);
                      }
                    }}
                    disabled={isSlotActionSubmitting}
                    className="w-full py-2.5 border border-emerald-900/40 bg-emerald-950/20 hover:bg-emerald-955/40 hover:border-emerald-500 text-emerald-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer mb-2"
                  >
                    <Check className="w-4 h-4" />
                    {language === 'en' ? 'Mark Lesson as Completed' : 'Отметить урок как завершенный'}
                  </button>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSlotDeleteClick(activeSlotModal.booking!.id)}
                    className="flex-1 py-2.5 border border-rose-900/40 bg-rose-955/20 hover:bg-rose-955/40 hover:border-rose-500 text-rose-400 rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    {language === 'en' ? 'Delete / Cancel' : 'Удалить блок'}
                  </button>

                  <button
                    type="submit"
                    disabled={isSlotActionSubmitting}
                    className="flex-1 py-2 px-3 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    {isSlotActionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {language === 'en' ? 'Apply Move' : 'Перенести'}
                  </button>
                </div>
              </form>
            ) : (
              /* 2. Modal for EMPTY slot (Create Break, Day Off, or Manual Booking) */
              <form onSubmit={handleSlotActionSubmit} className="space-y-4">
                {/* Mode tabs */}
                <div className="flex bg-black/10 p-1 border border-[var(--border)] rounded-none">
                  {(['break', 'day_off', 'booking'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setModalTab(tab)}
                      className={`flex-1 py-1.5 text-center text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer rounded-none ${
                        modalTab === tab 
                          ? 'bg-[var(--ink)] text-[var(--bg)] font-bold' 
                          : 'text-[var(--ink-dim)] hover:text-[var(--ink)]'
                      }`}
                    >
                      {tab === 'break' && (language === 'en' ? 'Break' : 'Перерыв')}
                      {tab === 'day_off' && (language === 'en' ? 'Day Off' : 'Выходной')}
                      {tab === 'booking' && (language === 'en' ? 'Lesson' : 'Запись')}
                    </button>
                  ))}
                </div>

                {/* TAB 1: Break details */}
                {modalTab === 'break' && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                        {language === 'en' ? 'Break Duration' : 'Длительность перерыва'}
                      </label>
                      <select
                        value={blockDuration}
                        onChange={(e) => setBlockDuration(Number(e.target.value))}
                        disabled={availableBreakDurations.length === 0}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                      >
                        {availableBreakDurations.length === 0 ? (
                          <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'No hours available' : 'Нет доступных часов'}</option>
                        ) : (
                          availableBreakDurations.map((d: number) => (
                            <option key={d} value={d} className="bg-[var(--bg)] text-[var(--ink)]">
                              {d} {d === 1 ? (language === 'en' ? 'hour' : 'час') : (language === 'en' ? 'hours' : 'часа')}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                        {language === 'en' ? 'Notes / Title' : 'Примечание / Название'}
                      </label>
                      <input
                        type="text"
                        value={blockNotes}
                        onChange={(e) => setBlockNotes(e.target.value)}
                        placeholder={language === 'en' ? 'Lunch break, medical check...' : 'Обед, личные дела...'}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
                      />
                    </div>
                  </div>
                )}

                {/* TAB 2: Day Off details */}
                {modalTab === 'day_off' && (
                  <div className="p-3 bg-black/10 border border-[var(--border)] text-xs text-[var(--ink-dim)] leading-relaxed animate-fade-in space-y-2 rounded-none">
                    <div className="font-serif text-xs font-light text-[var(--ink)] flex items-center gap-1">
                      <Calendar className="w-4 h-4 text-[var(--ink-dim)]" />
                      {language === 'en' ? 'Full Day Off' : 'Полный выходной день'}
                    </div>
                    <p>
                      {language === 'en' 
                        ? 'This action will block the entire day (08:00 to 19:00) for this instructor. No clients will be able to book lessons on this day.'
                        : 'Это действие заблокирует весь день (с 08:00 до 19:00) для этого инструктора. Клиенты не смогут забронировать занятия на эту дату.'}
                    </p>
                  </div>
                )}

                {/* TAB 3: Manual Client Booking details */}
                {modalTab === 'booking' && (
                  <div className="space-y-3 animate-fade-in">
                    {!activeSlotModal.instructor.isAvailable && (
                      <div className="bg-rose-955/20 border border-rose-900/40 p-3 text-xs text-rose-400 rounded-none font-mono">
                        <p className="font-bold">⚠️ {language === 'en' ? 'Instructor Unavailable' : 'Инструктор недоступен'}</p>
                        <p className="text-[11px] opacity-90 mt-0.5">
                          {language === 'en'
                            ? `${activeSlotModal.instructor.name} is marked as unavailable. Booking is locked.`
                            : `${activeSlotModal.instructor.name} отключен(а) из доступных. Создание новых бронирований заблокировано.`}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                        {language === 'en' ? 'Select Client' : 'Выберите клиента'}
                      </label>
                      <select
                        required
                        value={selectedClientUid}
                        onChange={(e) => setSelectedClientUid(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer"
                      >
                        <option value="" disabled className="bg-[var(--bg)] text-[var(--ink)]">
                          {language === 'en' ? 'Choose from registered clients' : 'Выберите из зарегистрированных клиентов'}
                        </option>
                        {usersList.map((client) => (
                          <option key={client.uid} value={client.uid} className="bg-[var(--bg)] text-[var(--ink)] font-mono">
                            {client.displayName} ({client.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                          {language === 'en' ? 'Duration' : 'Длительность'}
                        </label>
                        <select
                          value={bookingDuration}
                          onChange={(e) => setBookingDuration(Number(e.target.value))}
                          disabled={availableBookingDurations.length === 0}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer font-mono disabled:opacity-60"
                        >
                          {availableBookingDurations.length === 0 ? (
                            <option value="" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'No hours available' : 'Нет доступных часов'}</option>
                          ) : (
                            availableBookingDurations.map((d: number) => (
                              <option key={d} value={d} className="bg-[var(--bg)] text-[var(--ink)]">
                                {d} {d === 1 ? (language === 'en' ? 'hour' : 'час') : (language === 'en' ? 'hours' : 'часа')}
                              </option>
                            ))
                          )}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                          {language === 'en' ? 'Skill Level' : 'Уровень сложности'}
                        </label>
                        <select
                          value={bookingDifficulty}
                          onChange={(e) => setBookingDifficulty(e.target.value as any)}
                          className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none cursor-pointer"
                        >
                          <option value="beginner" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'Beginner' : 'Новичок'}</option>
                          <option value="intermediate" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'Intermediate' : 'Средний'}</option>
                          <option value="advanced" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'Advanced' : 'Продвинутый'}</option>
                          <option value="freeride" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'Freeride' : 'Фрирайд'}</option>
                          <option value="freestyle" className="bg-[var(--bg)] text-[var(--ink)]">{language === 'en' ? 'Freestyle' : 'Фристайл'}</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)] block">
                        {language === 'en' ? 'Booking Notes' : 'Комментарий'}
                      </label>
                      <input
                        type="text"
                        value={bookingNotes}
                        onChange={(e) => setBookingNotes(e.target.value)}
                        placeholder={language === 'en' ? 'Instructor details, equipment rental...' : 'Нужен прокат, первая тренировка...'}
                        className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none"
                      />
                    </div>
                  </div>
                )}

                {/* Form submit footer buttons */}
                <div className="flex gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setActiveSlotModal(null)}
                    className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
                  >
                    {language === 'en' ? 'Cancel' : 'Отмена'}
                  </button>

                  <button
                    type="submit"
                    disabled={isSlotActionSubmitting || (modalTab === 'booking' && !activeSlotModal.instructor.isAvailable)}
                    className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] disabled:bg-black/5 disabled:text-[var(--ink-dim)] disabled:border-[var(--border)] disabled:cursor-not-allowed rounded-none text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 transition cursor-pointer text-center"
                  >
                    {isSlotActionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {language === 'en' ? 'Save Schedule' : 'Запланировать'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      <div className="grid lg:grid-cols-12 gap-6 w-full min-w-0 overflow-hidden">
        {/* Instructors Management Table */}
        <div className={`${(showAddForm || editingIns) ? 'lg:col-span-8' : 'lg:col-span-12'} border border-[var(--border)] p-6 bg-transparent space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
            <div>
              <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
                {language === 'en' ? 'Coaches Directory Management' : 'Управление базой инструкторов'}
              </h3>
              <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
                {language === 'en' ? 'Toggle availability, edit rates, add/remove staff' : 'Управление доступностью, тарифами, добавление и удаление тренеров'}
              </p>
            </div>
            <button
              onClick={() => {
                setEditingIns(null);
                setShowAddForm(!showAddForm);
              }}
              className="py-1.5 px-3 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-none text-xs flex items-center gap-1 transition cursor-pointer font-mono"
            >
              <Plus className="w-4 h-4" /> {language === 'en' ? 'Add Coach' : 'Добавить'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                  <th className="py-3 px-2">{language === 'en' ? 'Instructor' : 'Инструктор'}</th>
                  <th className="py-3 px-2">{language === 'en' ? 'Discipline' : 'Дисциплина'}</th>
                  <th className="py-3 px-2">{language === 'en' ? 'Rate/hr' : 'Ставка/ч'}</th>
                  <th className="py-3 px-2 text-center">{language === 'en' ? 'Availability' : 'Доступность'}</th>
                  <th className="py-3 px-2 text-right">{language === 'en' ? 'Actions' : 'Действия'}</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((ins) => (
                  <tr key={ins.id} className="border-b border-[var(--border)]/40 hover:bg-black/5 dark:hover:bg-white/5 transition">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2.5">
                        <img src={ins.avatarUrl} alt={ins.name} className="w-8 h-8 rounded-none border border-[var(--border)] object-cover" />
                        <div>
                          <span className="text-xs font-bold text-[var(--ink)] block leading-none">{ins.name}</span>
                          <span className="text-[10px] font-mono text-[var(--ink-dim)] mt-1.5 block">
                            {language === 'en' ? `Exp: ${ins.experienceYears} Years` : `Опыт: ${ins.experienceYears} л.`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <span className="text-[10px] font-mono text-[var(--ink)] uppercase border border-[var(--border)] px-2 py-0.5 bg-black/5 dark:bg-white/5">
                        {getSpecialtyLabel(ins.specialty)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-xs font-mono text-[var(--ink)]">${ins.pricePerHour}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center justify-center">
                        <button onClick={() => handleToggleAvailability(ins)} className="p-1 transition cursor-pointer">
                          {ins.isAvailable ? (
                            <ToggleRight className="w-8 h-8 text-[var(--ink)]" />
                          ) : (
                            <ToggleLeft className="w-8 h-8 text-[var(--ink-dim)]" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => startEdit(ins)}
                          className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
                          title={language === 'en' ? 'Edit Details' : 'Редактировать'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCoach(ins)}
                          className="p-1.5 text-rose-500 hover:text-rose-600 hover:border-rose-500/30 border border-transparent rounded-none transition cursor-pointer"
                          title={language === 'en' ? 'Delete Instructor' : 'Удалить'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form Panel Side (Dynamic add or edit) */}
        {(showAddForm || editingIns) && (
          <div className="lg:col-span-4 border border-[var(--border)] p-6 bg-transparent self-start transition-colors duration-300 animate-fade-in">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h4 className="font-serif text-lg font-light text-[var(--ink)]">
                  {editingIns 
                    ? (language === 'en' ? `Edit Profile: ${editingIns.name}` : `Редактирование: ${editingIns.name}`) 
                    : (language === 'en' ? 'Register New Coach' : 'Зарегистрировать тренера')}
                </h4>
                <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
                  {language === 'en' ? 'Define specialty levels, rate limits, and language tags' : 'Укажите специальность, стоимость и языки'}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">{language === 'en' ? 'Coach Full Name' : 'Имя тренера'}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jean-Pierre"
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">{t('discipline')}</label>
                  <select
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value as any)}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-slate-50 dark:bg-slate-900 text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] cursor-pointer rounded-none font-mono"
                  >
                    <option value="ski" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Ski' : 'Лыжи'}</option>
                    <option value="snowboard" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Snowboard' : 'Сноуборд'}</option>
                    <option value="both" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Both' : 'Оба'}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">{language === 'en' ? 'Rate / Hour ($)' : 'Ставка в час ($)'}</label>
                  <input
                    type="number"
                    required
                    value={pricePerHour}
                    onChange={(e) => setPricePerHour(Number(e.target.value))}
                    placeholder="75"
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] text-center rounded-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">{language === 'en' ? 'Experience (Yrs)' : 'Опыт (лет)'}</label>
                  <input
                    type="number"
                    required
                    value={experienceYears}
                    onChange={(e) => setExperienceYears(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] text-center rounded-none font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">{language === 'en' ? 'Languages (CSV)' : 'Языки (через запятую)'}</label>
                  <input
                    type="text"
                    required
                    value={languages}
                    onChange={(e) => setLanguages(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">{language === 'en' ? 'Bio Statement' : 'Биография / О себе'}</label>
                <textarea
                  required
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={language === 'en' ? 'Tell students about lessons style...' : 'Расскажите ученикам о вашем стиле обучения...'}
                  className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] resize-none rounded-none font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                  {language === 'en' ? 'Coach Photo / Avatar' : 'Фотография тренера / Аватар'}
                </label>

                {/* Combined preview and drag-drop upload zone */}
                <div className="flex gap-3 items-center">
                  {/* Visual Preview */}
                  <div className="w-16 h-16 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)] flex-shrink-0 overflow-hidden relative flex items-center justify-center group">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Camera className="w-6 h-6 text-[var(--ink-dim)]" />
                    )}
                    {isUploadingImage && (
                      <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('instructor-photo-upload')?.click()}
                    className={`flex-1 h-16 rounded-none border border-dashed flex flex-col items-center justify-center px-3 cursor-pointer transition ${
                      isDragOver
                        ? 'border-[var(--ink)] bg-black/5 dark:bg-white/5'
                        : 'border-[var(--border)] hover:border-[var(--ink)] bg-black/5 dark:bg-white/5'
                    }`}
                  >
                    <input
                      id="instructor-photo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <Upload className="w-4 h-4 text-[var(--ink-dim)] mb-0.5" />
                    <p className="text-[10px] font-bold text-[var(--ink)] text-center font-mono">
                      {isUploadingImage
                        ? (language === 'en' ? 'Optimizing...' : 'Оптимизация...')
                        : (language === 'en' ? 'Click or drag photo here' : 'Нажмите или перетащите фото сюда')}
                    </p>
                    <p className="text-[8px] text-[var(--ink-dim)] text-center font-mono">
                      {language === 'en' ? 'JPEG/PNG will be auto-optimized' : 'JPEG/PNG будут авто-оптимизированы'}
                    </p>
                  </div>
                </div>

                {/* Manual URL Input alternative */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[var(--ink-dim)] font-semibold uppercase font-mono">
                      {language === 'en' ? 'Or paste an Image URL' : 'Или вставьте прямую ссылку на фото'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 border border-[var(--border)] text-xs bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 font-mono">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] font-bold text-xs rounded-none flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingIns ? (language === 'en' ? 'Save Updates' : 'Сохранить') : (language === 'en' ? 'Add Coach' : 'Добавить')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingIns(null);
                    setShowAddForm(false);
                  }}
                  className="px-3 py-2 border border-[var(--border)] bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-[var(--ink)] rounded-none text-xs font-semibold cursor-pointer transition"
                >
                  {language === 'en' ? 'Cancel' : 'Отмена'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Bookings Overview Log */}
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)]">{language === 'en' ? 'Active Bookings Monitor' : 'Монитор активных бронирований'}</h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">{language === 'en' ? 'Monitor and control individual skier bookings' : 'Контролируйте и управляйте бронированиями индивидуальных лыжников'}</p>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 pb-1 font-mono">
          {/* Search Input */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[var(--ink-dim)]">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder={language === 'en' ? 'Search bookings...' : 'Поиск бронирований...'}
              value={monitorSearch}
              onChange={(e) => setMonitorSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] placeholder-[var(--ink-dim)] transition font-mono"
            />
          </div>

          {/* Status Filter Dropdown */}
          <div>
            <select
              value={monitorStatusFilter}
              onChange={(e) => setMonitorStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] transition cursor-pointer font-mono"
            >
              <option value="all" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'All Statuses' : 'Все статусы'}</option>
              <option value="pending" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Pending' : 'Ожидающие'}</option>
              <option value="pending_cancellation" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Pending Cancellation' : 'Ожидающие отмены'}</option>
              <option value="confirmed" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Confirmed' : 'Подтвержденные'}</option>
              <option value="completed" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Completed' : 'Завершенные'}</option>
              <option value="cancelled" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Cancelled' : 'Отмененные'}</option>
            </select>
          </div>

          {/* Instructor Filter Dropdown */}
          <div>
            <select
              value={monitorInstructorFilter}
              onChange={(e) => setMonitorInstructorFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] transition cursor-pointer font-mono"
            >
              <option value="all" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'All Instructors' : 'Все инструкторы'}</option>
              {instructors.map((ins) => (
                <option key={ins.id} value={ins.id} className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{ins.name}</option>
              ))}
            </select>
          </div>

          {/* Client Filter Dropdown */}
          <div>
            <select
              value={monitorClientFilter}
              onChange={(e) => setMonitorClientFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] transition cursor-pointer font-mono"
            >
              <option value="all" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'All Clients' : 'Все клиенты'}</option>
              {usersList.map((user) => (
                <option key={user.uid} value={user.uid} className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
                  {user.displayName || user.email || user.uid}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div>
            <select
              value={monitorSortBy}
              onChange={(e) => setMonitorSortBy(e.target.value as any)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] transition cursor-pointer font-mono"
            >
              <option value="date_desc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Date: Newest' : 'Дата: сначала новые'}</option>
              <option value="date_asc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Date: Oldest' : 'Дата: сначала старые'}</option>
              <option value="client_asc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Client: A-Z' : 'Имя: А-Я'}</option>
              <option value="client_desc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Client: Z-A' : 'Имя: Я-А'}</option>
            </select>
          </div>
        </div>

        {/* Clear filters trigger */}
        {(monitorSearch || monitorStatusFilter !== 'all' || monitorInstructorFilter !== 'all' || monitorClientFilter !== 'all' || monitorSortBy !== 'date_desc') && (
          <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-none border border-[var(--border)] font-mono">
            <span className="text-[10px] text-[var(--ink-dim)]">
              {language === 'en' 
                ? `Found ${filteredBookings.length} matching entries` 
                : `Найдено ${filteredBookings.length} совпадений`}
            </span>
            <button
              onClick={() => {
                setMonitorSearch('');
                setMonitorStatusFilter('all');
                setMonitorInstructorFilter('all');
                setMonitorClientFilter('all');
                setMonitorSortBy('date_desc');
              }}
              className="text-[10px] text-[var(--ink)] hover:underline font-bold transition cursor-pointer"
            >
              {language === 'en' ? 'Reset Filters' : 'Сбросить фильтры'}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                <th className="py-3 px-2">{language === 'en' ? 'Booking ID' : 'ID Бронирования'}</th>
                <th className="py-3 px-2">{language === 'en' ? 'Client' : 'Клиент'}</th>
                <th className="py-3 px-2">{language === 'en' ? 'Instructor' : 'Инструктор'}</th>
                <th className="py-3 px-2">{language === 'en' ? 'Date/Time' : 'Дата/Время'}</th>
                <th className="py-3 px-2">{language === 'en' ? 'Fee' : 'Стоимость'}</th>
                <th className="py-3 px-2">{language === 'en' ? 'Status' : 'Статус'}</th>
                <th className="py-3 px-2 text-right">{language === 'en' ? 'Approval Actions' : 'Одобрение'}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.filter(b => !b.userId?.startsWith('system_block_')).length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-xs text-[var(--ink-dim)] font-mono">{language === 'en' ? 'No scheduled sessions recorded.' : 'Запланированных уроков пока нет.'}</td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-xs text-[var(--ink-dim)] font-mono">
                    {language === 'en' ? 'No bookings match your filter criteria.' : 'Занятий по выбранным фильтрам не найдено.'}
                  </td>
                </tr>
              ) : (
                paginatedBookings.map((b) => {
                  const client = usersList.find((u) => u.uid === b.userId);
                  const instructorName = b.instructorName;
                  return (
                    <tr key={b.id} className="border-b border-[var(--border)]/40 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
                      <td className="py-3 px-2 font-mono text-[10px] text-[var(--ink-dim)]">{b.id}</td>
                      <td className="py-3 px-2">
                        <span className="font-bold text-[var(--ink)] block leading-none">{client?.displayName || (language === 'en' ? 'Client' : 'Клиент')}</span>
                        <span className="font-mono text-[9px] text-[var(--ink-dim)] mt-1 block">{b.userId.substring(0, 8)}...</span>
                      </td>
                      <td className="py-3 px-2 font-bold text-[var(--ink)]">{instructorName}</td>
                      <td className="py-3 px-2 font-mono text-[11px] text-[var(--ink-dim)]">
                        <div>{b.date} @ {b.time} ({b.durationHours}h)</div>
                        {b.status === 'pending_cancellation' && b.cancellationReason && (
                          <div className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 font-bold bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded-none inline-block">
                            {language === 'en' ? 'Reason: ' : 'Причина: '}{b.cancellationReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-2 font-mono text-[var(--ink)]">${b.totalPrice}</td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2 py-0.5 border text-[9px] font-mono uppercase rounded-none ${
                            b.status === 'confirmed' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' :
                            b.status === 'completed' ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10' :
                            b.status === 'cancelled' ? 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/10' :
                            b.status === 'pending_cancellation' ? 'border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 animate-pulse' :
                            'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                          }`}
                        >
                          {getStatusLabelTranslated(b.status)}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right font-mono">
                        {b.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => onConfirmBooking(b.id)}
                              className="p-1 border border-transparent hover:border-[var(--border)] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/5 rounded-none transition cursor-pointer"
                              title="Confirm Booking"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onCancelBooking(b.id)}
                              className="p-1 border border-transparent hover:border-[var(--border)] text-rose-600 dark:text-rose-400 hover:bg-rose-500/5 rounded-none transition cursor-pointer"
                              title="Decline/Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        {b.status === 'pending_cancellation' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  message: language === 'en'
                                    ? 'Approve client cancellation request and process the full refund?'
                                    : 'Одобрить запрос клиента на отмену занятия и вернуть полную стоимость?',
                                  onConfirm: async () => {
                                    await onCancelBooking(b.id);
                                  }
                                });
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold border border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 hover:text-white rounded-none transition cursor-pointer"
                              title={language === 'en' ? 'Approve Cancellation' : 'Одобрить отмену'}
                            >
                              {language === 'en' ? 'Approve Cancel' : 'Одобрить отмену'}
                            </button>
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  message: language === 'en'
                                    ? 'Decline client cancellation request and keep the booking confirmed?'
                                    : 'Отклонить запрос на отмену и оставить бронирование подтвержденным?',
                                  onConfirm: async () => {
                                    await onConfirmBooking(b.id);
                                  }
                                });
                              }}
                              className="px-2.5 py-1 text-[10px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                              title={language === 'en' ? 'Reject Request' : 'Отклонить запрос'}
                            >
                              {language === 'en' ? 'Decline' : 'Отклонить'}
                            </button>
                          </div>
                        )}
                        {b.status === 'confirmed' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onCompleteBooking?.(b.id)}
                              className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                            >
                              {language === 'en' ? 'Complete' : 'Завершить'}
                            </button>
                            <button
                              onClick={() => onCancelBooking(b.id)}
                              className="px-2 py-0.5 text-[9px] font-bold border border-rose-500/30 hover:border-rose-500 text-rose-500 rounded-none transition cursor-pointer"
                            >
                              {language === 'en' ? 'Cancel' : 'Отменить'}
                            </button>
                          </div>
                        )}
                        {b.status === 'cancelled' && (
                          <span className="text-[10px] text-[var(--ink-dim)] italic font-mono">{language === 'en' ? 'Cancelled' : 'Отменено'}</span>
                        )}
                        {b.status === 'completed' && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 italic font-mono">{language === 'en' ? 'Finished' : 'Завершено'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {monitorTotalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 font-mono text-xs">
            <div className="text-[var(--ink-dim)]">
              {language === 'en' 
                ? `Page ${monitorPage} of ${monitorTotalPages} (${filteredBookings.length} total)` 
                : `Страница ${monitorPage} из ${monitorTotalPages} (всего ${filteredBookings.length})`}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonitorPage(prev => Math.max(1, prev - 1))}
                disabled={monitorPage === 1}
                className="p-1 border border-[var(--border)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-none disabled:opacity-30 disabled:hover:bg-transparent disabled:border-[var(--border)] disabled:cursor-not-allowed cursor-pointer transition text-[var(--ink)]"
                title={language === 'en' ? 'Previous Page' : 'Предыдущая страница'}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMonitorPage(prev => Math.min(monitorTotalPages, prev + 1))}
                disabled={monitorPage === monitorTotalPages}
                className="p-1 border border-[var(--border)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-none disabled:opacity-30 disabled:hover:bg-transparent disabled:border-[var(--border)] disabled:cursor-not-allowed cursor-pointer transition text-[var(--ink)]"
                title={language === 'en' ? 'Next Page' : 'Следующая страница'}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Client Records Management Section */}
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
              {language === 'en' ? 'Client Database Management' : 'Управление базой клиентов'}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {language === 'en' ? 'View and update client profiles, adjust user wallet balances' : 'Просмотр и редактирование профилей клиентов, управление балансом кошельков'}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingClient(null);
              setClientName('');
              setClientEmail('');
              setClientPhone('');
              setClientBalance(250);
              setClientRole('user');
              setClientIsActive(true);
              setClientIsInstructor(false);
              setShowClientAddForm(!showClientAddForm);
            }}
            className="self-start md:self-auto py-1.5 px-3 border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 rounded-none text-xs flex items-center gap-1 transition cursor-pointer font-mono"
          >
            {showClientAddForm && !editingClient ? (
              <>
                <X className="w-4 h-4" />
                {language === 'en' ? 'Close Form' : 'Закрыть форму'}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                {language === 'en' ? 'Register New Client' : 'Зарегистрировать нового клиента'}
              </>
            )}
          </button>
        </div>

        <div className="grid lg:grid-cols-12 gap-6 w-full min-w-0 overflow-hidden">
          {/* Left Column: Client Directory */}
          <div className={`${showClientAddForm ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-4 transition-all duration-300 w-full min-w-0 overflow-hidden`}>
            {/* Search Box */}
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--ink-dim)] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={clientSearchText}
                onChange={(e) => setClientSearchText(e.target.value)}
                placeholder={language === 'en' ? 'Search clients...' : 'Поиск клиентов...'}
                className="w-full pl-10 pr-4 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition rounded-none font-mono placeholder-[var(--ink-dim)]"
              />
            </div>

            {/* Clients Table */}
            <div className="border border-[var(--border)] overflow-hidden bg-transparent w-full min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
                      <th className="px-4 py-3">{language === 'en' ? 'Client' : 'Клиент'}</th>
                      <th className="px-4 py-3">{language === 'en' ? 'Contact details' : 'Контактные данные'}</th>
                      <th className="px-4 py-3">{language === 'en' ? 'Wallet Balance' : 'Баланс счета'}</th>
                      <th className="px-4 py-3">{language === 'en' ? 'Role' : 'Роль'}</th>
                      <th className="px-4 py-3 text-right">{language === 'en' ? 'Actions' : 'Действия'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]/40">
                    {usersList
                      .filter(u => {
                        if (!clientSearchText) return true;
                        const search = clientSearchText.toLowerCase();
                        return (
                          (u.displayName || '').toLowerCase().includes(search) ||
                          (u.email || '').toLowerCase().includes(search) ||
                          (u.phoneNumber || '').toLowerCase().includes(search)
                        );
                      })
                      .map((u) => {
                        const isSelf = currentUserEmail.toLowerCase() === u.email?.toLowerCase();
                        return (
                          <tr key={u.uid} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <img 
                                  src={u.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.uid}`} 
                                  referrerPolicy="no-referrer"
                                  alt={u.displayName} 
                                  className="w-10 h-10 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)]" 
                                />
                                <div>
                                  <span className="text-xs font-bold text-[var(--ink)] block flex items-center gap-1.5">
                                    {u.displayName || 'Unnamed client'}
                                    {isSelf && (
                                      <span className="bg-black/10 dark:bg-white/10 text-[var(--ink-dim)] text-[8px] font-mono px-1.5 py-0.5 rounded-none uppercase">
                                        {language === 'en' ? 'You' : 'Вы'}
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-[var(--ink-dim)] font-mono block mt-0.5">{u.uid}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold text-[var(--ink)] block">{u.email}</span>
                              {u.phoneNumber ? (
                                <span className="text-[10px] text-[var(--ink-dim)] font-mono block mt-1">{u.phoneNumber}</span>
                              ) : (
                                <span className="text-[10px] text-[var(--ink-dim)] font-mono italic block mt-1">{language === 'en' ? 'No phone specified' : 'Телефон не указан'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold text-[var(--ink)] flex items-center gap-1 font-mono">
                                <DollarSign className="w-3.5 h-3.5" />
                                {u.balanceUSD}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1 items-start">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-mono uppercase border ${u.role === 'admin' ? 'border-[var(--ink)] text-[var(--ink)] bg-black/5 dark:bg-white/5' : 'border-[var(--border)] text-[var(--ink-dim)] bg-transparent'}`}>
                                  {u.role === 'admin' ? (language === 'en' ? 'Admin' : 'Администратор') : (language === 'en' ? 'User' : 'Пользователь')}
                                </span>
                                {u.isInstructor && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-mono uppercase border border-indigo-500/40 text-indigo-400 bg-indigo-950/20">
                                    {language === 'en' ? 'Instructor' : 'Инструктор'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1 font-mono">
                                <button
                                  onClick={() => startEditClient(u)}
                                  className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
                                  title={language === 'en' ? 'Edit client' : 'Редактировать клиента'}
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  disabled={isSelf}
                                  onClick={() => handleDeleteClient(u)}
                                  className={`p-1.5 border border-transparent rounded-none transition ${isSelf ? 'text-[var(--ink-dim)]/20 cursor-not-allowed' : 'text-rose-500 hover:text-rose-600 hover:border-rose-500/30 cursor-pointer'}`}
                                  title={isSelf ? (language === 'en' ? 'Cannot delete self' : 'Нельзя удалить себя') : (language === 'en' ? 'Delete client' : 'Удалить клиента')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {usersList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-xs text-[var(--ink-dim)] font-mono">
                          {language === 'en' ? 'No clients found in the database.' : 'Клиенты в базе данных не найдены.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column: Add / Edit Client Form */}
          {showClientAddForm && (
            <div className="lg:col-span-4 border border-[var(--border)] p-6 bg-transparent space-y-4 animate-fade-in shrink-0">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h4 className="font-serif text-lg font-light text-[var(--ink)]">
                  {editingClient ? (language === 'en' ? 'Edit Profile' : 'Редактирование профиля') : (language === 'en' ? 'New Client' : 'Регистрация клиента')}
                </h4>
                <button
                  onClick={() => {
                    setEditingClient(null);
                    setShowClientAddForm(false);
                  }}
                  className="p-1 text-[var(--ink-dim)] hover:text-[var(--ink)] transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleClientSubmit} className="space-y-4">
                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {language === 'en' ? 'Display Name' : 'Имя пользователя'}
                  </label>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder={language === 'en' ? 'e.g. John Doe' : 'Например, Иван Иванов'}
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>

                {/* Email Address */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {language === 'en' ? 'Email Address' : 'Электронная почта'}
                  </label>
                  <input
                    type="email"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="e.g. johndoe@example.com"
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {language === 'en' ? 'Phone Number (Optional)' : 'Номер телефона (Необязательно)'}
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="e.g. +1 (555) 019-2834"
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                  />
                </div>

                {/* Balance (USD) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                    {language === 'en' ? 'Starting Balance (USD)' : 'Стартовый баланс (USD)'}
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min="0"
                      required
                      value={clientBalance}
                      onChange={(e) => setClientBalance(Number(e.target.value))}
                      className="w-full pl-9 pr-4 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
                    />
                  </div>
                </div>

                {/* Role selection - only super admin can modify role */}
                {isSuperAdmin && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-[var(--ink-dim)] uppercase block">
                      {language === 'en' ? 'Access Role' : 'Роль доступа'}
                    </label>
                    <select
                      value={clientRole}
                      onChange={(e) => setClientRole(e.target.value as 'user' | 'admin')}
                      className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono cursor-pointer"
                    >
                      <option value="user" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'User (Regular Client)' : 'Пользователь (Обычный клиент)'}</option>
                      <option value="admin" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">{language === 'en' ? 'Admin (Resort Manager)' : 'Администратор (Менеджер курорта)'}</option>
                    </select>
                  </div>
                )}

                {/* Instructor Status Toggle */}
                <div className="space-y-1.5 flex items-center gap-2 pt-1 pb-1">
                  <input
                    type="checkbox"
                    id="clientIsInstructorCheckbox"
                    checked={clientIsInstructor}
                    onChange={(e) => {
                      setClientIsInstructor(e.target.checked);
                    }}
                    className="w-4 h-4 border border-[var(--border)] bg-transparent focus:outline-none cursor-pointer accent-indigo-600 rounded-none shrink-0"
                  />
                  <label htmlFor="clientIsInstructorCheckbox" className="text-xs font-mono text-[var(--ink)] cursor-pointer select-none">
                    {language === 'en' ? 'Instructor Status (Grants panel access)' : 'Статус инструктора (Доступ к панели)'}
                  </label>
                </div>

                {/* Client Access Toggle */}
                <div className="space-y-1.5 flex items-center gap-2 pt-1 pb-1">
                  <input
                    type="checkbox"
                    id="clientIsActiveCheckbox"
                    checked={clientIsActive}
                    onChange={(e) => setClientIsActive(e.target.checked)}
                    className="w-4 h-4 border border-[var(--border)] bg-transparent focus:outline-none cursor-pointer accent-emerald-600 rounded-none shrink-0"
                  />
                  <label htmlFor="clientIsActiveCheckbox" className="text-xs font-mono text-[var(--ink)] cursor-pointer select-none">
                    {language === 'en' ? 'Cabinet Access Enabled' : 'Доступ к кабинету включен'}
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmittingClient}
                  className="w-full py-2.5 px-4 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 font-mono"
                >
                  {isSubmittingClient ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingClient ? (language === 'en' ? 'Update Profile' : 'Обновить профиль') : (language === 'en' ? 'Create Client' : 'Создать клиента')}
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* 🎓 Courses Database Management */}
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
              <BookOpenCheck className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
              {language === 'en' ? 'Courses Database Management' : 'Управление базой курсов'}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {language === 'en' 
                ? 'Create, edit, and delete intensive group courses, track seat availability, and manage prices' 
                : 'Создание, редактирование и удаление интенсивных групповых курсов, отслеживание свободных мест и цен'}
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
                {language === 'en' ? 'Close Form' : 'Закрыть форму'}
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                {language === 'en' ? 'Add Course' : 'Добавить курс'}
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
                    <th className="px-4 py-3 font-bold w-[60px]">{language === 'en' ? 'Image' : 'Фон'}</th>
                    <th className="px-4 py-3 font-bold">{language === 'en' ? 'Course Title' : 'Название'}</th>
                    <th className="px-4 py-3 font-bold w-[120px]">{language === 'en' ? 'Duration' : 'Продолжительность'}</th>
                    <th className="px-4 py-3 font-bold w-[140px]">{language === 'en' ? 'Dates' : 'Даты проведения'}</th>
                    <th className="px-4 py-3 font-bold w-[100px]">{language === 'en' ? 'Seats' : 'Места'}</th>
                    <th className="px-4 py-3 font-bold w-[80px]">{language === 'en' ? 'Price' : 'Цена'}</th>
                    <th className="px-4 py-3 font-bold w-[80px] text-center">{language === 'en' ? 'Order' : 'Порядок'}</th>
                    <th className="px-4 py-3 font-bold w-[90px] text-right">{language === 'en' ? 'Actions' : 'Действия'}</th>
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
                              {course.isHidden && (
                                <span className="bg-rose-950/20 text-rose-400 border border-rose-900/50 text-[8px] font-bold px-1.5 py-0.5 uppercase tracking-wide rounded-none shrink-0">
                                  {language === 'en' ? 'Hidden' : 'Скрыт'}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[var(--ink-dim)] line-clamp-1 mt-0.5">{translatedCourse.description}</span>
                            
                            {course.instructorIds && course.instructorIds.length > 0 && (
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className="text-[9px] text-[var(--ink-dim)] uppercase tracking-wider">{language === 'en' ? 'Instructors:' : 'Инструкторы:'}</span>
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
                                    <span className="font-bold text-[8px] uppercase tracking-wider block">{language === 'en' ? 'Enrolled:' : 'Записаны:'}</span>
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
                                title={language === 'en' ? 'Move Up' : 'Переместить вверх'}
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
                                title={language === 'en' ? 'Move Down' : 'Переместить вниз'}
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
                                      language === 'en' ? 'Course Updated' : 'Курс обновлен',
                                      language === 'en' 
                                        ? `Course "${translatedCourse.title}" is now ${!course.isHidden ? 'hidden' : 'visible'}.` 
                                        : `Курс «${translatedCourse.title}» теперь ${!course.isHidden ? 'скрыт' : 'виден всем'}.`
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
                                    ? (language === 'en' ? 'Show course' : 'Показать курс') 
                                    : (language === 'en' ? 'Hide course' : 'Скрыть курс')
                                }
                              >
                                {course.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => startEditCourse(course)}
                                className="p-1.5 text-[var(--ink-dim)] hover:text-[var(--ink)] hover:border-[var(--ink)] border border-transparent rounded-none transition cursor-pointer"
                                title={language === 'en' ? 'Edit course' : 'Редактировать курс'}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteCourseClick(course)}
                                className="p-1.5 text-rose-500 hover:text-rose-600 hover:border-rose-500/30 border border-transparent rounded-none transition cursor-pointer"
                                title={language === 'en' ? 'Delete course' : 'Удалить курс'}
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
                        {language === 'en' ? 'No intensive courses found.' : 'Интенсивные курсы не найдены.'}
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
                  {editingCourse ? (language === 'en' ? 'Edit Course' : 'Редактирование курса') : (language === 'en' ? 'New Course' : 'Создать новый курс')}
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
                    {language === 'en' ? 'Course Title' : 'Название курса'}
                  </label>
                  <input
                    type="text"
                    required
                    value={courseTitle}
                    onChange={(e) => setCourseTitle(e.target.value)}
                    placeholder={language === 'en' ? 'e.g. Carving Mastery Pro' : 'Например, Искусство карвинга'}
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                  />
                </div>

                {/* Duration */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                    {language === 'en' ? 'Duration Description' : 'Продолжительность'}
                  </label>
                  <input
                    type="text"
                    required
                    value={courseDuration}
                    onChange={(e) => setCourseDuration(e.target.value)}
                    placeholder={language === 'en' ? 'e.g. 3 Days (12 Hours)' : 'Например, 3 дня (12 часов)'}
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none"
                  />
                </div>

                {/* Dates & Calendar Selection */}
                <div className="space-y-2">
                  <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                    {language === 'en' ? 'Dates & Time of Course' : 'Даты и время проведения курса'}
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
                        placeholder={language === 'en' ? 'Click to open calendar' : 'Нажмите для выбора дат'}
                      />
                      <Calendar className="absolute right-3 top-2.5 w-4.5 h-4.5 text-[var(--ink-dim)] pointer-events-none" />
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => setShowCalendarPopover(!showCalendarPopover)}
                      className="px-3 py-2 border border-[var(--border)] text-xs text-[var(--ink)] hover:border-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition rounded-none font-mono font-bold"
                    >
                      {showCalendarPopover ? (language === 'en' ? 'Close' : 'Закрыть') : (language === 'en' ? 'Calendar' : 'Календарь')}
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
                        {language === 'en' 
                          ? 'Click start date, then click end date to set range.' 
                          : 'Выберите сначала дату начала, а затем дату окончания.'}
                      </div>

                      {/* Time Slot Customizer within calendar panel */}
                      <div className="border-t border-[var(--border)] pt-3 space-y-3">
                        <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold block flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {language === 'en' ? 'Daily Hours' : 'Ежедневные часы занятий'}
                        </span>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] text-[var(--ink-dim)] block">
                              {language === 'en' ? 'Start' : 'Начало'}
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
                              {language === 'en' ? 'End' : 'Окончание'}
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
                    {language === 'en' ? 'Description' : 'Описание курса'}
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={courseDescription}
                    onChange={(e) => setCourseDescription(e.target.value)}
                    placeholder={language === 'en' ? 'What will students learn?' : 'Чему научатся студенты?'}
                    className="w-full px-3.5 py-2 border border-[var(--border)] bg-transparent text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none resize-none leading-relaxed"
                  />
                </div>

                {/* Grid for Seats & Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-[var(--ink-dim)] uppercase block">
                      {language === 'en' ? 'Total Seats' : 'Всего мест'}
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
                      {language === 'en' ? 'Price (USD)' : 'Стоимость (USD)'}
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
                    {language === 'en' ? 'Background Image URL' : 'Ссылка на картинку фона'}
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
                        {language === 'en' ? 'Drag and drop or Click to upload background photo' : 'Перетащите или нажмите для загрузки фона'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Instructor Assignment */}
                <div className="space-y-2">
                  <label className="text-[10px] text-[var(--ink-dim)] uppercase block font-bold">
                    {language === 'en' ? 'Assigned Instructors (Choose 1 or 2)' : 'Закрепленные инструкторы (Выберите 1 или 2)'}
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
                              {ins.specialty === 'both' ? (language === 'en' ? 'Ski/Snb' : 'Лыжи/Снб') : (ins.specialty === 'ski' ? (language === 'en' ? 'Ski' : 'Лыжи') : (language === 'en' ? 'Snb' : 'Сноуборд'))}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-[var(--ink-dim)] italic">
                    {language === 'en' 
                      ? '* Click to select/deselect guides (maximum 2, minimum 1).' 
                      : '* Нажмите, чтобы выбрать/убрать гида (минимум 1, максимум 2).'}
                  </p>
                </div>

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
                    {language === 'en' ? 'Hide course from users' : 'Скрыть курс от пользователей'}
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
                      {editingCourse ? (language === 'en' ? 'Update Course' : 'Обновить курс') : (language === 'en' ? 'Create Course' : 'Создать курс')}
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Administrator Management Section */}
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
              {language === 'en' ? 'Administrator Role Management' : 'Управление администраторами курорта'}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {language === 'en' ? 'Add, search, and remove administrative privileges for personnel' : 'Добавление, поиск и удаление административных прав сотрудников'}
            </p>
          </div>
        </div>

        {/* SuperAdmin lock banner */}
        {!isSuperAdmin && (
          <div className="border border-[var(--border)] bg-black/5 dark:bg-white/5 text-[var(--ink)] p-4 text-xs font-mono flex items-start gap-2.5 rounded-none">
            <Shield className="w-4 h-4 shrink-0 mt-0.5 text-[var(--ink-dim)]" />
            <div>
              <p className="font-bold">
                {language === 'en' ? 'Super Administrator Access Required' : 'Требуется доступ Главного Администратора'}
              </p>
              <p className="mt-1 text-[var(--ink-dim)] leading-relaxed">
                {language === 'en' 
                  ? 'Only the system owner (gerasimchuk.arseniy@gmail.com) is authorized to promote or demote other administrators.'
                  : 'Только владелец системы (gerasimchuk.arseniy@gmail.com) имеет право назначать и снимать других администраторов.'}
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-6 w-full min-w-0 overflow-hidden">
          {/* Left Column: Active Administrators */}
          <div className="lg:col-span-6 space-y-3 font-mono w-full min-w-0 overflow-hidden">
            <h4 className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
              {language === 'en' ? 'Current Administrators' : 'Действующие администраторы'}
            </h4>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {usersList.filter(u => u.role === 'admin').length === 0 ? (
                <div className="text-center py-6 border border-dashed border-[var(--border)] rounded-none text-xs text-[var(--ink-dim)]">
                  {language === 'en' ? 'No other administrators found.' : 'Другие администраторы не найдены.'}
                </div>
              ) : (
                usersList.filter(u => u.role === 'admin').map((u) => (
                  <div key={u.uid} className="flex items-center justify-between p-3.5 border border-[var(--border)] bg-transparent transition rounded-none w-full min-w-0 overflow-hidden gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img 
                        src={u.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.uid}`} 
                        referrerPolicy="no-referrer"
                        alt={u.displayName} 
                        className="w-9 h-9 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)] shrink-0" 
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[var(--ink)] block truncate">{u.displayName || 'Unnamed User'}</span>
                        <span className="text-[10px] text-[var(--ink-dim)] block leading-none mt-1 truncate">{u.email}</span>
                      </div>
                    </div>
                    {onUpdateUserRole && (
                      <button
                        disabled={!isSuperAdmin}
                        onClick={async () => {
                          if (!isSuperAdmin) return;
                          const confirmMsg = language === 'en'
                            ? `Are you sure you want to remove admin privileges from ${u.email}?`
                            : `Вы уверены, что хотите снять права администратора с ${u.email}?`;
                          setConfirmModal({
                            message: confirmMsg,
                            onConfirm: async () => {
                              try {
                                await onUpdateUserRole(u.uid, 'user');
                              } catch (e) {
                                // error is handled inside App.tsx
                              }
                            }
                          });
                        }}
                        className={`p-1.5 border border-transparent rounded-none transition ${!isSuperAdmin ? 'opacity-30 cursor-not-allowed' : 'text-rose-500 hover:border-rose-500/30 cursor-pointer'}`}
                        title={language === 'en' ? 'Revoke Admin' : 'Снять статус админа'}
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Search & Promote Users */}
          <div className="lg:col-span-6 space-y-4 border border-[var(--border)] p-5 rounded-none bg-transparent w-full min-w-0 overflow-hidden">
            <div className="space-y-1 font-mono">
              <h4 className="text-xs font-bold text-[var(--ink)]">
                {language === 'en' ? 'Appoint New Administrator' : 'Назначить нового администратора'}
              </h4>
              <p className="text-[10px] text-[var(--ink-dim)]">
                {language === 'en' ? 'Search for any registered user to promote them to admin.' : 'Найдите любого зарегистрированного пользователя, чтобы повысить его до администратора.'}
              </p>
            </div>

            {/* Quick Add Form by Email */}
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newAdminEmail.trim() || !onUpdateUserRole || !isSuperAdmin) return;
                setIsPromoting(true);
                const matchedUser = usersList.find(u => u.email.toLowerCase() === newAdminEmail.trim().toLowerCase());
                if (matchedUser) {
                  try {
                    await onUpdateUserRole(matchedUser.uid, 'admin');
                    setNewAdminEmail('');
                  } catch (err) {
                    // Handled inside App.tsx
                  }
                } else {
                  addNotification(
                    'error',
                    language === 'en' ? 'User Not Found' : 'Пользователь не найден',
                    language === 'en' 
                      ? 'The user with this email must be registered and have signed in at least once.' 
                      : 'Пользователь с такой почтой должен зарегистрироваться и зайти в систему хотя бы раз.'
                  );
                }
                setIsPromoting(false);
              }}
              className="flex flex-col sm:flex-row gap-2 font-mono w-full"
            >
              <input
                type="email"
                required
                disabled={!isSuperAdmin}
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder={language === 'en' ? "Enter user's email address" : "Введите email пользователя"}
                className={`flex-1 px-3 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none ${!isSuperAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <button
                type="submit"
                disabled={isPromoting || !isSuperAdmin}
                  className="py-2 px-3 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] rounded-none text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isPromoting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    {language === 'en' ? 'Promote' : 'Назначить'}
                  </>
                )}
              </button>
            </form>

            <div className="border-t border-[var(--border)] pt-3 space-y-2 font-mono">
              <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider block">
                {language === 'en' ? 'Quick Search & Select' : 'Быстрый поиск и выбор'}
              </span>
              
              {/* User search box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={userSearchText}
                  onChange={(e) => setUserSearchText(e.target.value)}
                  placeholder={language === 'en' ? 'Filter by name or email...' : 'Поиск по имени или почте...'}
                  className={`w-full pl-9 pr-3 py-1.5 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none placeholder-[var(--ink-dim)] ${!isSuperAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>

              {/* Quick List */}
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {usersList
                  .filter(u => u.role !== 'admin')
                  .filter(u => {
                    if (!userSearchText) return true;
                    const search = userSearchText.toLowerCase();
                    return (
                      (u.displayName || '').toLowerCase().includes(search) ||
                      (u.email || '').toLowerCase().includes(search)
                    );
                  })
                  .slice(0, 10)
                  .map(u => (
                    <div key={u.uid} className="flex items-center justify-between p-2 hover:bg-black/5 dark:hover:bg-white/5 transition border border-transparent hover:border-[var(--border)] rounded-none w-full min-w-0 overflow-hidden gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img 
                          src={u.avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${u.uid}`} 
                          referrerPolicy="no-referrer"
                          alt={u.displayName} 
                          className="w-7 h-7 rounded-none bg-black/5 dark:bg-white/5 border border-[var(--border)] shrink-0" 
                        />
                        <div className="leading-tight min-w-0">
                          <span className="text-[11px] font-bold text-[var(--ink)] block truncate">{u.displayName || 'User'}</span>
                          <span className="text-[9px] text-[var(--ink-dim)] block truncate">{u.email}</span>
                        </div>
                      </div>
                      {onUpdateUserRole && (
                        <button
                          disabled={!isSuperAdmin}
                          onClick={async () => {
                            if (!isSuperAdmin || !onUpdateUserRole) return;
                            try {
                              await onUpdateUserRole(u.uid, 'admin');
                            } catch (e) {
                              // error is handled inside App.tsx
                            }
                          }}
                          className="px-2 py-1 border border-[var(--border)] hover:bg-[var(--ink)] hover:text-[var(--bg)] bg-transparent text-[var(--ink)] text-[10px] font-bold rounded-none transition disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {language === 'en' ? 'Make Admin' : 'Сделать админом'}
                        </button>
                      )}
                    </div>
                  ))}
                {usersList.filter(u => u.role !== 'admin').length === 0 && (
                  <div className="text-center py-4 text-[10px] text-[var(--ink-dim)]">
                    {language === 'en' ? 'No registered regular users.' : 'Нет зарегистрированных обычных пользователей.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ⚠️ Error Logs Section */}
      <div className="border border-[var(--border)] p-6 bg-transparent space-y-6 transition-colors duration-300 w-full min-w-0 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-light text-[var(--ink)] flex items-center gap-2">
              <AlertTriangle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
              {language === 'en' ? 'System Error Logs' : 'Логи системных ошибок'}
            </h3>
            <p className="text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider mt-1.5 leading-relaxed">
              {language === 'en' 
                ? 'Review unhandled rejections, window exceptions, and Firestore permission errors' 
                : 'Просмотр необработанных отклонений промисов, исключений и ошибок доступа Firestore'}
            </p>
          </div>
          {errorLogs.length > 0 && (
            <button
              onClick={handleClearAllLogs}
              className="py-1.5 px-3 border border-rose-900/40 hover:border-rose-500 text-rose-500 hover:bg-rose-950/10 rounded-none text-xs flex items-center gap-1.5 transition cursor-pointer font-mono"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {language === 'en' ? 'Clear All Logs' : 'Очистить все логи'}
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--ink-dim)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder={language === 'en' ? 'Search logs by message, email, url...' : 'Поиск по сообщению, email, url...'}
              className="w-full pl-9 pr-3 py-2 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none placeholder-[var(--ink-dim)] font-mono"
            />
          </div>

          <div>
            <select
              value={logSourceFilter}
              onChange={(e) => setLogSourceFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none font-mono"
            >
              <option value="all">{language === 'en' ? 'All Sources' : 'Все источники'}</option>
              <option value="firestore">Firestore</option>
              <option value="global_error">{language === 'en' ? 'Global Window Error' : 'Глобальная ошибка'}</option>
              <option value="unhandled_rejection">{language === 'en' ? 'Unhandled Promise Rejection' : 'Необработанный промис'}</option>
              <option value="custom">Custom Logs</option>
            </select>
          </div>
          
          <div className="flex items-center text-xs text-[var(--ink-dim)] font-mono justify-end">
            {language === 'en' 
              ? `Showing ${filteredLogs.length} of ${errorLogs.length} logs` 
              : `Показано ${filteredLogs.length} из ${errorLogs.length} логов`}
          </div>
        </div>

        {/* Logs Table / List */}
        {errorLogsLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-[var(--ink-dim)] gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--ink)]" />
            <span className="text-[10px] font-mono uppercase tracking-wider">{language === 'en' ? 'Loading error logs...' : 'Загрузка логов ошибок...'}</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="border border-[var(--border)] border-dashed p-12 text-center text-xs text-[var(--ink-dim)] font-mono">
            {language === 'en' ? 'No error logs found matching filters.' : 'Логи ошибок по заданным фильтрам не найдены.'}
          </div>
        ) : (
          <div className="border border-[var(--border)] divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto w-full">
            {filteredLogs.map((log) => (
              <div 
                key={log.id} 
                className={`p-4 transition hover:bg-black/5 dark:hover:bg-white/5 flex flex-col gap-2 cursor-pointer w-full text-left font-mono text-[11px] ${selectedLog?.id === log.id ? 'bg-black/10 dark:bg-white/10 border-l-2 border-rose-500' : ''}`}
                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider rounded-none shrink-0 ${
                      log.source === 'firestore' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-250/45 dark:border-amber-900/60' :
                      log.source === 'global_error' ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-250/45 dark:border-rose-900/60' :
                      'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-250/45 dark:border-purple-900/60'
                    }`}>
                      {log.source}
                    </span>
                    <span className="text-[var(--ink-dim)] text-[9px] shrink-0">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteLog(log.id);
                    }}
                    className="text-[var(--ink-dim)] hover:text-rose-500 p-1 transition cursor-pointer"
                    title={language === 'en' ? 'Delete log' : 'Удалить лог'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="font-semibold text-rose-600 dark:text-rose-400 break-words line-clamp-2 leading-relaxed">
                  {log.message}
                </div>

                <div className="text-[10px] text-[var(--ink-dim)] flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t border-[var(--border)] border-dashed">
                  <div>
                    <span className="font-bold">{language === 'en' ? 'User:' : 'Пользователь:'}</span> {log.userEmail || 'anonymous'}
                  </div>
                  <div className="truncate max-w-xs md:max-w-md lg:max-w-xl">
                    <span className="font-bold">URL:</span> {log.url}
                  </div>
                  {log.operation && (
                    <div>
                      <span className="font-bold">{language === 'en' ? 'Op:' : 'Оп:'}</span> {log.operation}
                    </div>
                  )}
                  {log.path && (
                    <div className="truncate max-w-xs">
                      <span className="font-bold">{language === 'en' ? 'Path:' : 'Путь:'}</span> {log.path}
                    </div>
                  )}
                </div>

                {/* Details stack trace */}
                {selectedLog?.id === log.id && (
                  <div className="mt-3 p-3 bg-black/10 dark:bg-white/5 border border-[var(--border)] rounded-none space-y-3 animate-fade-in text-[10px] overflow-x-auto select-text">
                    {log.stack && (
                      <div className="space-y-1">
                        <span className="font-bold text-[var(--ink)] uppercase tracking-wider text-[9px] block">
                          {language === 'en' ? 'Stack Trace:' : 'Трассировка стека:'}
                        </span>
                        <pre className="whitespace-pre font-mono leading-relaxed text-rose-500/90 dark:text-rose-450 text-[9px] overflow-x-auto max-h-[200px] overflow-y-auto">
                          {log.stack}
                        </pre>
                      </div>
                    )}
                    <div className="space-y-1">
                      <span className="font-bold text-[var(--ink)] uppercase tracking-wider text-[9px] block">
                        {language === 'en' ? 'Client Environment details:' : 'Детали окружения клиента:'}
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[9px] leading-relaxed text-[var(--ink-dim)]">
                        <div><span className="font-bold text-[var(--ink)]">User Agent:</span> {log.userAgent}</div>
                        <div><span className="font-bold text-[var(--ink)]">Full URL:</span> {log.url}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmModal && createPortal(
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-55 p-4 animate-fade-in">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-sm p-6 shadow-2xl relative space-y-4 animate-scale-up">
            <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
              <Shield className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
              {language === 'en' ? 'Confirm Action' : 'Подтверждение'}
            </h4>
            <p className="text-xs text-[var(--ink-dim)] leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
              >
                {language === 'en' ? 'Cancel' : 'Отмена'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const action = confirmModal.onConfirm;
                  setConfirmModal(null);
                  await action();
                }}
                className="flex-1 py-2 px-4 border border-[var(--border)] bg-[var(--ink)] hover:bg-transparent text-[var(--bg)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
              >
                {language === 'en' ? 'Confirm' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedChatBooking && (
        <BookingChatModal
          booking={selectedChatBooking}
          currentUserProfile={adminProfile}
          onClose={() => setSelectedChatBooking(null)}
          instructors={instructors}
          usersList={usersList}
        />
      )}
    </div>
  );
};


