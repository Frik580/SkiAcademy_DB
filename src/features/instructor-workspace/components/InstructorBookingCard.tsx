import React from 'react';
import { Calendar, Clock, MessageSquare, CheckCircle, Users } from 'lucide-react';
import { getDifficultyLabel } from '../../../app/providers/LanguageContext';
import { UserProfile } from '../../../types';
import { DisplayBooking, EnrichedCourseBooking, EnrichedBooking } from './useInstructorWorkspace';
import { StudentLevelControls } from './StudentLevelControls';
import { StudentAssessButton } from './StudentAssessButton';
import { InstructorRecommendationsEditor } from './InstructorRecommendationsEditor';
import { type TranslationKey, type Language } from '../../../app/providers/LanguageContext';
import { StatusBadge } from '../../../ui/StatusBadge';
import { ChatUnreadIndicator } from '../../chat/components/chat/ChatUnreadIndicator';
import { canInstructorEditRecommendations } from '../../../features/student-cabinet/lessonRecommendations';
import { LessonRecommendation } from '../../../types';

interface InstructorBookingCardProps {
  booking: DisplayBooking;
  usersList: UserProfile[];
  theme: string;
  language: Language;
  t: (key: TranslationKey) => string;
  onOpenChat: (booking: DisplayBooking) => void;
  hasUnreadChat?: (
    bookingOrId: string | import('../../../domain/chat').CourseChatBooking
  ) => boolean;
  onUpdateStatus: (bookingId: string, nextStatus: 'confirmed' | 'completed') => void;
  onUpdateStudentLevel: (studentUid: string, studentName: string, newLevel: number) => void;
  onOpenEval: (
    studentUid: string,
    studentName: string,
    studentLevel: number,
    existingScores?: Record<string, number>,
    existingComments?: Record<string, string>
  ) => void;
  onSaveRecommendations: (bookingId: string, items: LessonRecommendation[]) => Promise<void>;
}

