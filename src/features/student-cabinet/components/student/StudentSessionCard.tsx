import { memo } from 'react';
import { Phone } from 'lucide-react';
import { LessonLevelLabel } from '../../../settings/LessonLevelLabel';
import { LessonFeedbackIndicator } from '../LessonFeedbackIndicator';
import { ParticipantAvatarFace } from '../CabinetParticipantAvatarSwitcher';
import { ChatUnreadIndicator } from '../../../chat';
import { ScTextButton } from './StudentCabinetUI';
import { SessionParticipants } from './SessionParticipants';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import './studentSessionCard.css';

export interface StudentSessionCardInput {
  readonly sessionId: string;
  readonly levelId?: string;
  readonly title: string;
  readonly dayLabel: string;
  readonly timeRange: string;
  readonly disciplineLabel?: string;
  readonly coaches: readonly { name: string; avatarUrl?: string }[];
  readonly participants: readonly SessionParticipantInput[];
  readonly feedbackLessonId?: string;
  readonly onDetails?: () => void;
  readonly onChat?: () => void;
  readonly unreadChat?: boolean;
  readonly phoneHref?: string;
}

export const StudentSessionCard = memo(function StudentSessionCard({
  sessionId,
  levelId,
  title,
  dayLabel,
  timeRange,
  disciplineLabel,
  coaches,
  participants,
  feedbackLessonId,
  onDetails,
  onChat,
  unreadChat,
  phoneHref,
}: StudentSessionCardInput) {
  const { t, lang } = useStudentCabinetTranslations();
  return (
    <article className="sc-session-card" data-session-id={sessionId}>
      <div className="sc-session-card-heading">
        <h3 className="sc-session-card-title">
          <LessonLevelLabel levelId={levelId} language={lang} fallback={title} />
          {feedbackLessonId && <LessonFeedbackIndicator lessonBookingId={feedbackLessonId} />}
        </h3>
        <p className="sc-session-card-day">{dayLabel}</p>
      </div>
      <div className="sc-session-card-schedule">
        <p className="sc-session-card-time">{timeRange}</p>
        {disciplineLabel && <p className="sc-session-card-discipline">{disciplineLabel}</p>}
      </div>
      <div className="sc-session-card-coaches">
        {coaches.map((coach, index) => (
          <div className="sc-session-card-coach" key={index}>
            <span className="ui-avatar sc-session-avatar">
              <ParticipantAvatarFace url={coach.avatarUrl} name={coach.name} />
            </span>
            <span>{coach.name}</span>
          </div>
        ))}
      </div>
      <SessionParticipants participants={participants} avatarsOnly />
      {(onDetails || onChat || phoneHref) && (
        <div className="sc-session-card-actions">
          {onDetails && <ScTextButton onClick={onDetails}>{t('scMoreDetails')}</ScTextButton>}
          {onChat && (
            <ScTextButton onClick={onChat} title={t(unreadChat ? 'chatNewMessages' : 'chat')}>
              {t('chat')}
              <ChatUnreadIndicator show={unreadChat ?? false} />
            </ScTextButton>
          )}
          {phoneHref && (
            <a href={phoneHref}>
              <Phone aria-hidden size={16} />
              {t('scCallCoach')}
            </a>
          )}
        </div>
      )}
    </article>
  );
});
