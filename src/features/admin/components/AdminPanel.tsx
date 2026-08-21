import React, { useCallback, useState, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Instructor, Booking, UserProfile, Course } from '../../../types';
import {
  Shield,
  Calendar,
  Users,
  Clock,
  UserCheck,
  BookOpen,
  AlertTriangle,
  ArrowLeftRight,
  Wallet,
} from 'lucide-react';
import { useLanguage, useTranslatedBookings } from '../../../app/providers/LanguageContext';
import { SkillConfig } from '../../../domain/achievements';
import { AchievementsConfig } from '../../../domain/achievements';
import { AdminCollapsibleSection } from './settings';
import { TableSkeleton } from '../../../ui/Skeleton';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';
import { ADMIN_TAB_QUERY_KEY, parseAdminTabId, type AdminTabId } from '../adminNavigation';
import { AdminTabNav } from './AdminTabNav';

const FinancialOverview = lazy(() =>
  import('./finance').then((m) => ({
    default: m.FinancialOverview,
  }))
);
const CashFlowPanel = lazy(() =>
  import('./finance').then((m) => ({
    default: m.CashFlowPanel,
  }))
);
const GuestWalletPanel = lazy(() =>
  import('./finance').then((m) => ({
    default: m.GuestWalletPanel,
  }))
);
const AdminSystemSettings = lazy(() =>
  import('./settings').then((m) => ({
    default: m.AdminSystemSettings,
  }))
);
const AdminProductSettings = lazy(() =>
  import('./settings').then((m) => ({
    default: m.AdminProductSettings,
  }))
);
const ScheduleCalendar = lazy(() =>
  import('./schedule').then((m) => ({
    default: m.ScheduleCalendar,
  }))
);
const BookingsLog = lazy(() =>
  import('./bookings').then((m) => ({
    default: m.BookingsLog,
  }))
);
const ClientsManager = lazy(() =>
  import('./users').then((m) => ({
    default: m.ClientsManager,
  }))
);
const CoachesManager = lazy(() =>
  import('./users').then((m) => ({
    default: m.CoachesManager,
  }))
);
const CoursesManager = lazy(() =>
  import('./courses').then((m) => ({
    default: m.CoursesManager,
  }))
);
const AdminRoleManager = lazy(() =>
  import('./users').then((m) => ({
    default: m.AdminRoleManager,
  }))
);
const ErrorLogsPanel = lazy(() =>
  import('./settings').then((m) => ({
    default: m.ErrorLogsPanel,
  }))
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
    newTime?: string,
    options?: { allowNegativeBalance?: boolean }
  ) => Promise<void>;
  onDeleteBooking?: (id: string) => Promise<void>;
  onAddBooking?: (booking: Booking) => Promise<void>;
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  notificationRetentionDays?: number;
  onSetNotificationRetentionDays?: (days: number) => Promise<void>;
  starterCreditUsd?: number;
  onSetStarterCreditUsd?: (amount: number) => Promise<void>;
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
  ) => Promise<import('../../../features/admin/clearStudentBookings').ClearStudentBookingsResult>;
  onClearCancelledBookings?: (
    onProgress?: (deleted: number) => void
  ) => Promise<import('../../../features/admin/clearStudentBookings').ClearCancelledBookingsResult>;
  onResetSchoolFinances?: (
    onProgress?: (step: number) => void
  ) => Promise<import('../../../features/admin/resetSchoolFinances').ResetSchoolFinancesResult>;
  bookingsHasMore?: boolean;
  onLoadMoreBookings?: () => void;
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
  notificationRetentionDays,
  onSetNotificationRetentionDays,
  starterCreditUsd,
  onSetStarterCreditUsd,
  skillConfig,
  onUpdateSkillConfig,
  achievementsConfig,
  onUpdateAchievementsConfig,
  onClearStudentBookings,
  onClearCancelledBookings,
  onResetSchoolFinances,
  bookingsHasMore = false,
  onLoadMoreBookings,
}) => {
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseAdminTabId(searchParams.get(ADMIN_TAB_QUERY_KEY));

  const setActiveTab = useCallback(
    (tab: AdminTabId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(ADMIN_TAB_QUERY_KEY, tab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

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
      <Suspense fallback={<SectionLoadingFallback label={t('financialOverview')} />}>
        <FinancialOverview
          totalRevenue={totalRevenue}
          activeBookings={activeBookings}
          completedBookings={completedBookings}
          instructorsCount={instructors.length}
        />
      </Suspense>

      <AdminTabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'operations' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('scheduleBoardTitle')} />}>
            <AdminCollapsibleSection
              id="schedule_calendar"
              title={t('scheduleBoardTitle')}
              subtitle={t('scheduleBoardSub')}
              icon={Calendar}
              defaultOpen
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

          <Suspense fallback={<SectionLoadingFallback label={t('bookingsLogTitle')} />}>
            <AdminCollapsibleSection
              id="bookings_log"
              title={t('bookingsLogTitle')}
              subtitle={t('bookingsLogSub')}
              icon={Clock}
              badge={activeBookings}
              defaultOpen={false}
            >
              <BookingsLog
                bookings={bookings}
                hasMoreBookings={bookingsHasMore}
                onLoadMoreBookings={onLoadMoreBookings}
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
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('guestWalletPanelTitle')} />}>
            <AdminCollapsibleSection
              id="school_guest_wallet"
              title={t('guestWalletPanelTitle')}
              subtitle={t('guestWalletPanelSub')}
              icon={Wallet}
              defaultOpen
            >
              <GuestWalletPanel />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('cashFlowTitle')} />}>
            <AdminCollapsibleSection
              id="school_cash_flow"
              title={t('cashFlowTitle')}
              subtitle={t('cashFlowSub')}
              icon={ArrowLeftRight}
              defaultOpen
            >
              <CashFlowPanel usersList={usersList} />
            </AdminCollapsibleSection>
          </Suspense>
        </div>
      )}

      {activeTab === 'people' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('clientsManagerTitle')} />}>
            <AdminCollapsibleSection
              id="clients_manager"
              title={t('clientsManagerTitle')}
              subtitle={t('clientsManagerSub')}
              icon={UserCheck}
              badge={usersList.length}
              defaultOpen
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

          <Suspense fallback={<SectionLoadingFallback label={t('coachesDirectoryTitle')} />}>
            <AdminCollapsibleSection
              id="coaches_manager"
              title={t('coachesDirectoryTitle')}
              subtitle={t('coachesDirectorySub')}
              icon={Users}
              badge={instructors.length}
              defaultOpen={false}
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

          <Suspense fallback={<SectionLoadingFallback label={t('adminRoleManagementTitle')} />}>
            <AdminCollapsibleSection
              id="admin_role_manager"
              title={t('adminRoleManagementTitle')}
              subtitle={t('adminRoleManagementSub')}
              icon={Shield}
              defaultOpen={false}
            >
              <AdminRoleManager
                usersList={usersList}
                currentUserProfile={currentUserProfile}
                onUpdateUserRole={onUpdateUserRole}
                onRequestConfirm={onRequestConfirm}
              />
            </AdminCollapsibleSection>
          </Suspense>
        </div>
      )}

      {activeTab === 'product' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('coursesManagerTitle')} />}>
            <AdminCollapsibleSection
              id="courses_manager"
              title={t('coursesManagerTitle')}
              subtitle={t('coursesManagerSub')}
              icon={BookOpen}
              badge={courses.length}
              defaultOpen
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

          <Suspense fallback={<SectionLoadingFallback label={t('adminTabProduct')} />}>
            <AdminProductSettings />
          </Suspense>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('systemSettingsTitle')} />}>
            <AdminSystemSettings
              filtersEnabled={filtersEnabled}
              onToggleFilters={onToggleFilters}
              notificationRetentionDays={notificationRetentionDays}
              onSetNotificationRetentionDays={onSetNotificationRetentionDays}
              starterCreditUsd={starterCreditUsd}
              onSetStarterCreditUsd={onSetStarterCreditUsd}
              skillConfig={skillConfig}
              onUpdateSkillConfig={onUpdateSkillConfig}
              achievementsConfig={achievementsConfig}
              onUpdateAchievementsConfig={onUpdateAchievementsConfig}
              bookings={bookings}
              onRequestConfirm={onRequestConfirm}
              onClearStudentBookings={onClearStudentBookings}
              onClearCancelledBookings={onClearCancelledBookings}
              onResetSchoolFinances={onResetSchoolFinances}
            />
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('errorLogsTitle')} />}>
            <AdminCollapsibleSection
              id="error_logs"
              title={t('errorLogsTitle')}
              subtitle={t('errorLogsSub')}
              icon={AlertTriangle}
              defaultOpen={false}
            >
              <ErrorLogsPanel onRequestConfirm={onRequestConfirm} />
            </AdminCollapsibleSection>
          </Suspense>
        </div>
      )}

      {confirmModal &&
        createPortal(
          <div className="ui-modal-overlay fixed inset-0 z-55 flex items-center justify-center p-4 animate-fade-in">
            <BodyScrollLock />
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
