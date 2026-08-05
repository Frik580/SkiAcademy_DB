import React, { useState, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Instructor, Booking, UserProfile, Course } from '../types';
import { Shield, Calendar, Users, Clock, UserCheck, BookOpen, AlertTriangle } from 'lucide-react';
import { useLanguage, useTranslatedBookings } from '../lib/LanguageContext';
import { SkillConfig } from '../lib/skillData';
import { AchievementsConfig } from '../lib/achievementConfig';
import { DesignTheme } from '../lib/designTheme';
import { AdminCollapsibleSection } from './admin/AdminCollapsibleSection';
import { TableSkeleton } from './ui/Skeleton';

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
  <div className="space-y-3 p-4">
    <div className="flex items-center justify-between pb-2">
      <span className="font-mono text-xs uppercase tracking-wider text-[var(--ink-dim)]">
        {label}
      </span>
    </div>
    <TableSkeleton rows={5} cols={5} />
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
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onAddUser?: (user: UserProfile) => Promise<void>;
  onUpdateUser?: (user: UserProfile) => Promise<void>;
  onDeleteUser?: (uid: string) => Promise<void>;
  onRescheduleBooking?: (id: string, newDate: string, newTime: string) => Promise<void>;
  onReassignInstructor?: (
    id: string,
    newInstructor: Instructor,
    newDate?: string,
    newTime?: string
  ) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onAddBooking?: (booking: Booking) => Promise<void>;
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  onboardingEnabled?: boolean;
  onToggleOnboarding?: (enabled: boolean) => Promise<void>;
  notificationRetentionDays?: number;
  onSetNotificationRetentionDays?: (days: number) => Promise<void>;
  designTheme?: DesignTheme;
  onSetDesignTheme?: (theme: DesignTheme) => Promise<void>;
  courses?: Course[];
  onAddCourse?: (course: Course) => Promise<void>;
  onUpdateCourse?: (course: Course) => Promise<void>;
  onDeleteCourse?: (courseId: string) => Promise<void>;
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
  onUpdateAchievementsConfig?: (config: AchievementsConfig) => Promise<void>;
  onClearStudentBookings?: (
    onProgress?: (deleted: number) => void
  ) => Promise<import('../lib/clearStudentBookings').ClearStudentBookingsResult>;
  onClearCancelledBookings?: (
    onProgress?: (deleted: number) => void
  ) => Promise<import('../lib/clearStudentBookings').ClearCancelledBookingsResult>;
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
  onLinkGuestBooking,
  onCancelBooking,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onRescheduleBooking,
  onReassignInstructor,
  onDeleteBooking,
  onAddBooking,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  filtersEnabled = true,
  onToggleFilters,
  onboardingEnabled = true,
  onToggleOnboarding,
  notificationRetentionDays,
  onSetNotificationRetentionDays,
  designTheme = 'classic',
  onSetDesignTheme,
  skillConfig,
  onUpdateSkillConfig,
  achievementsConfig,
  onUpdateAchievementsConfig,
  onClearStudentBookings,
  onClearCancelledBookings,
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
      <Suspense fallback={<SectionLoadingFallback label={t('financialOverview')} />}>
        <FinancialOverview
          totalRevenue={totalRevenue}
          activeBookings={activeBookings}
          completedBookings={completedBookings}
          instructorsCount={instructors.length}
        />
      </Suspense>

      {/* 1, 2, 3: System Settings (Skill Config Matrix, Resort Data, Slider Config) */}
      <Suspense fallback={<SectionLoadingFallback label={t('systemSettingsTitle')} />}>
        <SystemSettings
          filtersEnabled={filtersEnabled}
          onToggleFilters={onToggleFilters}
          onboardingEnabled={onboardingEnabled}
          onToggleOnboarding={onToggleOnboarding}
          notificationRetentionDays={notificationRetentionDays}
          onSetNotificationRetentionDays={onSetNotificationRetentionDays}
          designTheme={designTheme}
          onSetDesignTheme={onSetDesignTheme}
          skillConfig={skillConfig}
          onUpdateSkillConfig={onUpdateSkillConfig}
          achievementsConfig={achievementsConfig}
          onUpdateAchievementsConfig={onUpdateAchievementsConfig}
          bookings={bookings}
          courses={courses}
          adminUid={currentUserProfile.uid}
          onRequestConfirm={onRequestConfirm}
          onClearStudentBookings={onClearStudentBookings}
          onClearCancelledBookings={onClearCancelledBookings}
        />
      </Suspense>

      {/* 4. Интерактивный планер и расписание инструкторов */}
      <Suspense fallback={<SectionLoadingFallback label={t('scheduleBoardTitle')} />}>
        <AdminCollapsibleSection
          id="schedule_calendar"
          title={t('scheduleBoardTitle')}
          subtitle={t('scheduleBoardSub')}
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
            onReassignInstructor={onReassignInstructor}
            onDeleteBooking={onDeleteBooking}
            onCancelBooking={onCancelBooking}
            onCompleteBooking={onCompleteBooking}
            onLinkGuestBooking={onLinkGuestBooking}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 5. Управление базой инструкторов */}
      <Suspense fallback={<SectionLoadingFallback label={t('coachesDirectoryTitle')} />}>
        <AdminCollapsibleSection
          id="coaches_manager"
          title={t('coachesDirectoryTitle')}
          subtitle={t('coachesDirectorySub')}
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
      <Suspense fallback={<SectionLoadingFallback label={t('bookingsLogTitle')} />}>
        <AdminCollapsibleSection
          id="bookings_log"
          title={t('bookingsLogTitle')}
          subtitle={t('bookingsLogSub')}
          icon={Clock}
          badge={activeBookings}
        >
          <BookingsLog
            bookings={bookings}
            usersList={usersList}
            instructors={instructors}
            onConfirmBooking={onConfirmBooking}
            onCompleteBooking={onCompleteBooking}
            onLinkGuestBooking={onLinkGuestBooking}
            onCancelBooking={onCancelBooking}
            onRequestConfirm={onRequestConfirm}
          />
        </AdminCollapsibleSection>
      </Suspense>

      {/* 7. Управление базой клиентов */}
      <Suspense fallback={<SectionLoadingFallback label={t('clientsManagerTitle')} />}>
        <AdminCollapsibleSection
          id="clients_manager"
          title={t('clientsManagerTitle')}
          subtitle={t('clientsManagerSub')}
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
      <Suspense fallback={<SectionLoadingFallback label={t('coursesManagerTitle')} />}>
        <AdminCollapsibleSection
          id="courses_manager"
          title={t('coursesManagerTitle')}
          subtitle={t('coursesManagerSub')}
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
      <Suspense fallback={<SectionLoadingFallback label={t('adminRoleManagementTitle')} />}>
        <AdminCollapsibleSection
          id="admin_role_manager"
          title={t('adminRoleManagementTitle')}
          subtitle={t('adminRoleManagementSub')}
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
      <Suspense fallback={<SectionLoadingFallback label={t('errorLogsTitle')} />}>
        <AdminCollapsibleSection
          id="error_logs"
          title={t('errorLogsTitle')}
          subtitle={t('errorLogsSub')}
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
              <p className="text-xs text-[var(--ink-dim)] leading-relaxed">
                {confirmModal.message}
              </p>
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
