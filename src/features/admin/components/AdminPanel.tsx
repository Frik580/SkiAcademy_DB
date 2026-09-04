import React, { useCallback, useState, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Instructor, Booking, UserProfile, Course } from '../../../types';
import { Shield, BookOpen, AlertTriangle, ShieldAlert, Wallet, CalendarDays, Users } from 'lucide-react';
import { useLanguage, useTranslatedBookings } from '../../../app/providers/LanguageContext';
import { SkillConfig } from '../../../domain/achievements';
import { AchievementsConfig } from '../../../domain/achievements';
import { AdminCollapsibleSection } from './settings';
import { TableSkeleton } from '../../../ui/Skeleton';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';
import { ADMIN_COURSE_ENROLLMENT_QUERY_KEY, ADMIN_FINANCE_ACCOUNT_QUERY_KEY, ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY, ADMIN_FINANCE_PAYMENT_QUERY_KEY, ADMIN_LESSON_BOOKING_QUERY_KEY, ADMIN_PLANNER_DATE_QUERY_KEY, ADMIN_PLANNER_FOCUS_QUERY_KEY, ADMIN_TAB_QUERY_KEY, parseAdminTabId, type AdminTabId } from '../adminNavigation';
import { AdminTabNav } from './AdminTabNav';

const CanonicalFinancePanel = lazy(() =>
  import('./finance').then((m) => ({
    default: m.CanonicalFinancePanel,
  }))
);
const CanonicalSchoolMovementPanel = lazy(() =>
  import('../finance/CanonicalSchoolMovementPanel').then((m) => ({
    default: m.CanonicalSchoolMovementPanel,
  }))
);
const AdminGuestFinanceHost = lazy(() =>
  import('../finance/AdminGuestFinanceHost').then((m) => ({
    default: m.AdminGuestFinanceHost,
  }))
);
const AdminFinancialOverviewHost = lazy(() =>
  import('../operations/AdminFinancialOverviewHost').then((m) => ({
    default: m.AdminFinancialOverviewHost,
  }))
);
const AdminPlannerBoard = lazy(() =>
  import('../operations/AdminPlannerBoard').then((m) => ({
    default: m.AdminPlannerBoard,
  }))
);
const AdminActiveBookingMonitor = lazy(() =>
  import('../operations/AdminActiveBookingMonitor').then((m) => ({
    default: m.AdminActiveBookingMonitor,
  }))
);
const AdminPeopleSection = lazy(() =>
  import('../people/AdminPeopleSection').then((m) => ({
    default: m.AdminPeopleSection,
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
const AdminLessonBookingPanel = lazy(() =>
  import('../lesson-bookings').then((m) => ({
    default: m.AdminLessonBookingPanel,
  }))
);
const AdminCourseEnrollmentPanel = lazy(() =>
  import('../course-enrollments').then((m) => ({
    default: m.AdminCourseEnrollmentPanel,
  }))
);
const CoursesManager = lazy(() =>
  import('./courses').then((m) => ({
    default: m.CoursesManager,
  }))
);
const ErrorLogsPanel = lazy(() =>
  import('./settings').then((m) => ({
    default: m.ErrorLogsPanel,
  }))
);
const AdminIssueCenter = lazy(() =>
  import('../issues').then((m) => ({
    default: m.AdminIssueCenter,
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
  currentUserProfile: UserProfile;
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  notificationRetentionDays?: number;
  onSetNotificationRetentionDays?: (days: number) => Promise<void>;
  starterCreditUsd?: number;
  onSetStarterCreditUsd?: (amount: number) => Promise<void>;
  courses?: Course[];
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
  onUpdateAchievementsConfig?: (config: AchievementsConfig) => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  instructors,
  bookings: rawBookings,
  usersList = [],
  courses = [],
  currentUserProfile,
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

  useTranslatedBookings(rawBookings, courses, language, { syncCoursePrice: true });

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const onRequestConfirm = (message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmModal({ message, onConfirm });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Suspense fallback={<SectionLoadingFallback label={t('financialOverview')} />}>
        <AdminFinancialOverviewHost instructorsCount={instructors.length} />
      </Suspense>

      <AdminTabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'operations' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('scheduleBoardTitle')} />}>
            <AdminCollapsibleSection
              id="admin_planner"
              title={t('scheduleBoardTitle')}
              subtitle={t('scheduleBoardSub')}
              icon={CalendarDays}
              defaultOpen
              forceOpen={Boolean(
                searchParams.get(ADMIN_PLANNER_FOCUS_QUERY_KEY) ||
                  searchParams.get(ADMIN_PLANNER_DATE_QUERY_KEY)
              )}
              forceOpenToken={
                searchParams.get(ADMIN_PLANNER_FOCUS_QUERY_KEY) ??
                searchParams.get(ADMIN_PLANNER_DATE_QUERY_KEY) ??
                undefined
              }
            >
              <AdminPlannerBoard
                adminProfile={currentUserProfile}
                usersList={usersList}
                fallbackInstructors={instructors}
              />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('bookingsLogTitle')} />}>
            <AdminCollapsibleSection
              id="admin_booking_monitor"
              title={t('bookingsLogTitle')}
              subtitle={t('bookingsLogSub')}
              icon={BookOpen}
              defaultOpen
            >
              <AdminActiveBookingMonitor
                usersList={usersList}
                instructors={instructors}
              />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('adminIssueInboxTitle')} />}>
            <AdminCollapsibleSection
              id="admin_issue_inbox"
              title={t('adminIssueInboxTitle')}
              subtitle={t('adminIssueInboxSub')}
              icon={ShieldAlert}
              defaultOpen={false}
            >
              <AdminIssueCenter />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('adminLessonBookingsTitle')} />}>
            <AdminCollapsibleSection
              id="canonical_lesson_bookings"
              title={t('adminLessonBookingsTitle')}
              subtitle={t('adminLessonBookingsSub')}
              icon={BookOpen}
              defaultOpen={false}
              forceOpen={Boolean(searchParams.get(ADMIN_LESSON_BOOKING_QUERY_KEY))}
              forceOpenToken={searchParams.get(ADMIN_LESSON_BOOKING_QUERY_KEY) ?? undefined}
            >
              <AdminLessonBookingPanel
                adminAccountId={currentUserProfile.uid}
                instructors={instructors.map((instructor) => ({
                  instructorId: instructor.id,
                  displayName: instructor.name,
                }))}
              />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('adminCourseEnrollmentsTitle')} />}>
            <AdminCollapsibleSection
              id="canonical_course_enrollments"
              title={t('adminCourseEnrollmentsTitle')}
              subtitle={t('adminCourseEnrollmentsSub')}
              icon={BookOpen}
              defaultOpen={false}
              forceOpen={Boolean(searchParams.get(ADMIN_COURSE_ENROLLMENT_QUERY_KEY))}
            >
              <AdminCourseEnrollmentPanel adminAccountId={currentUserProfile.uid} />
            </AdminCollapsibleSection>
          </Suspense>
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('canonicalGuestFinanceTitle')} />}>
            <AdminCollapsibleSection
              id="canonical_guest_finance"
              title={t('canonicalGuestFinanceTitle')}
              subtitle={t('canonicalGuestFinanceHint')}
              icon={Wallet}
              defaultOpen
            >
              <AdminGuestFinanceHost />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('adminFinanceCanonicalTitle')} />}>
            <AdminCollapsibleSection
              id="canonical_finance"
              title={t('adminFinanceCanonicalTitle')}
              subtitle={t('adminFinanceCanonicalSub')}
              icon={Wallet}
              defaultOpen={false}
              forceOpen={Boolean(
                searchParams.get(ADMIN_FINANCE_PAYMENT_QUERY_KEY) ||
                  searchParams.get(ADMIN_FINANCE_ACCOUNT_QUERY_KEY)
              )}
              forceOpenToken={
                searchParams.get(ADMIN_FINANCE_PAYMENT_QUERY_KEY) ??
                searchParams.get(ADMIN_FINANCE_ACCOUNT_QUERY_KEY) ??
                undefined
              }
            >
              <CanonicalFinancePanel
                adminAccountId={currentUserProfile.uid}
                accounts={usersList}
                onRequestConfirm={onRequestConfirm}
              />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('cashFlowTitle')} />}>
            <AdminCollapsibleSection
              id="canonical_school_movement"
              title={t('cashFlowTitle')}
              subtitle={t('cashFlowSub')}
              icon={Wallet}
              defaultOpen
              forceOpen={Boolean(searchParams.get(ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY))}
            >
              <CanonicalSchoolMovementPanel />
            </AdminCollapsibleSection>
          </Suspense>
        </div>
      )}

      {activeTab === 'people' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('clientsManagerTitle')} />}>
            <AdminCollapsibleSection
              id="admin_clients"
              title={t('clientsManagerTitle')}
              subtitle={t('clientsManagerSub')}
              icon={Users}
              defaultOpen
            >
              <AdminPeopleSection
                adminAccountId={currentUserProfile.uid}
                currentUserProfile={currentUserProfile}
                storeUsers={usersList}
                storeInstructors={instructors}
                bookings={rawBookings}
                onRequestConfirm={onRequestConfirm}
                surface="clients"
              />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('coachesDirectoryTitle')} />}>
            <AdminCollapsibleSection
              id="admin_instructors"
              title={t('coachesDirectoryTitle')}
              subtitle={t('coachesDirectorySub')}
              icon={Users}
              defaultOpen
            >
              <AdminPeopleSection
                adminAccountId={currentUserProfile.uid}
                currentUserProfile={currentUserProfile}
                storeUsers={usersList}
                storeInstructors={instructors}
                bookings={rawBookings}
                onRequestConfirm={onRequestConfirm}
                surface="instructors"
              />
            </AdminCollapsibleSection>
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('adminRoleManagementTitle')} />}>
            <AdminCollapsibleSection
              id="admin_roles"
              title={t('adminRoleManagementTitle')}
              subtitle={t('adminRoleManagementSub')}
              icon={Shield}
              defaultOpen
            >
              <AdminPeopleSection
                adminAccountId={currentUserProfile.uid}
                currentUserProfile={currentUserProfile}
                storeUsers={usersList}
                storeInstructors={instructors}
                bookings={rawBookings}
                onRequestConfirm={onRequestConfirm}
                surface="admins"
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
              defaultOpen
            >
              <CoursesManager
                currentAccountId={currentUserProfile.uid}
                instructors={instructors.map((instructor) => ({
                  instructorId: instructor.id,
                  name: instructor.name,
                }))}
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
