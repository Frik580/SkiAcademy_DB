import { AdminModal } from './AdminModal';
import React, { useCallback, useState, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Instructor, UserProfile } from '../../../types';
import {
  Shield,
  BookOpen,
  AlertTriangle,
  ShieldAlert,
  Wallet,
  CalendarDays,
  Users,
} from 'lucide-react';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { SkillConfig } from '../../../domain/achievements';
import { AchievementsConfig } from '../../../domain/achievements';
import { AdminCollapsibleSection } from './settings';
import { TableSkeleton } from '../../../ui/Skeleton';
import {
  adminCourseEnrollmentSearchParams,
  ADMIN_CLIENT_ACCOUNT_QUERY_KEY,
  ADMIN_CHANGE_REQUEST_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY,
  ADMIN_FINANCE_ACCOUNT_QUERY_KEY,
  ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
  ADMIN_ISSUE_QUERY_KEY,
  ADMIN_LESSON_BOOKING_QUERY_KEY,
  ADMIN_PLANNER_DATE_QUERY_KEY,
  ADMIN_PLANNER_FOCUS_QUERY_KEY,
  ADMIN_TAB_QUERY_KEY,
  ADMIN_TRAINING_RECORDS_SECTION_ID,
  adminTabSearchParams,
  parseAdminTabId,
  type AdminTabId,
} from '../adminNavigation';
import { AdminTabNav } from './AdminTabNav';
import { AdminDisplayChrome } from './finance/AdminDisplayChrome';
import { AdminMonitorReadModelsProvider } from '../operations/AdminMonitorReadModelsContext';

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
const AdminOperationalMetricsHost = lazy(() =>
  import('../operations/AdminOperationalMetricsHost').then((m) => ({
    default: m.AdminOperationalMetricsHost,
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
const EmailDeliverySettingsSection = lazy(() =>
  import('./settings').then((m) => ({
    default: m.EmailDeliverySettingsSection,
  }))
);
const OutboxDeadLetterSection = lazy(() =>
  import('./settings').then((m) => ({
    default: m.OutboxDeadLetterSection,
  }))
);
const AdminTestingPanel = lazy(() =>
  import('../testing').then((m) => ({
    default: m.AdminTestingPanel,
  }))
);
const AdminProductSettings = lazy(() =>
  import('./settings').then((m) => ({
    default: m.AdminProductSettings,
  }))
);
const AdminTrainingRecordsPanel = lazy(() =>
  import('../training-records').then((m) => ({
    default: m.AdminTrainingRecordsPanel,
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
      <span className="type-caption uppercase text-[var(--ink-dim)]">{label}</span>
    </div>
    <TableSkeleton rows={5} cols={5} />
  </div>
);

interface AdminPanelProps {
  instructors: Instructor[];
  usersList?: UserProfile[];
  currentUserProfile: UserProfile;
  filtersEnabled?: boolean;
  onToggleFilters?: (enabled: boolean) => Promise<void>;
  notificationRetentionDays?: number;
  onSetNotificationRetentionDays?: (days: number) => Promise<void>;
  starterCreditKzt?: number;
  onSetStarterCreditKzt?: (amount: number) => Promise<void>;
  skillConfig?: SkillConfig;
  achievementsConfig?: AchievementsConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
  onUpdateAchievementsConfig?: (config: AchievementsConfig) => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  instructors,
  usersList = [],
  currentUserProfile,
  filtersEnabled = true,
  onToggleFilters,
  notificationRetentionDays,
  onSetNotificationRetentionDays,
  starterCreditKzt,
  onSetStarterCreditKzt,
  skillConfig,
  onUpdateSkillConfig,
  achievementsConfig,
  onUpdateAchievementsConfig,
}) => {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseAdminTabId(searchParams.get(ADMIN_TAB_QUERY_KEY));

  const setActiveTab = useCallback(
    (tab: AdminTabId) => {
      setSearchParams((prev) => adminTabSearchParams(prev, tab), { replace: true });
    },
    [setSearchParams]
  );

  const [confirmModal, setConfirmModal] = useState<{
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const onRequestConfirm = (message: string, onConfirm: () => void | Promise<void>) => {
    setConfirmModal({ message, onConfirm });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <AdminDisplayChrome />

      <AdminTabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'operations' && (
        <AdminMonitorReadModelsProvider>
          <div className="space-y-6">
            <Suspense fallback={<SectionLoadingFallback label={t('financialOverview')} />}>
              <AdminOperationalMetricsHost instructorsCount={instructors.length} />
            </Suspense>

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
                <AdminActiveBookingMonitor usersList={usersList} />
              </AdminCollapsibleSection>
            </Suspense>

            <Suspense fallback={<SectionLoadingFallback label={t('adminIssueInboxTitle')} />}>
              <AdminCollapsibleSection
                id="admin_issue_inbox"
                title={t('adminIssueInboxTitle')}
                subtitle={t('adminIssueInboxSub')}
                icon={ShieldAlert}
                defaultOpen={false}
                forceOpen={Boolean(
                  searchParams.get(ADMIN_ISSUE_QUERY_KEY) ||
                  searchParams.get(ADMIN_CHANGE_REQUEST_QUERY_KEY)
                )}
                forceOpenToken={
                  searchParams.get(ADMIN_ISSUE_QUERY_KEY) ??
                  searchParams.get(ADMIN_CHANGE_REQUEST_QUERY_KEY) ??
                  undefined
                }
              >
                <AdminIssueCenter />
              </AdminCollapsibleSection>
            </Suspense>

            <Suspense fallback={<SectionLoadingFallback label={t('adminTrainingRecordsTitle')} />}>
              <AdminCollapsibleSection
                id={ADMIN_TRAINING_RECORDS_SECTION_ID}
                title={t('adminTrainingRecordsTitle')}
                subtitle={t('adminTrainingRecordsSub')}
                icon={BookOpen}
                defaultOpen={false}
                forceOpen={Boolean(
                  searchParams.get(ADMIN_LESSON_BOOKING_QUERY_KEY) ||
                  searchParams.get(ADMIN_COURSE_ENROLLMENT_QUERY_KEY) ||
                  searchParams.get(ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY)
                )}
                forceOpenToken={
                  searchParams.get(ADMIN_LESSON_BOOKING_QUERY_KEY) ??
                  searchParams.get(ADMIN_COURSE_ENROLLMENT_QUERY_KEY) ??
                  searchParams.get(ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY) ??
                  undefined
                }
              >
                <span id="canonical_lesson_bookings" className="sr-only" />
                <span id="canonical_course_enrollments" className="sr-only" />
                <AdminTrainingRecordsPanel
                  adminAccountId={currentUserProfile.uid}
                  instructors={instructors.map((instructor) => ({
                    instructorId: instructor.id,
                    displayName: instructor.name,
                  }))}
                />
              </AdminCollapsibleSection>
            </Suspense>
          </div>
        </AdminMonitorReadModelsProvider>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('financialOverview')} />}>
            <AdminFinancialOverviewHost />
          </Suspense>

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
              forceOpen={Boolean(searchParams.get(ADMIN_CLIENT_ACCOUNT_QUERY_KEY))}
              forceOpenToken={searchParams.get(ADMIN_CLIENT_ACCOUNT_QUERY_KEY) ?? undefined}
            >
              <AdminPeopleSection
                adminAccountId={currentUserProfile.uid}
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
                onRequestConfirm={onRequestConfirm}
                surface="admins"
              />
            </AdminCollapsibleSection>
          </Suspense>
        </div>
      )}

      {activeTab === 'product' && (
        <div className="space-y-6">
          <Suspense fallback={<SectionLoadingFallback label={t('coursesDatabaseTitle')} />}>
            <AdminCollapsibleSection
              id="courses_manager"
              title={t('coursesDatabaseTitle')}
              subtitle={t('coursesDatabaseSub')}
              icon={BookOpen}
              defaultOpen
            >
              <CoursesManager
                currentAccountId={currentUserProfile.uid}
                onRequestConfirm={onRequestConfirm}
                onOpenEnrollments={(courseId) =>
                  setSearchParams(
                    (previous) => adminCourseEnrollmentSearchParams(previous, courseId),
                    { replace: true }
                  )
                }
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
          <Suspense fallback={<SectionLoadingFallback label={t('emailDeliveryTitle')} />}>
            <EmailDeliverySettingsSection />
          </Suspense>
          <Suspense fallback={<SectionLoadingFallback label={t('outboxDeadLetterTitle')} />}>
            <OutboxDeadLetterSection />
          </Suspense>
          <Suspense fallback={<SectionLoadingFallback label={t('systemSettingsTitle')} />}>
            <AdminSystemSettings
              filtersEnabled={filtersEnabled}
              onToggleFilters={onToggleFilters}
              notificationRetentionDays={notificationRetentionDays}
              onSetNotificationRetentionDays={onSetNotificationRetentionDays}
              starterCreditKzt={starterCreditKzt}
              onSetStarterCreditKzt={onSetStarterCreditKzt}
              skillConfig={skillConfig}
              onUpdateSkillConfig={onUpdateSkillConfig}
              achievementsConfig={achievementsConfig}
              onUpdateAchievementsConfig={onUpdateAchievementsConfig}
            />
          </Suspense>

          <Suspense fallback={<SectionLoadingFallback label={t('adminTestingTitle')} />}>
            <AdminTestingPanel />
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

      {confirmModal && (
        <AdminModal
          title={t('confirmAction')}
          closeLabel={t('cancel')}
          onClose={() => setConfirmModal(null)}
          width="sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="btn-secondary flex-1 px-4 py-3 type-button"
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
                className="btn-primary flex-1 px-4 py-3"
              >
                {t('confirm')}
              </button>
            </>
          }
        >
          <p className="type-caption text-[var(--ink-dim)]">{confirmModal.message}</p>
        </AdminModal>
      )}
    </div>
  );
};
