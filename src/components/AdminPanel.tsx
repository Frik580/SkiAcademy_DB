import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Instructor, Booking, UserProfile, Course } from '../types';
import { Shield } from 'lucide-react';
import { useLanguage, useTranslatedBookings } from '../lib/LanguageContext';
import { SkillConfig } from '../lib/skillData';
import { FinancialOverview } from './admin/FinancialOverview';
import { SystemSettings } from './admin/SystemSettings';
import { ScheduleCalendar } from './admin/ScheduleCalendar';
import { BookingsLog } from './admin/BookingsLog';
import { ClientsManager } from './admin/ClientsManager';
import { CoachesManager } from './admin/CoachesManager';
import { CoursesManager } from './admin/CoursesManager';
import { AdminRoleManager } from './admin/AdminRoleManager';
import { ErrorLogsPanel } from './admin/ErrorLogsPanel';

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
  skillConfig?: SkillConfig;
  onUpdateSkillConfig?: (config: SkillConfig) => Promise<void>;
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

  const currentAdminUser = useMemo(() => {
    if (!currentUserEmail) return null;
    return (usersList || []).find((u) => u.email.toLowerCase() === currentUserEmail.toLowerCase());
  }, [usersList, currentUserEmail]);

  const adminProfile = useMemo(() => {
    return (
      currentAdminUser ||
      ({
        uid: 'admin',
        email: currentUserEmail || 'admin@example.com',
        displayName: t('administratorLabel'),
        role: 'admin',
        avatarUrl: '',
        balanceUSD: 0,
      } as UserProfile)
    );
  }, [currentAdminUser, currentUserEmail, t]);

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
      <FinancialOverview
        totalRevenue={totalRevenue}
        activeBookings={activeBookings}
        completedBookings={completedBookings}
        instructorsCount={instructors.length}
      />

      <SystemSettings
        filtersEnabled={filtersEnabled}
        onToggleFilters={onToggleFilters}
        skillConfig={skillConfig}
        onUpdateSkillConfig={onUpdateSkillConfig}
      />

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

      <CoachesManager
        instructors={instructors}
        bookings={bookings}
        onAddInstructor={onAddInstructor}
        onUpdateInstructor={onUpdateInstructor}
        onDeleteInstructor={onDeleteInstructor}
        onRequestConfirm={onRequestConfirm}
      />

      <BookingsLog
        bookings={bookings}
        usersList={usersList}
        instructors={instructors}
        onConfirmBooking={onConfirmBooking}
        onCompleteBooking={onCompleteBooking}
        onCancelBooking={onCancelBooking}
        onRequestConfirm={onRequestConfirm}
      />

      <ClientsManager
        usersList={usersList}
        instructors={instructors}
        currentUserEmail={currentUserEmail}
        onAddUser={onAddUser}
        onUpdateUser={onUpdateUser}
        onDeleteUser={onDeleteUser}
        onAddInstructor={onAddInstructor}
        onUpdateInstructor={onUpdateInstructor}
        onDeleteInstructor={onDeleteInstructor}
        onRequestConfirm={onRequestConfirm}
      />

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

      <AdminRoleManager
        usersList={usersList}
        currentUserEmail={currentUserEmail}
        onUpdateUserRole={onUpdateUserRole}
        onRequestConfirm={onRequestConfirm}
      />

      <ErrorLogsPanel onRequestConfirm={onRequestConfirm} />

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
