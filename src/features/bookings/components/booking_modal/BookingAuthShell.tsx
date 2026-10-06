import React from 'react';
import { motion } from 'motion/react';
import { Auth } from '../../../../features/auth';
import { BookingModalHeader } from './BookingModalHeader';
import { GuestBookingForm } from './GuestBookingForm';
import { useBookingModal } from './useBookingModal';
import { ActionButton } from '../../../../ui/ActionButton';
import { BOOKING_MODAL_SHELL_CLASS } from './bookingModalLayout';
import { GuestReservationStatus } from '../../../guest-reservations/GuestReservationStatus';
import { readGuestBookingCredential } from '../../../lesson-bookings/guestCredentialStorage';

interface BookingAuthShellProps {
  workspace: ReturnType<typeof useBookingModal>;
}

export const BookingAuthShell: React.FC<BookingAuthShellProps> = ({ workspace }) => {
  const { targetInstructor, t, unauthTab, setUnauthTab, onAuthSuccess } = workspace;

  if (!targetInstructor) return null;

  return (
    <motion.div
      key="signin-modal"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={BOOKING_MODAL_SHELL_CLASS}
      role="dialog"
      aria-modal="true"
      aria-label={t('bookLessonWith')}
      onClick={(e) => e.stopPropagation()}
    >
      <BookingModalHeader
        targetInstructor={targetInstructor}
        t={t}
        onClose={workspace.closeGuestStatus}
      />

      {!workspace.guestCreatedBookingId && (
        <div className="shrink-0 px-4 pt-3 sm:px-5">
          <button
            type="button"
            onClick={() => setUnauthTab(unauthTab === 'guest' ? 'auth' : 'guest')}
            className="text-xs text-[var(--ink-dim)] underline-offset-2 hover:underline"
          >
            {t(unauthTab === 'guest' ? 'guestCourseSignIn' : 'guestBookingTab')}
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {workspace.guestCreatedBookingId ? (
          <GuestReservationStatus
            kind="lesson"
            lifecycleStatus={workspace.guestReservation?.lifecycle.status ?? 'pending'}
            reasonCode={workspace.guestReservation?.lifecycle.reasonCode}
            reservationExpiresAt={workspace.guestReservation?.lifecycle.reservationExpiresAt}
            payment={workspace.guestReservation?.guestPaymentSummary}
            language={workspace.language}
            t={t}
            onRefresh={workspace.refreshGuestStatus}
            refreshing={workspace.guestRefreshing}
            refreshError={workspace.guestRefreshError}
            statusHydrated={Boolean(workspace.guestReservation)}
            onClose={workspace.closeGuestStatus}
            onNewBooking={workspace.startNewGuestBooking}
            profileCompletion={
              workspace.guestReservation?.guestParticipantProfile &&
              (workspace.guestReservation.guestParticipantProfile.age.kind === 'unknown' ||
                !workspace.guestReservation.guestParticipantProfile.skillLevel) &&
              workspace.guestReservation.lifecycle.status !== 'cancelled' &&
              readGuestBookingCredential(workspace.guestCreatedBookingId).credential
                ?.profileCompletionCredential ? (
                !workspace.showGuestProfileCompletion ? (
                  <button
                    type="button"
                    className="btn-secondary self-start px-4 py-2 text-sm"
                    onClick={workspace.openGuestProfileCompletion}
                  >
                    {t('guestCompleteProfile')}
                  </button>
                ) : (
                  <form onSubmit={workspace.completeGuestProfile} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs text-[var(--ink-dim)]">
                        <span>{t('participantsAgeLabel')} *</span>
                        <input
                          type="number"
                          required
                          min={0}
                          max={125}
                          step={1}
                          value={workspace.guestAgeYears}
                          onChange={(e) => workspace.setGuestAgeYears(e.target.value)}
                          className="ui-field-plain"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-[var(--ink-dim)]">
                        <span>{t('participantsSkillLabel')} *</span>
                        <select
                          required
                          value={workspace.guestProfileSkillLevel}
                          onChange={(e) => workspace.setGuestProfileSkillLevel(e.target.value)}
                          className="ui-field-plain"
                        >
                          <option value="" disabled>
                            —
                          </option>
                          {(
                            [
                              'beginner',
                              'intermediate',
                              'advanced',
                              'freeride',
                              'freestyle',
                            ] as const
                          ).map((skill) => (
                            <option key={skill} value={skill}>
                              {workspace.getDifficultyLabel(skill, workspace.language, 'booking')}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <ActionButton
                        type="submit"
                        pending={workspace.isCompletingGuestProfile}
                        pendingLabel={t('processing')}
                        className="btn-primary px-4 py-2 text-sm"
                      >
                        {t('guestSaveProfile')}
                      </ActionButton>
                      <button
                        type="button"
                        disabled={workspace.isCompletingGuestProfile}
                        onClick={() => workspace.setShowGuestProfileCompletion(false)}
                        className="btn-secondary px-4 py-2 text-sm"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </form>
                )
              ) : undefined
            }
            onCancelPending={
              readGuestBookingCredential(workspace.guestCreatedBookingId).credential
                ? workspace.cancelPendingGuestBooking
                : undefined
            }
          />
        ) : unauthTab === 'auth' ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            <p className="text-center text-xs leading-relaxed text-[var(--ink-dim)]">
              {t('bookingSignInPrompt')}
            </p>
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent p-4">
              <Auth onSuccess={onAuthSuccess || (() => {})} />
            </div>
          </div>
        ) : (
          <GuestBookingForm workspace={workspace} />
        )}
      </div>
    </motion.div>
  );
};
