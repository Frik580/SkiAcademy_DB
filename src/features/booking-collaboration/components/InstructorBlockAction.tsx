import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BodyScrollLock } from '../../../ui/BodyScrollLock';
import { Check, X } from 'lucide-react';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';
import type { ParticipantAccessControlsProps } from './ParticipantAccessControls';

export function InstructorBlockAction({
  access,
  loading,
  onBlock,
  onUnblock,
}: Pick<ParticipantAccessControlsProps, 'access' | 'loading' | 'onBlock' | 'onUnblock'>) {
  const { t, blockInstructor, unblockInstructor, blockReasonPlaceholder } =
    useBookingCollaborationTranslations();
  const reasonId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const blocked = access?.managerBlockStatus === 'active';
  useEffect(() => {
    if (!confirming) return;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('input, button')?.focus();
    const trigger = triggerRef.current;
    return () => trigger?.focus();
  }, [confirming]);
  useEffect(() => {
    if (confirming && loading) dialogRef.current?.focus();
  }, [confirming, loading]);
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
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        disabled={loading}
        onClick={() => {
          setReason('');
          setError('');
          setConfirming(true);
        }}
        className={`group/block-action relative inline-flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${blocked ? 'text-red-600' : 'text-green-700'}`}
      >
        {blocked ? (
          <X
            viewBox="5 5 14 14"
            className="absolute right-0 top-0 h-3 w-3 md:h-4 md:w-4 origin-top-right transition-transform duration-150 ease-out motion-safe:group-hover/block-action:scale-110 motion-reduce:scale-100 motion-reduce:transition-none"
            aria-hidden
          />
        ) : (
          <Check
            viewBox="3 5 18 18"
            className="absolute right-0 top-0 h-3 w-3 md:h-4 md:w-4 origin-top-right transition-transform duration-150 ease-out motion-safe:group-hover/block-action:scale-110 motion-reduce:scale-100 motion-reduce:transition-none"
            aria-hidden
          />
        )}
      </button>
      {confirming &&
        createPortal(
          <div className="ui-modal-overlay fixed inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
            <BodyScrollLock />
            <div
              tabIndex={-1}
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${reasonId}-title`}
              aria-describedby={`${reasonId}-body`}
              onKeyDownCapture={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  if (!loading) setConfirming(false);
                }
                if (event.key === 'Tab') {
                  const controls = Array.from(
                    event.currentTarget.querySelectorAll<HTMLElement>(
                      'input:not(:disabled), button:not(:disabled)'
                    )
                  );
                  if (controls.length === 0) event.preventDefault();
                  const first = controls[0];
                  const last = controls[controls.length - 1];
                  if (document.activeElement === event.currentTarget) {
                    event.preventDefault();
                    (event.shiftKey ? last : first)?.focus();
                  } else if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                  } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                  }
                }
              }}
              className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--card-bg)] p-5 text-[var(--ink)] shadow-xl space-y-4"
            >
              <h3 id={`${reasonId}-title`} className="type-section-title">
                {t(blocked ? 'collabUnblockTitle' : 'collabBlockTitle')}
              </h3>
              <p id={`${reasonId}-body`} className="type-compact">
                {t(blocked ? 'collabUnblockBody' : 'collabBlockBody')}
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
                className="space-y-4"
              >
                {!blocked && (
                  <label htmlFor={reasonId} className="block type-caption">
                    {blockReasonPlaceholder}
                    <input
                      id={reasonId}
                      required
                      disabled={loading}
                      maxLength={1000}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--card-bg)] p-2 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    />
                  </label>
                )}
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setConfirming(false)}
                    className="btn-secondary focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading || (!blocked && !reason.trim())}
                    className="btn-primary focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
                  >
                    {t(blocked ? 'collabUnblockConfirm' : 'collabBlockConfirm')}
                  </button>
                </div>
                {error && (
                  <p role="alert" className="type-caption text-red-600">
                    {error}
                  </p>
                )}
              </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