export const InstructorBookingCard: React.FC<InstructorBookingCardProps> = ({
  booking,
  usersList,
  theme,
  language,
  t,
  onOpenChat,
  hasUnreadChat,
  onUpdateStatus,
  onUpdateStudentLevel,
  onOpenEval,
  onSaveRecommendations,
}) => {
  const isCourse = !('userId' in booking);
  const b = booking;

  const canEditRecs = canInstructorEditRecommendations(b.status);

  const courseBooking = booking as EnrichedCourseBooking;
  const individualBooking = booking as EnrichedBooking;

  const renderRecommendationsBlock = (bookingId: string, items: LessonRecommendation[] = []) => (
    <InstructorRecommendationsEditor
      bookingId={bookingId}
      initialItems={items}
      canEdit={canEditRecs}
      t={t}
      onSave={onSaveRecommendations}
    />
  );

  const renderClientRecommendations = (client: {
    bookingId: string;
    recommendations?: LessonRecommendation[];
  }) => renderRecommendationsBlock(client.bookingId, client.recommendations);

  const renderClientRow = (params: {
    uid: string;
    name: string;
    avatar?: string;
    showSetLevelLabel?: boolean;
    bookingId: string;
    recommendations?: LessonRecommendation[];
  }) => {
    const { uid, name, avatar, showSetLevelLabel, bookingId, recommendations } = params;
    const studentUser = usersList.find((u) => u.uid === uid);
    const studentLevel = studentUser?.level || 1;

    return (
      <div key={uid} className="w-full space-y-2">
        <div
          className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900/60 p-2.5 border border-slate-200/70 dark:border-slate-800/70 rounded-xs hover:border-slate-300 transition-colors duration-200 w-full"
          title={name}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
              {avatar ? (
                <img
                  src={avatar}
                  alt={name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] font-serif">
                  👤
                </div>
              )}
            </div>
            <span className="text-xs font-mono text-[var(--ink)] font-medium max-w-[140px] truncate">
              {name}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <StudentAssessButton
              t={t}
              onClick={() =>
                onOpenEval(
                  uid,
                  name,
                  studentLevel,
                  studentUser?.skillScores || {},
                  studentUser?.skillComments || {}
                )
              }
            />
            <StudentLevelControls
              studentUid={uid}
              usersList={usersList}
              theme={theme}
              t={t}
              badgeTitleKey={showSetLevelLabel ? 'instructorCurrentLevel' : 'instructorLevel'}
              selectLabelKey={showSetLevelLabel ? 'instructorLevel' : 'instructorLevelShort'}
              showSetLevelLabel={showSetLevelLabel}
              onChange={(newLevel) => onUpdateStudentLevel(uid, name, newLevel)}
            />
          </div>
        </div>
        {renderClientRecommendations({ bookingId, recommendations })}
      </div>
    );
  };

  const renderIndividualClient = () => {
    const studentUser = usersList.find((u) => u.uid === individualBooking.userId);
    const studentLevel = studentUser?.level || 1;
    const studentName = individualBooking.clientName || 'Student';

    return (
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900/60 p-2.5 border border-slate-200/70 dark:border-slate-800/70 rounded-xs hover:border-slate-300 transition-colors duration-200 w-full">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800">
            {individualBooking.clientAvatar ? (
              <img
                src={individualBooking.clientAvatar}
                alt={studentName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] font-serif">
                👤
              </div>
            )}
          </div>
          <div>
            <div className="text-xs font-mono text-[var(--ink)] font-medium flex items-center gap-1.5">
              {studentName}
              {individualBooking.isGuest && (
                <span className="px-1.5 py-0.2 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-mono rounded-xs border border-amber-500/30">
                  {t('guestBadge') || 'Гость'}
                </span>
              )}
            </div>
            {(individualBooking.guestPhone || individualBooking.guestEmail) && (
              <div className="text-[10px] font-mono text-[var(--ink-dim)] flex flex-wrap gap-2 mt-0.5">
                {individualBooking.guestPhone && (
                  <a href={`tel:${individualBooking.guestPhone}`} className="hover:text-accent">
                    📞 {individualBooking.guestPhone}
                  </a>
                )}
                {individualBooking.guestEmail && (
                  <a href={`mailto:${individualBooking.guestEmail}`} className="hover:text-accent">
                    ✉️ {individualBooking.guestEmail}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StudentAssessButton
            t={t}
            onClick={() =>
              onOpenEval(
                individualBooking.userId,
                studentName,
                studentLevel,
                studentUser?.skillScores || {},
                studentUser?.skillComments || {}
              )
            }
          />
          <StudentLevelControls
            studentUid={individualBooking.userId}
            usersList={usersList}
            theme={theme}
            t={t}
            badgeTitleKey="instructorCurrentLevel"
            selectLabelKey="instructorLevel"
            showSetLevelLabel
            onChange={(newLevel) =>
              onUpdateStudentLevel(individualBooking.userId, studentName, newLevel)
            }
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`border p-5 space-y-4 bg-[var(--card-bg)] rounded-xs shadow-xs transition-colors duration-300 ${
        isCourse
          ? 'border-violet-200 dark:border-violet-800/50 hover:border-violet-300 bg-violet-50/40 dark:bg-violet-950/20'
          : 'border-slate-200/70 dark:border-slate-800/70 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--ink)] font-bold">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              {b.date}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--ink)] font-bold">
              <Clock className="w-3.5 h-3.5 text-accent" />
              {b.time} ({b.durationHours}h)
            </div>
            <StatusBadge status={b.status} size="xs" />
          </div>

          <div className="p-3.5 border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 rounded-xs w-full space-y-2.5">
            <h5 className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink-dim)] flex items-center gap-1.5 font-bold">
              <Users className="w-3.5 h-3.5 text-accent" />
              {isCourse ? t('instructorCourseParticipants') : t('instructorLessonClient')}
              {isCourse ? ` (${courseBooking.clients.length})` : ''}
            </h5>
            <div className="flex flex-wrap gap-2">
              {isCourse
                ? courseBooking.clients.map((client) =>
                    renderClientRow({
                      uid: client.uid,
                      name: client.name,
                      avatar: client.avatar,
                      showSetLevelLabel: false,
                      bookingId: client.bookingId,
                      recommendations: client.recommendations,
                    })
                  )
                : renderIndividualClient()}
            </div>
            {!isCourse &&
              renderRecommendationsBlock(individualBooking.id, individualBooking.recommendations)}
          </div>

          <div
            className={`grid grid-cols-1 ${isCourse ? '' : 'md:grid-cols-2'} gap-4 text-xs font-mono text-[var(--ink-dim)] border-t border-slate-200/60 dark:border-slate-800/60 pt-3`}
          >
            <div>
              <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">
                {t('instructorDifficulty')}
              </span>
              <span className="text-[var(--ink)] font-bold">
                {getDifficultyLabel(b.difficulty, language, 'compact')}
              </span>
            </div>
            {!isCourse && (
              <div>
                <span className="uppercase text-[9px] tracking-wider text-[var(--ink-dim)] block mb-1">
                  {t('instructorStudentNotes')}
                </span>
                <span className="text-[var(--ink)] italic leading-relaxed block">
                  {b.notes || t('instructorNoNotes')}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full md:w-56 justify-end shrink-0 self-stretch">
          <button
            onClick={() => onOpenChat(b)}
            className="w-full py-2.5 px-4 badge-accent-outline text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-xs"
          >
            {isCourse ? (
              <Users className="w-4 h-4 text-accent" />
            ) : (
              <MessageSquare className="w-4 h-4 text-accent" />
            )}
            {isCourse ? t('instructorChatGroup') : t('instructorChatStudent')}
            <ChatUnreadIndicator show={hasUnreadChat?.(b) ?? false} />
          </button>

          {b.status === 'pending' && (
            <button
              onClick={() => onUpdateStatus(b.id, 'confirmed')}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-xs shadow-xs"
            >
              <CheckCircle className="w-4 h-4" />
              {t('instructorConfirmLesson')}
            </button>
          )}

          {b.status === 'confirmed' && (
            <button
              onClick={() => onUpdateStatus(b.id, 'completed')}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-xs shadow-xs"
            >
              <CheckCircle className="w-4 h-4" />
              {t('instructorCompleteLesson')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
