import React, { useState, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Instructor, Booking, UserProfile, Course } from '../types';
import {
  Shield,
  Calendar,
  Users,
  Clock,
  UserCheck,
  BookOpen,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useLanguage, useTranslatedBookings } from '../lib/LanguageContext';
import { SkillConfig } from '../lib/skillData';
import { AdminCollapsibleSection } from './admin/AdminCollapsibleSection';

// Lazy loading heavy admin tab modules
const FinancialOverview = lazy(() =>
  import('./admin/FinancialOverview').then((m) => ({ default: m.FinancialOverview }))
);
const SystemSettings = lazy(() =>
  import('./admin/SystemSettings').then((m) => ({ default: m.SystemSettings }))
);
const ScheduleCalendar = lazy(() =>
  import('./admin/ScheduleCalendar').then((m) => ({ default: m.ScheduleCalendar }))
);
const BookingsLog = lazy(() =>
  import('./admin/BookingsLog').then((m) => ({ default: m.BookingsLog }))
);
const ClientsManager = lazy(() =>
  import('./admin/ClientsManager').then((m) => ({ default: m.ClientsManager }))
);
const CoachesManager = lazy(() =>
  import('./admin/CoachesManager').then((m) => ({ default: m.CoachesManager }))
);
const CoursesManager = lazy(() =>
  import('./admin/CoursesManager').then((m) => ({ default: m.CoursesManager }))
);
const AdminRoleManager = lazy(() =>
  import('./admin/AdminRoleManager').then((m) => ({ default: m.AdminRoleManager }))
);
const ErrorLogsPanel = lazy(() =>
  import('./admin/ErrorLogsPanel').then((m) => ({ default: m.ErrorLogsPanel }))
);

const SectionLoadingFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center justify-center p-8 border border-[var(--border)] bg-black/5 dark:bg-white/5 text-[var(--ink-dim)]">
    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
    <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
  </div>
);

