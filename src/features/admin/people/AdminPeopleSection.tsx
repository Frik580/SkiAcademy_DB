import { IdempotencyKeySchema, InstructorIdSchema, ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX } from '@ski-academy/shared-domain';
import { useEffect, useMemo } from 'react';
import type { Booking, Instructor, UserProfile } from '../../../types';
import { CoachesManager } from '../components/users/CoachesManager';
import { AdminRoleManager } from '../components/users/AdminRoleManager';
import { executeAdminIdentityAttempt } from '../identity/useAdminIdentityCommands';
import { useAdminIdentityReadModels } from '../identity/useAdminIdentityReadModels';
import { mergeAdminClientDirectory, mergeAdminInstructorDirectory } from './adminPeopleMapping';
import { formatDateLocalYMD } from '../components/schedule/scheduleUtils';
import { mapPlannerOccupancyToBookings } from '../operations/adminPlannerMapping';
import { useAdminPlannerReadModels } from '../operations/useAdminPlannerReadModels';
import { useAdminMonitorReadModels } from '../operations/useAdminMonitorReadModels';
import { mergeInstructorOccupancyBookings } from './adminPeopleOccupancy';
import { AdminClientDirectory } from './AdminClientDirectory';

interface AdminPeopleSectionProps {
  readonly adminAccountId: string;
  readonly currentUserProfile: UserProfile;
  readonly storeUsers: UserProfile[];
  readonly storeInstructors: Instructor[];
  readonly bookings: Booking[];
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
  readonly surface: 'clients' | 'instructors' | 'admins';
}

function attemptKey(action: string) {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return IdempotencyKeySchema.parse(`admin_people:${action}:${entropy}`);
}

