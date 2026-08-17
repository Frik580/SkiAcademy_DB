import React, { useState, useMemo, useEffect } from 'react';
import { Search, Check, X, Link2 } from 'lucide-react';
import { Booking, UserProfile, Instructor } from '../../../../types';
import { useLanguage, getDifficultyLabel } from '../../../../lib/LanguageContext';
import { useCurrency } from '../../../../lib/CurrencyContext';
import { isCourseBooking } from '../../../../lib/availabilitySlots';
import { formatBookingCreatedAt } from '../../../../lib/bookingCreatedAt';
import { StatusBadge } from '../../../../ui/StatusBadge';
import { LinkGuestBookingModal } from './LinkGuestBookingModal';
import { ApplePagination } from '../../../../ui/ApplePagination';

const shortenBookingId = (id: string): string => (id.length > 12 ? `${id.slice(0, 10)}…` : id);

interface BookingsLogProps {
  bookings: Booking[];
  usersList: UserProfile[];
  instructors: Instructor[];
  onConfirmBooking: (id: string) => Promise<void>;
  onCompleteBooking?: (id: string) => Promise<void>;
  onLinkGuestBooking?: (bookingId: string, targetUserId: string) => Promise<void>;
  onCancelBooking: (id: string) => Promise<void>;
  onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
  hasMoreBookings?: boolean;
  onLoadMoreBookings?: () => void;
}

export const BookingsLog: React.FC<BookingsLogProps> = ({
  bookings,
  usersList,
  instructors,
  onConfirmBooking,
  onCompleteBooking,
  onLinkGuestBooking,
  onCancelBooking,
  onRequestConfirm,
  hasMoreBookings = false,
  onLoadMoreBookings,
}) => {
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency();

  const [linkingBooking, setLinkingBooking] = useState<Booking | null>(null);
  const [monitorSearch, setMonitorSearch] = useState('');
  const [monitorStatusFilter, setMonitorStatusFilter] = useState<
    'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'pending_cancellation'
  >('all');
  const [monitorInstructorFilter, setMonitorInstructorFilter] = useState('all');
  const [monitorClientFilter, setMonitorClientFilter] = useState('all');
  const [monitorTypeFilter, setMonitorTypeFilter] = useState<'all' | 'courses' | 'lessons'>('all');
  const [monitorSortBy, setMonitorSortBy] = useState<
    'date_desc' | 'date_asc' | 'client_asc' | 'client_desc'
  >('date_desc');
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
      bookings
        .filter((b) => {
          if (b.userId?.startsWith('system_block_')) return false;
          const client = usersList.find((u) => u.uid === b.userId);
          const clientNameStr = (client?.displayName || '').toLowerCase();
          const guestNameStr = (b.guestName || '').toLowerCase();
          const guestPhoneStr = (b.guestPhone || '').toLowerCase();
          const guestEmailStr = (b.guestEmail || '').toLowerCase();
          const instructorNameStr = b.instructorName.toLowerCase();
          const notesStr = (b.notes || '').toLowerCase();
          const searchLower = monitorSearch.toLowerCase();
          const matchesSearch =
            !monitorSearch ||
            clientNameStr.includes(searchLower) ||
            guestNameStr.includes(searchLower) ||
            guestPhoneStr.includes(searchLower) ||
            guestEmailStr.includes(searchLower) ||
            instructorNameStr.includes(searchLower) ||
            notesStr.includes(searchLower) ||
            b.id.toLowerCase().includes(searchLower);

          const matchesStatus = monitorStatusFilter === 'all' || b.status === monitorStatusFilter;
          const matchesInstructor =
            monitorInstructorFilter === 'all' ||
            b.instructorId === monitorInstructorFilter ||
            b.instructorName === monitorInstructorFilter;
          const matchesClient =
            monitorClientFilter === 'all'
              ? true
              : monitorClientFilter === 'guests'
                ? b.isGuest || b.userId?.startsWith('guest_')
                : b.userId === monitorClientFilter;
          const isCourse = isCourseBooking(b);
          const matchesType =
            monitorTypeFilter === 'all' ||
            (monitorTypeFilter === 'courses' && isCourse) ||
            (monitorTypeFilter === 'lessons' && !isCourse);

          return (
            matchesSearch && matchesStatus && matchesInstructor && matchesClient && matchesType
          );
        })
        .sort((a, b) => {
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
                            onClick={() => setLinkingBooking(b)}
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
                            {client?.displayName || t('skierLabel')}
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
                        : getDifficultyLabel(b.difficulty as any, language, 'short')}
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] text-[var(--ink-dim)]">
                      <div>
                        {b.date} @ {b.time} ({b.durationHours}h)
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
                              onRequestConfirm(t('approveCancelConfirm'), async () => {
                                await onCancelBooking(b.id);
                              });
                            }}
                            className="px-2.5 py-1 text-[10px] font-bold border border-emerald-500 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 hover:text-white rounded-none transition cursor-pointer"
                            title={t('approveCancel')}
                          >
                            {t('approveCancel')}
                          </button>
                          <button
                            onClick={() => {
                              onRequestConfirm(t('declineCancelConfirm'), async () => {
                                await onConfirmBooking(b.id);
                              });
                            }}
                            className="px-2.5 py-1 text-[10px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                            title={t('rejectRequest')}
                          >
                            {t('decline')}
                          </button>
                        </div>
                      )}
                      {b.status === 'confirmed' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onCompleteBooking?.(b.id)}
                            className="px-2 py-0.5 text-[9px] font-bold border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] rounded-none transition cursor-pointer"
                          >
                            {t('completeBtn')}
                          </button>
                          <button
                            onClick={() => onCancelBooking(b.id)}
                            className="px-2 py-0.5 text-[9px] font-bold border border-rose-500/30 hover:border-rose-500 text-rose-500 rounded-none transition cursor-pointer"
                          >
                            {t('cancel')}
                          </button>
                        </div>
                      )}
                      {b.status === 'cancelled' && (
                        <span className="text-[10px] text-[var(--ink-dim)] italic font-mono">
                          {t('cancelledLabel')}
                        </span>
                      )}
                      {b.status === 'completed' && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 italic font-mono">
                          {t('finishedLabel')}
                        </span>
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

      <LinkGuestBookingModal
        isOpen={!!linkingBooking}
        onClose={() => setLinkingBooking(null)}
        booking={linkingBooking}
        usersList={usersList}
        onLinkBooking={async (bId, uId) => {
          if (onLinkGuestBooking) {
            await onLinkGuestBooking(bId, uId);
          }
        }}
      />
    </div>
  );
};
