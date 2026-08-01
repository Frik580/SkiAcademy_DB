import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, UserCheck, Link2, Check, User, AlertCircle } from 'lucide-react';
import { Booking, UserProfile } from '../../types';
import { useLanguage } from '../../lib/LanguageContext';
import { StatusBadge } from '../ui/StatusBadge';
import { logger } from '../../lib/logger';

interface LinkGuestBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  usersList: UserProfile[];
  onLinkBooking: (bookingId: string, targetUserId: string) => Promise<void>;
}

export const LinkGuestBookingModal: React.FC<LinkGuestBookingModalProps> = ({
  isOpen,
  onClose,
  booking,
  usersList,
  onLinkBooking,
}) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter clients to show registered client accounts (non-instructors / non-system)
  const clientUsers = useMemo(() => {
    const registered = usersList.filter((u) => !u.isInstructor && u.role !== 'admin');
    if (!searchTerm.trim()) return registered;

    const term = searchTerm.toLowerCase();
    return registered.filter((u) => {
      const nameMatch = (u.displayName || '').toLowerCase().includes(term);
      const emailMatch = (u.email || '').toLowerCase().includes(term);
      const phoneMatch = (u.phoneNumber || '').toLowerCase().includes(term);
      const uidMatch = u.uid.toLowerCase().includes(term);
      return nameMatch || emailMatch || phoneMatch || uidMatch;
    });
  }, [usersList, searchTerm]);

  if (!isOpen || !booking) return null;

  const selectedUser = usersList.find((u) => u.uid === selectedUserId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onLinkBooking(booking.id, selectedUserId);
      setSuccessMessage(t('bookingLinkedSuccess') || 'Заявка успешно привязана к клиенту');
      setTimeout(() => {
        setSuccessMessage(null);
        setSelectedUserId(null);
        setSearchTerm('');
        setErrorMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      logger.error('Failed to link booking:', err);
      setErrorMessage(
        err?.message || t('insufficientFundsForLink') || 'Не удалось привязать занятие к клиенту.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans text-[var(--ink)]">
      <div
        className="w-full max-w-lg border border-[var(--border)] bg-slate-50 dark:bg-slate-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono tracking-wide">
                {t('linkGuestBookingTitle')}
              </h3>
              <p className="text-[11px] text-[var(--ink-dim)] mt-0.5">{t('linkGuestBookingSub')}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setErrorMessage(null);
              onClose();
            }}
            disabled={isSubmitting}
            className="p-1 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer text-[var(--ink-dim)] hover:text-[var(--ink)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Alert */}
        {successMessage ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 flex items-center justify-center rounded-full">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {successMessage}
            </h4>
            {selectedUser && (
              <p className="text-xs text-[var(--ink-dim)]">
                {selectedUser.displayName} ({selectedUser.email || selectedUser.uid})
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-mono flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <div>
                  <span className="font-bold block">
                    {t('insufficientFundsLinkTitle') || 'Нехватка средств на счету клиента'}
                  </span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Booking Card Summary */}
            <div className="p-3 bg-black/5 dark:bg-white/5 border border-[var(--border)] space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--ink-dim)] uppercase tracking-wider font-bold">
                  {t('bookingId')}: {booking.id}
                </span>
                <StatusBadge status={booking.status} size="xs" />
              </div>

              <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-[var(--ink-dim)] block text-[10px]">
                    {t('dateTimeColumn')}
                  </span>
                  <span className="font-bold">
                    {booking.date} @ {booking.time} ({booking.durationHours}h)
                  </span>
                </div>
                <div>
                  <span className="text-[var(--ink-dim)] block text-[10px]">{t('coachLabel')}</span>
                  <span className="font-bold">{booking.instructorName}</span>
                </div>
                <div>
                  <span className="text-[var(--ink-dim)] block text-[10px]">
                    {t('costLabel') || 'Стоимость:'}
                  </span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    ${booking.totalPrice}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border)]/60 text-[11px]">
                <span className="text-[var(--ink-dim)] block text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">
                  {t('guestBadge')}
                </span>
                <div className="font-bold text-[var(--ink)] mt-0.5">
                  {booking.guestName || 'Незарегистрированный гость'}
                </div>
                {(booking.guestPhone || booking.guestEmail) && (
                  <div className="text-[10px] text-[var(--ink-dim)] flex flex-wrap gap-2 mt-0.5">
                    {booking.guestPhone && <span>📞 {booking.guestPhone}</span>}
                    {booking.guestEmail && <span>✉️ {booking.guestEmail}</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Client Search and Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold font-mono text-[var(--ink)] block">
                {t('selectClientToLink')}
              </label>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--ink-dim)] pointer-events-none" />
                <input
                  type="text"
                  placeholder={t('searchClientToLinkPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 border border-[var(--border)] bg-transparent text-xs text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] font-mono transition"
                />
              </div>

              <div className="max-h-52 overflow-y-auto border border-[var(--border)] divide-y divide-[var(--border)]/50 bg-black/5 dark:bg-white/5">
                {clientUsers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[var(--ink-dim)] font-mono">
                    {t('noClientsFoundForLink')}
                  </div>
                ) : (
                  clientUsers.map((user) => {
                    const isSelected = selectedUserId === user.uid;
                    const userBalance = user.balanceUSD ?? 0;
                    const isLowBalance =
                      booking.status === 'confirmed' && userBalance < booking.totalPrice;

                    return (
                      <div
                        key={user.uid}
                        onClick={() => {
                          setSelectedUserId(user.uid);
                          setErrorMessage(null);
                        }}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition ${
                          isSelected
                            ? 'bg-amber-500/15 border-l-4 border-l-amber-500'
                            : 'hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border border-[var(--border)] flex items-center justify-center shrink-0 overflow-hidden text-xs">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-[var(--ink-dim)]" />
                            )}
                          </div>
                          <div className="min-w-0 font-mono">
                            <div className="text-xs font-bold text-[var(--ink)] truncate">
                              {user.displayName || 'Без имени'}
                            </div>
                            <div className="text-[10px] text-[var(--ink-dim)] truncate">
                              {user.email || user.phoneNumber || user.uid}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 font-mono text-right">
                          <div>
                            <div
                              className={`text-xs font-bold ${isLowBalance ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}
                            >
                              ${userBalance}
                            </div>
                            {isLowBalance && (
                              <div className="text-[9px] text-red-500 font-sans uppercase font-bold">
                                {t('insufficientBalanceBadge') || 'Недостаточно средств'}
                              </div>
                            )}
                          </div>

                          {isSelected && (
                            <div className="p-1 bg-amber-500 text-white rounded-full shrink-0">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)] font-mono">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  onClose();
                }}
                disabled={isSubmitting}
                className="px-3 py-1.5 text-xs border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] transition cursor-pointer"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={!selectedUserId || isSubmitting}
                className="px-4 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1.5"
              >
                <UserCheck className="w-4 h-4" />
                {isSubmitting
                  ? t('saving')
                  : `${t('confirmLinkToClient')} ${selectedUser ? selectedUser.displayName : ''}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