export function AdminPeopleSection({
  adminAccountId,
  currentUserProfile,
  storeUsers,
  storeInstructors,
  bookings,
  onRequestConfirm,
  surface,
}: AdminPeopleSectionProps) {
  const accounts = useAdminIdentityReadModels({
    enabled: surface === 'admins',
    directory: 'accounts',
    search: '',
    pageSize: ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX,
  });
  const instructors = useAdminIdentityReadModels({
    enabled: surface === 'instructors',
    directory: 'instructors',
    search: '',
    pageSize: ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX,
  });
  const monitor = useAdminMonitorReadModels();
  const planner = useAdminPlannerReadModels({
    enabled: surface === 'instructors',
    localDate: formatDateLocalYMD(new Date()),
    view: 'week',
    windowDays: 62,
  });
  const occupancyBookings = useMemo(
    () => mapPlannerOccupancyToBookings(planner.item?.occupancy ?? []),
    [planner.item?.occupancy]
  );
  const instructorOccupancyBookings = useMemo(
    () => mergeInstructorOccupancyBookings(monitor.bookings, occupancyBookings),
    [monitor.bookings, occupancyBookings]
  );

  useEffect(() => {
    if (
      accounts.accounts.hasMore &&
      accounts.accounts.cursor &&
      !accounts.accounts.loading &&
      !accounts.accounts.loadingMore
    ) {
      accounts.loadMore();
    }
  }, [
    accounts.accounts.cursor,
    accounts.accounts.hasMore,
    accounts.accounts.loading,
    accounts.accounts.loadingMore,
    accounts.loadMore,
  ]);

  useEffect(() => {
    if (
      instructors.instructors.hasMore &&
      instructors.instructors.cursor &&
      !instructors.instructors.loading &&
      !instructors.instructors.loadingMore
    ) {
      instructors.loadMore();
    }
  }, [
    instructors.instructors.cursor,
    instructors.instructors.hasMore,
    instructors.instructors.loading,
    instructors.instructors.loadingMore,
    instructors.loadMore,
  ]);

  const usersList = useMemo(
    () => mergeAdminClientDirectory(storeUsers, accounts.accounts.items),
    [accounts.accounts.items, storeUsers]
  );
  const instructorList = useMemo(
    () => mergeAdminInstructorDirectory(storeInstructors, instructors.instructors.items),
    [instructors.instructors.items, storeInstructors]
  );

  const refreshPeople = async () => {
    await Promise.all([accounts.refresh(), instructors.refresh()]);
  };

  return (
    <>
      {surface === 'clients' ? <AdminClientDirectory adminAccountId={adminAccountId} /> : null}
      {surface === 'instructors' ? (
      <CoachesManager
        instructors={instructorList}
        bookings={instructorOccupancyBookings.length > 0 ? instructorOccupancyBookings : bookings}
        occupancyTruncated={planner.item?.truncated === true}
        onAddInstructor={async (instructor) => {
          await executeAdminIdentityAttempt(adminAccountId, {
            kind: 'create_instructor_catalog_entry',
            instructorId: InstructorIdSchema.parse(instructor.id),
            name: instructor.name,
            pricePerHourKZT: Math.max(1, Math.round(instructor.pricePerHourKZT ?? instructor.pricePerHour)),
            specialty: instructor.specialty,
            languages: instructor.languages,
            experienceYears: instructor.experienceYears,
            bio: instructor.bio,
            avatarUrl: instructor.avatarUrl || undefined,
            phoneNumber: instructor.phoneNumber,
            reasonExplanation: 'Admin instructor directory create',
            expectedRevision: 1,
            idempotencyKey: attemptKey('create_instructor_dir'),
          });
          await refreshPeople();
        }}
        onUpdateInstructor={async (instructor) => {
          const item = instructors.instructors.items.find(
            (candidate) => candidate.instructorId === instructor.id
          );
          if (item && item.isAvailable !== instructor.isAvailable) {
            await executeAdminIdentityAttempt(adminAccountId, {
              kind: instructor.isAvailable
                ? 'reactivate_instructor_catalog'
                : 'deactivate_instructor_catalog',
              instructorId: InstructorIdSchema.parse(instructor.id),
              reasonExplanation: 'Admin instructor availability toggle',
              expectedRevision: item.revision,
              idempotencyKey: attemptKey('toggle_instructor'),
            });
          } else {
            await executeAdminIdentityAttempt(adminAccountId, {
              kind: 'update_instructor_catalog_profile',
              instructorId: InstructorIdSchema.parse(instructor.id),
              name: instructor.name,
              pricePerHourKZT: Math.max(
                1,
                Math.round(instructor.pricePerHourKZT ?? instructor.pricePerHour)
              ),
              specialty: instructor.specialty,
              languages: instructor.languages,
              experienceYears: instructor.experienceYears,
              bio: instructor.bio,
              avatarUrl: instructor.avatarUrl || undefined,
              phoneNumber: instructor.phoneNumber,
              reasonExplanation: 'Admin instructor directory update',
              expectedRevision: item?.revision ?? 1,
              idempotencyKey: attemptKey('update_instructor_dir'),
            });
          }
          await refreshPeople();
        }}
        onDeleteInstructor={async (id) => {
          const item = instructors.instructors.items.find((candidate) => candidate.instructorId === id);
          await executeAdminIdentityAttempt(adminAccountId, {
            kind: 'deactivate_instructor_catalog',
            instructorId: InstructorIdSchema.parse(id),
            reasonExplanation: 'Admin instructor directory deactivate',
            expectedRevision: item?.revision ?? 1,
            idempotencyKey: attemptKey('deactivate_instructor'),
          });
          await refreshPeople();
        }}
        onRequestConfirm={onRequestConfirm}
      />
      ) : null}
      {surface === 'admins' ? (
      <AdminRoleManager
        usersList={usersList}
        currentUserProfile={currentUserProfile}
        onUpdateUserRole={async (targetUid, newRole) => {
          const item = accounts.accounts.items.find((account) => account.accountId === targetUid);
          await executeAdminIdentityAttempt(adminAccountId, {
            kind: 'change_account_role',
            accountId: item?.accountId ?? (targetUid as never),
            role: newRole,
            reasonExplanation: 'Admin resort administrator assignment',
            expectedRevision: item?.revision ?? 1,
            idempotencyKey: attemptKey('assign_admin_role'),
          });
          await refreshPeople();
        }}
        onRequestConfirm={onRequestConfirm}
      />
      ) : null}
    </>
  );
}
