import { useRef, useState } from 'react';
import { ArrowRight, Flag } from 'lucide-react';
import { formatPointsGain } from '../../../../lib/i18n/pluralize';
import type { StudentNextStepInput } from './studentNextStepContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import './studentNextStep.css';

export const StudentNextStepCard = ({
  action,
  description,
  contextLabel,
  loading,
  loadError,
  onStartExercise,
  onOpenRecommendation,
  recommendationAvailable = true,
  onContinueDevelopment,
  className = '',
}: StudentNextStepInput) => {
  const { t, language } = useStudentCabinetTranslations();
  const pinLock = useRef(false);
  const [pending, setPending] = useState(false);
  const [pinError, setPinError] = useState(false);
  const title =
    action.kind === 'exercise'
      ? action.exerciseTitle
      : action.kind === 'recommendation'
        ? action.label
        : t('scNextStepExploreDevelopment');

  const body =
    description ||
    (action.kind === 'exercise'
      ? (action.levelProgressDelta > 0
          ? t('scNextStepPotentialProgress')
          : t('scNextStepPotentialPoints')
        )
          .replace('{pointsLabel}', formatPointsGain(action.pointsGain, language))
          .replace('{delta}', String(action.levelProgressDelta))
          .replace('{level}', String(action.targetLevel))
      : action.kind === 'recommendation'
        ? t('scNextStepInstructorTask')
        : t('scNextStepCompleteBody'));

  const pin = async () => {
    if (action.kind !== 'exercise' || action.pinned || pinLock.current || !onStartExercise) return;
    pinLock.current = true;
    setPending(true);
    setPinError(false);
    try {
      await onStartExercise(action.exerciseId);
    } catch {
      setPinError(true);
    } finally {
      pinLock.current = false;
      setPending(false);
    }
  };

  return (
    <div className={`sc-next-step-content ${className}`} aria-busy={pending || loading}>
      {loading ? (
        <p role="status" className="sc-next-step-description">
          {t('loading')}
        </p>
      ) : loadError ? (
        <p role="alert" className="sc-next-step-description">
          {t('requestFailed')}
        </p>
      ) : (
        <>
          <h3 className="sc-next-step-name">{title}</h3>
          <p className="sc-next-step-description">{body}</p>
          {contextLabel && (
            <div className="sc-next-step-context">
              <Flag size={16} aria-hidden="true" />
              <span>{contextLabel}</span>
            </div>
          )}
          {pinError && (
            <p role="alert" className="sc-next-step-error">
              {t('requestFailed')}
            </p>
          )}
          {action.kind === 'exercise' && onStartExercise && (
            <button
              type="button"
              className="btn-primary sc-next-step-primary"
              onClick={() => void pin()}
              disabled={pending || action.pinned}
            >
              {pending
                ? t('saving')
                : action.pinned
                  ? t('scNextStepAdded')
                  : t('scNextStepAddTask')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
          {action.kind === 'recommendation' && recommendationAvailable && (
            <button
              type="button"
              className="btn-primary sc-next-step-primary"
              onClick={() => onOpenRecommendation(action.bookingId)}
            >
              {t('scNextStepOpenLesson')}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          )}
        </>
      )}
      <button type="button" onClick={onContinueDevelopment} className="sc-next-step-development">
        {t('scNextStepExploreDevelopment')}
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
};
