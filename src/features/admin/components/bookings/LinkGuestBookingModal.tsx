import React, { useState, useMemo } from 'react';
import { Search, UserCheck, Check, User, AlertCircle } from 'lucide-react';
import { Booking, UserProfile } from '../../../../types';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { StatusBadge } from '../../../../ui/StatusBadge';
import { ActionButton } from '../../../../ui/ActionButton';
import { logger } from '../../../../shared';
import { AdminModal } from '../AdminModal';

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

  return (
    <AdminModal
      title={t('linkGuestBookingTitle')}
      closeLabel={t('cancel')}
      closeDisabled={isSubmitting}
      width="lg"
      onClose={() => {
        setErrorMessage(null);
        onClose();
      }}
    >
      <p className="type-caption text-[var(--ink-dim)]">{t('linkGuestBookingSub')}</p>

      {/* Success Alert */}
      {successMessage ? (
        <div className="p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 flex items-center justify-center rounded-full">
            <Check className="w-6 h-6" />
          </div>
          <h4 className="type-card-title text-emerald-600 dark:text-emerald-400">
            {successMessage}
          </h4>
          {selectedUser && (
            <p className="type-caption text-[var(--ink-dim)]">
              {selectedUser.displayName} ({selectedUser.email || selectedUser.uid})
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 type-caption flex items-start gap-2">
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
          <div className="p-3 bg-black/5 dark:bg-white/5 border border-[var(--border)] space-y-2 type-caption">
            <div className="flex items-center justify-between">
              <span className="type-caption text-[var(--ink-dim)] uppercase font-medium">
                {t('bookingId')}: {booking.id}
              </span>
              <StatusBadge status={booking.status} size="xs" />
            </div>

            <div className="grid grid-cols-1 gap-2 type-caption pt-1 sm:grid-cols-3">
              <div>
                <span className="text-[var(--ink-dim)] block type-caption">
                  {t('dateTimeColumn')}
                </span>
                <span className="font-bold">
                  {booking.date} @ {booking.time} ({booking.durationHours}h)
                </span>
              </div>
              <div>
                <span className="text-[var(--ink-dim)] block type-caption">{t('coachLabel')}</span>
                <span className="font-bold">{booking.instructorName}</span>
              </div>
              <div>
                <span className="text-[var(--ink-dim)] block type-caption">
                  {t('costLabel') || 'Стоимость:'}
                </span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {booking.totalPrice.toLocaleString('ru-RU')} ₸
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--border)]/60 type-caption">
              <span className="text-[var(--ink-dim)] block type-caption uppercase font-medium text-amber-600 dark:text-amber-400">
                {t('guestBadge')}
              </span>
              <div className="font-bold text-[var(--ink)] mt-0.5">
                {booking.guestName || 'Незарегистрированный гость'}
              </div>
              {(booking.guestPhone || booking.guestEmail) && (
                <div className="type-caption text-[var(--ink-dim)] flex flex-wrap gap-2 mt-0.5">
                  {booking.guestPhone && <span>📞 {booking.guestPhone}</span>}
                  {booking.guestEmail && <span>✉️ {booking.guestEmail}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Client Search and Selection */}
          <div className="space-y-2">
            <label className="type-caption font-medium text-[var(--ink)] block">
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
                className="ui-field-plain pl-9 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>

            <div className="max-h-52 overflow-y-auto border border-[var(--border)] divide-y divide-[var(--border)]/50 bg-black/5 dark:bg-white/5">
              {clientUsers.length === 0 ? (
                <div className="p-4 text-center type-caption text-[var(--ink-dim)]">
                  {t('noClientsFoundForLink')}
                </div>
              ) : (
                clientUsers.map((user) => {
                  const isSelected = selectedUserId === user.uid;

                  return (
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      key={user.uid}
                      onClick={() => {
                        setSelectedUserId(user.uid);
                        setErrorMessage(null);
                      }}
                      className={`w-full p-2.5 flex items-center justify-between text-left cursor-pointer transition ${
                        isSelected
                          ? 'bg-amber-500/15 border-l-4 border-l-amber-500'
                          : 'hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 border border-[var(--border)] flex items-center justify-center shrink-0 overflow-hidden type-caption">
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
                        <div className="min-w-0 font-sans">
                          <div className="type-caption font-medium text-[var(--ink)] truncate">
                            {user.displayName || 'Без имени'}
                          </div>
                          <div className="type-caption text-[var(--ink-dim)] truncate">
                            {user.email || user.phoneNumber || user.uid}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 font-sans text-right">
                        {isSelected && (
                          <div className="p-1 bg-amber-500 text-white rounded-full shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="admin-modal-actions">
            <ActionButton
              type="button"
              size="sm"
              unstyled
              onClick={() => {
                setErrorMessage(null);
                onClose();
              }}
              disabled={isSubmitting}
              className="btn-secondary flex-1 px-4 py-3 type-button"
            >
              {t('cancel')}
            </ActionButton>
            <ActionButton
              type="submit"
              size="sm"
              unstyled
              pending={isSubmitting}
              pendingLabel={t('saving')}
              disabled={!selectedUserId}
              className="btn-primary flex-1 px-4 py-3"
            >
              <UserCheck className="w-4 h-4" />
              {`${t('confirmLinkToClient')} ${selectedUser ? selectedUser.displayName : ''}`}
            </ActionButton>
          </div>
        </form>
      )}
    </AdminModal>
  );
};
