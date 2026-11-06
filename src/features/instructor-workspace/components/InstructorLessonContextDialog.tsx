import { useEffect } from 'react';
import { UserRound } from 'lucide-react';
import { AdminModal } from '../../admin/components/AdminModal';
import { ParticipantLevelPanel } from '../../participant-progress/ParticipantLevelPanel';
import { DEFAULT_SKILL_CONFIG } from '../../../domain/achievements';
import { StatusBadge } from '../../../ui/StatusBadge';
import { ActionButton } from '../../../ui/ActionButton';
import type { InstructorLessonContextDialogProps } from '../instructorLessonContextContracts';
import { useInstructorLessonContext } from '../useInstructorLessonContext';
import { useInstructorLessonContextTranslations } from '../useInstructorLessonContextTranslations';
import {
  lessonContextComments,
  lessonContextSkills,
  lessonContextLevelName,
} from '../instructorLessonContextPresentation';
import './instructorLessonContext.css';

export function InstructorLessonContextDialog({
  context,
  skillConfig = DEFAULT_SKILL_CONFIG,
  authors,
  onClose,
  onOpenProgress,
  onOpenFeedback,
}: InstructorLessonContextDialogProps) {
  const { t, language } = useInstructorLessonContextTranslations();
  const { progress, feedback, retry } = useInstructorLessonContext(context);
  const skills =
    progress.status === 'ready' ? lessonContextSkills(progress.value, skillConfig, language) : [];
  const comments =
    progress.status === 'ready'
      ? lessonContextComments(progress.value, skillConfig, language, authors)
      : [];

  useEffect(() => {
    // AdminModal owns focus trapping/restoration. Make background controls inert as well.
    const root = document
      .querySelector('[data-testid="instructor-lesson-context"]')
      ?.closest('[data-admin-modal-root]');
    if (!root) return;
    const siblings = Array.from(document.body.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node !== root
    );
    const previous = siblings.map((node) => ({
      node,
      inert: node.inert,
      hidden: node.getAttribute('aria-hidden'),
    }));
    previous.forEach(({ node }) => {
      node.inert = true;
      node.setAttribute('inert', '');
      node.setAttribute('aria-hidden', 'true');
    });
    return () =>
      previous.forEach(({ node, inert, hidden }) => {
        node.inert = inert;
        if (!inert) node.removeAttribute('inert');
        if (hidden === null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', hidden);
      });
  }, []);

  const stateText = (status: string) =>
    t(
      status === 'loading'
        ? 'loading'
        : status === 'denied'
          ? 'lessonContextDenied'
          : status === 'unavailable'
            ? 'lessonContextUnavailable'
            : 'requestFailed'
    );
  return (
    <AdminModal
      title={`${t('lessonContextTitle')}: ${context.studentName}`}
      closeLabel={t('closeBtn')}
      onClose={onClose}
      width="xl"
      data-testid="instructor-lesson-context"
      footer={
        <>
          <ActionButton
            type="button"
            disabled={progress.status !== 'ready'}
            onClick={onOpenProgress}
          >
            {t(context.canAssess ? 'instructorAssess' : 'instructorViewProgress')}
          </ActionButton>
          <ActionButton
            type="button"
            disabled={feedback.status !== 'ready'}
            onClick={onOpenFeedback}
          >
            {t('instructorRecommendations')}
          </ActionButton>
        </>
      }
    >
      <div className="flex items-center gap-3 min-w-0">
        {context.avatar ? (
          <img
            src={context.avatar}
            alt=""
            className="w-12 h-12 rounded-full object-cover shrink-0"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center bg-[var(--profile-bg)]"
          >
            <UserRound className="w-6 h-6 text-[var(--ink-dim)]" />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <p className="type-body font-medium break-words">{context.studentName}</p>
          {context.discipline && (
            <p className="type-caption text-[var(--ink-dim)]">
              {t(
                context.discipline === 'ski'
                  ? 'participantsDisciplineSki'
                  : 'participantsDisciplineSnowboard'
              )}
            </p>
          )}
          {progress.status === 'ready' && (
            <p className="type-caption">
              {t('instructorCurrentLevel')}: {lessonContextLevelName(progress.value.level)}
            </p>
          )}
          <p className="type-caption">
            {context.date} · {context.time}
          </p>
          <StatusBadge status={context.status} size="xs" />
        </div>
      </div>
      {progress.status !== 'ready' ? (
        <div role="status" className="space-y-2">
          <p>{stateText(progress.status)}</p>
          {progress.status !== 'loading' && (
            <ActionButton type="button" onClick={retry}>
              {t('retry')}
            </ActionButton>
          )}
        </div>
      ) : (
        <>
          <section aria-label={t('lessonContextProgress')} className="space-y-2">
            <h3 className="type-card-title">{t('lessonContextProgress')}</h3>
            <ParticipantLevelPanel progress={progress.value} config={skillConfig} />
            {progress.value.revision === 0 && (
              <p className="type-caption text-[var(--ink-dim)]">
                {t('lessonContextEmptyProgress')}
              </p>
            )}
          </section>
          <section aria-label={t('lessonContextSkills')} className="space-y-3">
            <h3 className="type-card-title">{t('lessonContextSkills')}</h3>
            {skills.map((skill) => (
              <div key={skill.id} className="space-y-1 border-b border-[var(--border)] pb-3">
                <p className="type-body">{skill.title}</p>
                <p className="type-caption text-[var(--ink-dim)]">{skill.scoreLabel}</p>
                {skill.hasScore && (
                  <progress
                    aria-label={skill.title}
                    value={skill.earned}
                    max={skill.maximum || 1}
                    className="w-full accent-[var(--accent)]"
                  />
                )}
              </div>
            ))}
          </section>
          <section aria-label={t('lessonContextComments')} className="space-y-3">
            <h3 className="type-card-title">{t('lessonContextComments')}</h3>
            <p className="type-caption text-[var(--ink-dim)]">
              {t('lessonContextCurrentComments')}
            </p>
            {comments.length === 0 && <p>{t('lessonContextNoComments')}</p>}
            {comments.map((comment) => (
              <article
                key={comment.skillId}
                className="space-y-1 border-l-2 border-[var(--accent)] pl-3"
              >
                <h4 className="type-body font-medium">{comment.title}</h4>
                <p className="whitespace-pre-wrap break-words type-body">{comment.comment}</p>
                <p
                  className="type-caption text-[var(--ink-dim)]"
                  data-instructor-id={comment.attribution?.instructorId}
                >
                  {comment.authorName}
                  {comment.updatedAtLabel ? ` · ${comment.updatedAtLabel}` : ''}
                </p>
              </article>
            ))}
          </section>
        </>
      )}
      <section aria-label={t('instructorRecommendations')} className="space-y-2">
        <h3 className="type-card-title">{t('instructorRecommendations')}</h3>
        {feedback.status === 'ready' ? (
          feedback.value.items.length ? (
            <ul className="list-disc pl-5 space-y-2">
              {feedback.value.items.map((item) => (
                <li key={item.itemId} className="whitespace-pre-wrap break-words">
                  {item.text}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('lessonContextNoFeedback')}</p>
          )
        ) : (
          <p role="status">
            {feedback.status === 'unavailable'
              ? t('lessonContextFeedbackUnavailable')
              : stateText(feedback.status)}
          </p>
        )}
        {feedback.status === 'error' && (
          <ActionButton type="button" onClick={retry}>
            {t('retry')}
          </ActionButton>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="type-card-title">{t('lessonContextGoal')}</h3>
        <p className="type-caption text-[var(--ink-dim)]">{t('lessonContextNoGoal')}</p>
      </section>
    </AdminModal>
  );
}
