import React, { useState, useMemo, useEffect } from 'react';
import { Search, Link2 } from 'lucide-react';
import { Booking, UserProfile, Instructor } from '../../../../types';
import {
  useLanguage,
  formatLessonDifficultyOrUnspecified,
} from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { isCourseBooking } from '../../../../domain/availability';
import { formatBookingCreatedAt } from '../../../../domain/booking';
import { StatusBadge } from '../../../../ui/StatusBadge';
import { ApplePagination } from '../../../../ui/ApplePagination';
import {
  filterAdminBookingMonitorRows,
  type AdminBookingMonitorSort,
  type AdminBookingMonitorStatusFilter,
  type AdminBookingMonitorTypeFilter,
} from '../../operations/adminBookingMonitorFilters';

const shortenBookingId = (id: string): string => (id.length > 12 ? `${id.slice(0, 10)}…` : id);

function formatMonitorDuration(durationHours: number, language: string): string {
  const minutes = Math.round(durationHours * 60);
  if (minutes <= 0) return '—';
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return language === 'ru' ? `${minutes} мин` : `${minutes}m`;
}

interface BookingsLogProps {
  bookings: Booking[];
  usersList: UserProfile[];
  instructors: Instructor[];
  onOpenLesson?: (bookingId: string) => void;
  onOpenEnrollment?: (enrollmentId: string) => void;
  hasMoreBookings?: boolean;
  onLoadMoreBookings?: () => void;
}