interface AdminPanelProps {
  instructors: Instructor[];
  bookings: Booking[];
  usersList?: UserProfile[];
  deletedCompletedStats?: { revenue: number; count: number };
  currentUserProfile: UserProfile;
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
  skillConfig?: SkillConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  instructors,
  bookings: rawBookings,
  usersList = [],
  courses = [],
  deletedCompletedStats = { revenue: 0, count: 0 },
  currentUserProfile,
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
  onToggleFilters,
  skillConfig,
  onUpdateSkillConfig,
}) => {
  const { t, language } = useLanguage();

  const bookings = useTranslatedBookings(rawBookings, courses, language, { syncCoursePrice: true });

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const adminProfile =
    usersList.find((user) => user.uid === currentUserProfile.uid) || currentUserProfile;

  const totalRevenue =
    bookings
      .filter(
        (b) =>
          (b.status === 'confirmed' || b.status === 'completed') &&
          !b.userId?.startsWith('system_block_') &&
          !b.isDeleted
      )
      .reduce((sum, b) => sum + b.totalPrice, 0) + (deletedCompletedStats?.revenue || 0);

  const activeBookings = bookings.filter(
    (b) => b.status === 'confirmed' && !b.userId?.startsWith('system_block_') && !b.isDeleted
  ).length;

  const completedBookings =
    bookings.filter(
      (b) => b.status === 'completed' && !b.userId?.startsWith('system_block_') && !b.isDeleted
    ).length + (deletedCompletedStats?.count || 0);

  const onRequestConfirm = (message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmModal({ message, onConfirm });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Financial KPI Summary Header */}
      <Suspense fallback={<SectionLoadingFallback label={t('financialOverview') || 'Финансовая сводка'} />}>
        <FinancialOverview
          totalRevenue={totalRevenue}
          activeBookings={activeBookings}
          completedBookings={completedBookings}
          instructorsCount={instructors.length}
        />
      </Suspense>

      {/* 1, 2, 3: System Settings (Skill Config Matrix, Resort Data, Slider Config) */}
      <Suspense fallback={<SectionLoadingFallback label={t('systemSettingsTitle') || 'Системные настройки'} />}>
        <SystemSettings
          filtersEnabled={filtersEnabled}
          onToggleFilters={onToggleFilters}
          skillConfig={skillConfig}
          onUpdateSkillConfig={onUpdateSkillConfig}
        />
      </Suspense>

      {/* 4. Интерактивный планер и расписание инструкторов */}
      <Suspense fallback={<SectionLoadingFallback label={t('scheduleBoardTitle') || 'Интерактивный планер'} />}>
        <AdminCollapsibleSection
          id="schedule_calendar"
          title={t('scheduleBoardTitle') || 'Интерактивный планер и расписание инструкторов'}
          subtitle={t('scheduleBoardSub') || 'Управление сеткой слотов, созданием и блокировкой времени'}
          icon={Calendar}
        >
          <ScheduleCalendar
            instructors={instructors}
            bookings={bookings}
            courses={courses}
            usersList={usersList}
            adminProfile={adminProfile}
            onAddBooking={onAddBooking}
            onRescheduleBooking={onRescheduleBooking}
            onDeleteBooking={onDeleteBooking}
            onCancelBooking={onCancelBooking}
            onCompleteBooking={onCompleteBooking}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 5. Управление базой инструкторов */}
      <Suspense fallback={<SectionLoadingFallback label={t('coachesDirectoryTitle') || 'База инструкторов'} />}>
        <AdminCollapsibleSection
          id="coaches_manager"
          title={t('coachesDirectoryTitle') || 'Управление базой инструкторов'}
          subtitle={t('coachesDirectorySub') || 'Список тренеров, добавление, редактирование и статус доступности'}
          icon={Users}
          badge={instructors.length}
        >
          <CoachesManager
            instructors={instructors}
            bookings={bookings}
            onAddInstructor={onAddInstructor}
            onUpdateInstructor={onUpdateInstructor}
            onDeleteInstructor={onDeleteInstructor}
            onRequestConfirm={onRequestConfirm}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 6. Монитор активных бронирований */}
      <Suspense fallback={<SectionLoadingFallback label={t('bookingsLogTitle') || 'Монитор бронирований'} />}>
        <AdminCollapsibleSection
          id="bookings_log"
          title={t('bookingsLogTitle') || 'Монитор активных бронирований'}
          subtitle={t('bookingsLogSub') || 'Журнал запросов, подтверждение, завершение и отмена занятий'}
          icon={Clock}
          badge={activeBookings}
        >
          <BookingsLog
            bookings={bookings}
            usersList={usersList}
            instructors={instructors}
            onConfirmBooking={onConfirmBooking}
            onCompleteBooking={onCompleteBooking}
            onCancelBooking={onCancelBooking}
            onRequestConfirm={onRequestConfirm}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 7. Управление базой клиентов */}
      <Suspense fallback={<SectionLoadingFallback label={t('clientsManagerTitle') || 'База клиентов'} />}>
        <AdminCollapsibleSection
          id="clients_manager"
          title={t('clientsManagerTitle') || 'Управление базой клиентов'}
          subtitle={t('clientsManagerSub') || 'Учет пользователей, балансы, назначение инструкторов и удаление'}
          icon={UserCheck}
          badge={usersList.length}
        >
          <ClientsManager
            usersList={usersList}
            instructors={instructors}
            currentUserProfile={currentUserProfile}
            onAddUser={onAddUser}
            onUpdateUser={onUpdateUser}
            onDeleteUser={onDeleteUser}
            onAddInstructor={onAddInstructor}
            onUpdateInstructor={onUpdateInstructor}
            onDeleteInstructor={onDeleteInstructor}
            onRequestConfirm={onRequestConfirm}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 8. Управление базой курсов */}
      <Suspense fallback={<SectionLoadingFallback label={t('coursesManagerTitle') || 'База курсов'} />}>
        <AdminCollapsibleSection
          id="courses_manager"
          title={t('coursesManagerTitle') || 'Управление базой курсов'}
          subtitle={t('coursesManagerSub') || 'Групповые программы, даты проведения, цены и описания'}
          icon={BookOpen}
          badge={courses.length}
        >
          <CoursesManager
            courses={courses}
            bookings={bookings}
            usersList={usersList}
            instructors={instructors}
            onAddCourse={onAddCourse}
            onUpdateCourse={onUpdateCourse}
            onDeleteCourse={onDeleteCourse}
            onRequestConfirm={onRequestConfirm}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 9. Управление администраторами курорта */}
      <Suspense fallback={<SectionLoadingFallback label={t('adminRoleManagementTitle') || 'Администраторы'} />}>
        <AdminCollapsibleSection
          id="admin_role_manager"
          title={t('adminRoleManagementTitle') || 'Управление администраторами курорта'}
          subtitle={t('adminRoleManagementSub') || 'Назначение прав администратора и управление ролями пользователей'}
          icon={Shield}
        >
          <AdminRoleManager
            usersList={usersList}
            currentUserProfile={currentUserProfile}
            onUpdateUserRole={onUpdateUserRole}
            onRequestConfirm={onRequestConfirm}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 10. Логи системных ошибок */}
      <Suspense fallback={<SectionLoadingFallback label={t('errorLogsTitle') || 'Логи ошибок'} />}>
        <AdminCollapsibleSection
          id="error_logs"
          title={t('errorLogsTitle') || 'Логи системных ошибок'}
          subtitle={t('errorLogsSub') || 'Мониторинг исключений, сетевых ошибок и журналов безопасности'}
          icon={AlertTriangle}
        >
          <ErrorLogsPanel onRequestConfirm={onRequestConfirm} />
        </AdminCollapsibleSection>
      </Suspense>

      {/* Confirmation modal portal */}
      {confirmModal &&
        createPortal(
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-55 p-4 animate-fade-in">
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-none w-full max-w-sm p-6 shadow-2xl relative space-y-4 animate-scale-up">
              <h4 className="font-serif text-sm font-light text-[var(--ink)] flex items-center gap-2">
                <Shield className="w-4.5 h-4.5 text-[var(--ink-dim)]" />
                {t('confirmAction')}
              </h4>
              <p className="text-xs text-[var(--ink-dim)] leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-2 px-4 border border-[var(--border)] bg-black/5 hover:border-[var(--ink)] hover:bg-black/10 text-[var(--ink-dim)] hover:text-[var(--ink)] rounded-none text-xs font-mono uppercase tracking-widest transition cursor-pointer text-center"
                >
                  {t('cancel')}
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
                  {t('confirm')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};