import { useId, useState } from 'react';
import {
  calculateParticipantStage,
  MASTERY_LEVELS,
} from '@ski-academy/shared-domain/canonical/participantLevelProgression';
import type { LevelOperation, LevelProgressInput, SkillConfig } from './levelProgressionContracts';
import { useLevelProgressionTranslations } from './useLevelProgressionTranslations';

export function ParticipantLevelPanel({
  progress,
  config,
  role,
  busy,
  onOperation,
  canCancelRequest,
}: {
  progress: LevelProgressInput;
  config: SkillConfig;
  role?: 'instructor' | 'admin';
  busy?: boolean;
  canCancelRequest?: boolean;
  onOperation?: (operation: LevelOperation) => void;
}) {
  const { text, language } = useLevelProgressionTranslations();
  const fieldId = useId();
  const [target, setTarget] = useState(progress.level === 4 ? 3 : progress.level + 1);
  const [category, setCategory] = useState<
    'initial_qualification' | 'correction' | 'expert_assessment' | 'other'
  >('expert_assessment');
  const [reasonText, setReasonText] = useState('');
  const [comment, setComment] = useState('');
  const stage = calculateParticipantStage(progress.level, progress.skillScores, config);
  const review = progress.levelState?.qualifications.some((q) => q.status === 'review');
  const request = progress.levelState?.request;
  const reason = { category, text: reasonText.trim() };
  const buttonClass =
    'border border-[var(--border)] rounded-lg px-3 py-2 type-button disabled:opacity-40';
  return (
    <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4 text-[var(--ink)]">
      <h4 className="type-card-title">
        {text.title}: {MASTERY_LEVELS.find((l) => l.id === progress.level)?.name}
      </h4>
      {stage.isMax ? (
        <p>{text.max}</p>
      ) : (
        <>
          <p>
            {text.stage}: {stage.earned} / {stage.maximum} · {text.required}: {stage.required}
          </p>
          <progress
            aria-label={text.stage}
            value={stage.earned}
            max={stage.maximum || 1}
            className="w-full accent-[var(--accent)]"
          />
          {stage.ready && <p role="status">{text.ready}</p>}
        </>
      )}
      {review && (
        <p role="status" className="text-amber-600 dark:text-amber-300">
          {text.review}
        </p>
      )}
      {progress.levelState &&
        (progress.levelState.assignedThroughLevel ??
          (progress.levelState.method === 'admin_assignment' ||
          progress.levelState.method === 'admin_request'
            ? progress.level - 1
            : 0)) > 0 && (
          <p className="type-caption">
            {text.assigned}{' '}
            {MASTERY_LEVELS.filter(
              (l) => l.id <= (progress.levelState?.assignedThroughLevel ?? progress.level - 1)
            )
              .map((l) => l.name)
              .join(', ')}
            .
          </p>
        )}
      {request && (
        <div className="space-y-1 type-caption">
          <p>
            {text[request.status]} · {MASTERY_LEVELS[request.fromLevel - 1]?.name} →{' '}
            {MASTERY_LEVELS[request.proposedLevel - 1]?.name}
          </p>
          <p>{request.reason.text}</p>
          {request.comment && <p>{request.comment}</p>}
          <time>
            {new Date(request.createdAt.seconds * 1000).toLocaleString(
              language === 'ru' ? 'ru-RU' : 'en-US',
              { timeZone: 'Asia/Almaty' }
            )}
          </time>
          {request.resolutionReason && <p>{request.resolutionReason.text}</p>}
        </div>
      )}
      {role && onOperation && (
        <fieldset disabled={busy} className="space-y-3 min-w-0">
          {role === 'instructor' && stage.ready && !review && (
            <button className={buttonClass} onClick={() => onOperation({ action: 'confirm' })}>
              {text.confirm}
            </button>
          )}
          {role === 'instructor' && canCancelRequest && request?.status === 'pending' && (
            <button
              className={buttonClass}
              onClick={() => onOperation({ action: 'cancel', requestId: request.requestId })}
            >
              {text.cancel}
            </button>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <label htmlFor={`${fieldId}-target`} className="type-caption">
              {role === 'admin' ? text.assign : text.request}
              <select
                id={`${fieldId}-target`}
                aria-label={role === 'admin' ? text.assign : text.request}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="block w-full bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-2"
              >
                {MASTERY_LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${fieldId}-reason`} className="type-caption">
              {text.reason}
              <select
                id={`${fieldId}-reason`}
                aria-label={text.reason}
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="block w-full bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-2"
              >
                <option value="initial_qualification">{text.initial}</option>
                <option value="correction">{text.correction}</option>
                <option value="expert_assessment">{text.expert}</option>
                <option value="other">{text.other}</option>
              </select>
            </label>
          </div>
          <textarea
            aria-label={text.reason}
            placeholder={text.reason}
            maxLength={2000}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-2"
          />
          {role === 'instructor' && (
            <textarea
              aria-label={text.comment}
              placeholder={text.comment}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-2"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={
                !reason.text ||
                target === progress.level ||
                (role === 'instructor' && request?.status === 'pending')
              }
              onClick={() =>
                onOperation(
                  role === 'admin'
                    ? { action: 'assign', level: target, reason }
                    : {
                        action: 'request',
                        level: target,
                        reason,
                        ...(comment.trim() ? { comment: comment.trim() } : {}),
                      }
                )
              }
            >
              {role === 'admin' ? text.assign : text.request}
            </button>
            {role === 'instructor' && review && (
              <button
                className={buttonClass}
                disabled={!reason.text}
                onClick={() => onOperation({ action: 'retain', reason })}
              >
                {text.retain}
              </button>
            )}
            {role === 'admin' && request?.status === 'pending' && (
              <>
                <button
                  className={buttonClass}
                  onClick={() => onOperation({ action: 'approve', requestId: request.requestId })}
                >
                  {text.approve}
                </button>
                <button
                  className={buttonClass}
                  disabled={!reason.text}
                  onClick={() =>
                    onOperation({ action: 'reject', requestId: request.requestId, reason })
                  }
                >
                  {text.reject}
                </button>
              </>
            )}
          </div>
        </fieldset>
      )}
    </section>
  );
}