export const BookingsLog: React.FC<BookingsLogProps> = ({
  bookings,
  usersList,
  instructors,
  onOpenLesson,
  onOpenEnrollment,
  hasMoreBookings = false,
  onLoadMoreBookings,
}) => {
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency();

  const [monitorSearch, setMonitorSearch] = useState('');
  const [monitorStatusFilter, setMonitorStatusFilter] =
    useState<AdminBookingMonitorStatusFilter>('all');
  const [monitorInstructorFilter, setMonitorInstructorFilter] = useState('all');
  const [monitorClientFilter, setMonitorClientFilter] = useState('all');
  const [monitorTypeFilter, setMonitorTypeFilter] = useState<AdminBookingMonitorTypeFilter>('all');
  const [monitorSortBy, setMonitorSortBy] = useState<AdminBookingMonitorSort>('date_desc');
  const [monitorPage, setMonitorPage] = useState(1);

  useEffect(() => {
    setMonitorPage(1);
  }, [
    monitorSearch,
    monitorStatusFilter,
    monitorInstructorFilter,
    monitorClientFilter,
    monitorTypeFilter,
    monitorSortBy,
  ]);

  const filteredBookings = useMemo(
    () =>
      filterAdminBookingMonitorRows(bookings, usersList, {
        search: monitorSearch,
        status: monitorStatusFilter,
        instructorId: monitorInstructorFilter,
        clientId: monitorClientFilter,
        type: monitorTypeFilter,
        sortBy: monitorSortBy,
        language,
      }),
    [
      bookings,
      usersList,
      monitorSearch,
      monitorStatusFilter,
      monitorInstructorFilter,
      monitorClientFilter,
      monitorTypeFilter,
      monitorSortBy,
      language,
    ]
  );

  const paginatedBookings = useMemo(() => {
    const startIndex = (monitorPage - 1) * 10;
    return filteredBookings.slice(startIndex, startIndex + 10);
  }, [filteredBookings, monitorPage]);

  const monitorTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredBookings.length / 10));
  }, [filteredBookings]);
  return (
    <div className="space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden">
      {/* Filters and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 pb-1 font-mono">
        {/* Search Input */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[var(--ink-dim)]">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder={t('searchBookingsPlaceholder')}
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
            <option value="all" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('allStatuses')}
            </option>
            <option value="pending" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('pendingStatus')}
            </option>
            <option
              value="pending_cancellation"
              className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]"
            >
              {t('pendingCancellationStatus')}
            </option>
            <option value="confirmed" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('confirmedStatus')}
            </option>
            <option value="completed" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('completedStatus')}
            </option>
            <option value="cancelled" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('cancelledStatus')}
            </option>
          </select>
        </div>

        {/* Instructor Filter Dropdown */}
        <div>
          <select
            value={monitorInstructorFilter}
            onChange={(e) => setMonitorInstructorFilter(e.target.value)}
            className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] transition cursor-pointer font-mono"
          >
            <option value="all" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('allInstructorsFilter')}
            </option>
            {instructors.map((ins) => (
              <option
                key={ins.id}
                value={ins.id}
                className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]"
              >
                {ins.name}
              </option>
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
            <option value="all" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('allClientsFilter')}
            </option>
            <option value="guests" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              📝 {t('filterGuestRequests')}
            </option>
            {usersList.map((user) => (
              <option
                key={user.uid}
                value={user.uid}
                className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]"
              >
                {user.displayName || user.email || user.uid}
              </option>
            ))}
          </select>
        </div>

        {/* Booking type filter */}
        <div>
          <select
            value={monitorTypeFilter}
            onChange={(e) => setMonitorTypeFilter(e.target.value as 'all' | 'courses' | 'lessons')}
            className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] transition cursor-pointer font-mono"
          >
            <option value="all" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('allBookingTypesFilter')}
            </option>
            <option value="courses" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('coursesBookingTypeFilter')}
            </option>
            <option value="lessons" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('lessonsBookingTypeFilter')}
            </option>
          </select>
        </div>

        {/* Sort Dropdown */}
        <div>
          <select
            value={monitorSortBy}
            onChange={(e) => setMonitorSortBy(e.target.value as any)}
            className="w-full px-3 py-2 border border-[var(--border)] bg-slate-50 dark:bg-slate-900 text-xs text-[var(--ink)] rounded-none focus:outline-none focus:border-[var(--ink)] transition cursor-pointer font-mono"
          >
            <option value="date_desc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('sortDateNewest')}
            </option>
            <option value="date_asc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('sortDateOldest')}
            </option>
            <option value="client_asc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('sortClientAZ')}
            </option>
            <option value="client_desc" className="bg-slate-50 dark:bg-slate-900 text-[var(--ink)]">
              {t('sortClientZA')}
            </option>
          </select>
        </div>
      </div>

      {/* Clear filters trigger */}
      {(monitorSearch ||
        monitorStatusFilter !== 'all' ||
        monitorInstructorFilter !== 'all' ||
        monitorClientFilter !== 'all' ||
        monitorTypeFilter !== 'all' ||
        monitorSortBy !== 'date_desc') && (
        <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-none border border-[var(--border)] font-mono">
          <span className="text-[10px] text-[var(--ink-dim)]">
            {`${t('foundMatchingPrefix')} ${filteredBookings.length} ${t('foundMatchingSuffix')}`}
          </span>
          <button
            onClick={() => {
              setMonitorSearch('');
              setMonitorStatusFilter('all');
              setMonitorInstructorFilter('all');
              setMonitorClientFilter('all');
              setMonitorTypeFilter('all');
              setMonitorSortBy('date_desc');
            }}
            className="text-[10px] text-[var(--ink)] hover:underline font-bold transition cursor-pointer"
          >
            {t('resetFilters')}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] font-mono text-[var(--ink-dim)] uppercase tracking-wider">
              <th className="py-3 px-1 w-[4.5rem] max-w-[4.5rem]">{t('bookingId')}</th>
              <th className="py-3 px-2 whitespace-nowrap">{t('bookingDateColumn')}</th>
              <th className="py-3 px-2">{t('skierLabel')}</th>
              <th className="py-3 px-2">{t('coachLabel')}</th>
              <th className="py-3 px-2 whitespace-nowrap">{t('trainingLevelLabel')}</th>
              <th className="py-3 px-2">{t('dateTimeColumn')}</th>
              <th className="py-3 px-2">{t('feeColumn')}</th>
              <th className="py-3 px-2">{t('statusLabel')}</th>
              <th className="py-3 px-2 text-right">{t('approvalActions')}</th>
            </tr>
          </thead>
          <tbody>
            {bookings.filter((b) => !b.userId?.startsWith('system_block_')).length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="text-center py-6 text-xs text-[var(--ink-dim)] font-mono"
                >
                  {t('noScheduledSessions')}
                </td>
              </tr>
            ) : filteredBookings.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="text-center py-6 text-xs text-[var(--ink-dim)] font-mono"
                >
                  {t('noBookingsMatchFilter')}
                </td>
              </tr>
            ) : (
              paginatedBookings.map((b) => {
                const client = usersList.find((u) => u.uid === b.userId);
                const instructorName = b.instructorName;
                return (
                  <tr
                    key={b.id}
                    className="border-b border-[var(--border)]/40 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition"
                  >
                    <td
                      className="py-3 px-1 w-[4.5rem] max-w-[4.5rem] font-mono text-[9px] text-[var(--ink-dim)] truncate"
                      title={b.id}
                    >
                      {shortenBookingId(b.id)}
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] text-[var(--ink-dim)] whitespace-nowrap">
                      {formatBookingCreatedAt(b, language) ?? t('bookingCreatedAtUnknown')}
                    </td>
                    <td className="py-3 px-2">
                      {b.isGuest || b.userId?.startsWith('guest_') ? (
                        <div className="space-y-1">
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-mono text-[9px] uppercase font-bold tracking-wider inline-block">
                            {t('guestBadge')}
                          </span>
                          <span className="font-bold text-[var(--ink)] block leading-tight">
                            {b.guestName ||
                              client?.displayName ||
                              t('guestBadge') ||
                              (language === 'ru' ? 'Гость' : 'Guest')}
                          </span>
                          {b.guestPhone && (
                            <a
                              href={`tel:${b.guestPhone}`}
                              className="text-sky-600 dark:text-sky-400 font-mono text-[10px] flex items-center gap-1 hover:underline"
                            >
                              📞 {b.guestPhone}
                            </a>
                          )}
                          {b.guestEmail && (
                            <a
                              href={`mailto:${b.guestEmail}`}
                              className="text-[var(--ink-dim)] font-mono text-[10px] flex items-center gap-1 hover:underline"
                            >
                              ✉️ {b.guestEmail}
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              isCourseBooking(b) ? onOpenEnrollment?.(b.id) : onOpenLesson?.(b.id)
                            }
                            className="mt-1.5 px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold transition flex items-center gap-1 cursor-pointer"
                            title={t('linkToClientBtn')}
                          >
                            <Link2 className="w-3 h-3" />
                            {t('linkToClientBtn')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="font-bold text-[var(--ink)] block leading-none">
                            {b.guestName || client?.displayName || t('skierLabel')}
                          </span>
                          <span className="font-mono text-[9px] text-[var(--ink-dim)] mt-1 block">
                            {b.userId.substring(0, 8)}...
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-2 font-bold text-[var(--ink)]">{instructorName}</td>
                    <td className="py-3 px-2 font-mono text-[10px] text-[var(--ink-dim)] whitespace-nowrap">
                      {isCourseBooking(b)
                        ? '—'
                        : formatLessonDifficultyOrUnspecified(
                            b.difficulty,
                            language,
                            t('difficultyUnspecified'),
                            'short'
                          )}
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] text-[var(--ink-dim)]">
                      <div>
                        {b.date} @ {b.time} ({formatMonitorDuration(b.durationHours, language)})
                      </div>
                      {b.notes && (
                        <div className="mt-1 text-[10px] text-[var(--ink)] italic bg-black/5 dark:bg-white/5 border border-[var(--border)] p-1.5 max-w-xs font-sans">
                          💬 {b.notes}
                        </div>
                      )}
                      {b.status === 'pending_cancellation' && b.cancellationReason && (
                        <div className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 font-bold bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded-none inline-block">
                          {t('reasonPrefix')}
                          {b.cancellationReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-2 font-mono text-[var(--ink)]">
                      {formatPrice(b.totalPrice)}
                    </td>
                    <td className="py-3 px-2">
                      <StatusBadge status={b.status} size="xs" />
                    </td>
                    <td className="py-3 px-2 text-right font-mono">
                      {b.status === 'pending' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[9px] font-mono text-amber-700 dark:text-amber-300">
                            {t('paymentDrivenGuestConfirmation')}
                          </span>
                          {isCourseBooking(b) ? (
                            onOpenEnrollment ? (
                              <button
                                type="button"
                                onClick={() => onOpenEnrollment(b.id)}
                                className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                              >
                                {t('openEnrollmentAttendance')}
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenLesson?.(b.id)}
                              className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                            >
                              {t('openLessonDetail')}
                            </button>
                          )}
                        </div>
                      )}
                      {b.status === 'pending_cancellation' && (
                        <div className="flex items-center justify-end gap-1.5">
                          {isCourseBooking(b) ? (
                            <button
                              type="button"
                              onClick={() => onOpenEnrollment?.(b.id)}
                              className="px-2.5 py-1 text-[10px] font-bold border border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 rounded-none transition cursor-pointer"
                            >
                              {t('openEnrollmentAttendance')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenLesson?.(b.id)}
                              className="px-2.5 py-1 text-[10px] font-bold border border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-50 rounded-none transition cursor-pointer"
                            >
                              {t('openCancellationDetail')}
                            </button>
                          )}
                        </div>
                      )}
                      {b.status === 'confirmed' && (
                        <div className="flex items-center justify-end gap-1.5">
                          {isCourseBooking(b) ? (
                            onOpenEnrollment ? (
                              <button
                                type="button"
                                onClick={() => onOpenEnrollment(b.id)}
                                className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                              >
                                {t('openEnrollmentAttendance')}
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenLesson?.(b.id)}
                              className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                            >
                              {t('openLessonDetail')}
                            </button>
                          )}
                        </div>
                      )}
                      {b.status === 'cancelled' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[10px] text-[var(--ink-dim)] italic font-mono">
                            {t('cancelledLabel')}
                          </span>
                          {isCourseBooking(b) ? (
                            onOpenEnrollment ? (
                              <button
                                type="button"
                                onClick={() => onOpenEnrollment(b.id)}
                                className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                              >
                                {t('openEnrollmentAttendance')}
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenLesson?.(b.id)}
                              className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                            >
                              {t('openLessonDetail')}
                            </button>
                          )}
                        </div>
                      )}
                      {b.status === 'completed' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 italic font-mono">
                            {t('finishedLabel')}
                          </span>
                          {isCourseBooking(b) ? (
                            onOpenEnrollment ? (
                              <button
                                type="button"
                                onClick={() => onOpenEnrollment(b.id)}
                                className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                              >
                                {t('openEnrollmentAttendance')}
                              </button>
                            ) : null
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenLesson?.(b.id)}
                              className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                            >
                              {t('openLessonDetail')}
                            </button>
                          )}
                        </div>
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
      <ApplePagination
        currentPage={monitorPage}
        totalPages={monitorTotalPages}
        totalItems={filteredBookings.length}
        itemsPerPage={10}
        onPageChange={setMonitorPage}
        itemLabel={t('totalSuffix') || 'items'}
      />
      {hasMoreBookings && onLoadMoreBookings && (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            onClick={onLoadMoreBookings}
            className="border border-[var(--border)] px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-[var(--ink)] transition hover:border-[var(--ink)]"
          >
            Load more bookings
          </button>
        </div>
      )}
    </div>
  );
};
