import React, { useMemo } from 'react';
import { Link2 } from 'lucide-react';
import { Booking, UserProfile } from '../../../../types';
import {
  useLanguage,
  formatLessonDifficultyOrUnspecified,
} from '../../../../app/providers/LanguageContext';
import { useCurrency } from '../../../../app/providers/CurrencyContext';
import { formatBookingCreatedAt } from '../../../../domain/booking';
import { StatusBadge } from '../../../../ui/StatusBadge';
import { AdminMonitorLessonStatusBadge } from '../../operations/AdminMonitorLessonStatusBadge';
import { isCourseBooking } from '../../../../domain/availability';

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
  onOpenLesson?: (bookingId: string) => void;
  onOpenEnrollment?: (enrollmentId: string) => void;
}

export const BookingsLog: React.FC<BookingsLogProps> = ({
  bookings,
  usersList,
  onOpenLesson,
  onOpenEnrollment,
}) => {
  const { t, language } = useLanguage();
  const { formatPrice } = useCurrency();

  const visibleBookings = useMemo(
    () => bookings.filter((booking) => !booking.userId?.startsWith('system_block_')),
    [bookings]
  );

  return (
    <div className="space-y-4 transition-colors duration-300 w-full min-w-0 overflow-hidden">
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
            {visibleBookings.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="text-center py-6 text-xs text-[var(--ink-dim)] font-mono"
                >
                  {t('noScheduledSessions')}
                </td>
              </tr>
            ) : (
              visibleBookings.map((b) => {
                const client = usersList.find((u) => u.uid === b.userId);
                const instructorName = b.instructorName;
                return (
                  <tr
                    key={b.id}
                    className="border-b border-[var(--border)]/40 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition"
                  >
                    <td
                      className="py-3 px-1 w-[4.5rem] max-w-[4.5rem] font-mono text-[9px] text-[var(--ink-dim)] truncate align-top"
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
                      {!isCourseBooking(b) && b.canonicalLifecycleStatus ? (
                        <AdminMonitorLessonStatusBadge booking={b} />
                      ) : (
                        <StatusBadge status={b.status} size="xs" />
                      )}
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
    </div>
  );
};
