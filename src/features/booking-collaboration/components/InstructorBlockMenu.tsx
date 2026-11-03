import { useId, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';
import type { ParticipantAccessControlsProps } from './ParticipantAccessControls';

export function InstructorBlockMenu({
  access,
  loading,
  onBlock,
  onUnblock,
}: Pick<ParticipantAccessControlsProps, 'access' | 'loading' | 'onBlock' | 'onUnblock'>) {
  const { t, blockInstructor, unblockInstructor, blockReasonPlaceholder } =
    useBookingCollaborationTranslations();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const blocked = access?.managerBlockStatus === 'active';
  const action = blocked ? onUnblock : onBlock;
  if (!action) return null;
  const label = blocked ? unblockInstructor : blockInstructor;
  const submit = async () => {
    if (loading || (!blocked && !reason.trim())) return;
    try {
      setError('');
      if (blocked) await onUnblock?.();
      else await onBlock?.(reason.trim());
      setConfirming(false);
      setOpen(false);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="relative flex justify-end">
      <button
        type="button"
        aria-label={t('instructorMoreActions')}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setConfirming(false);
        }}
        className="rounded-lg p-2 border border-[var(--border-subtle)]"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 w-72 max-w-[calc(100vw-3rem)] rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-3 shadow-lg space-y-3">
          {!confirming ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => setConfirming(true)}
              className="type-button"
            >
              {label}
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="space-y-3"
            >
              <p className="type-compact">{label}?</p>
              {!blocked && (
                <label htmlFor={reasonId} className="block type-caption">
                  {blockReasonPlaceholder}
                  <input
                    id={reasonId}
                    required
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-2"
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={loading || (!blocked && !reason.trim())}
                  className="type-button disabled:opacity-40"
                >
                  {t('confirmAction')}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setConfirming(false)}
                  className="type-button"
                >
                  {t('cancel')}
                </button>
              </div>
              {error && (
                <p role="alert" className="type-caption text-red-600">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
