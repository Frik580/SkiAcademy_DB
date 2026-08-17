import React, { useMemo, useState } from 'react';
import { ActivityLog, Booking, Course, Instructor, UserProfile } from '../../../../types';
import { SkillConfig } from '../../../../domain/achievements/skillData';
import {
  useLanguage,
  translateInstructor,
  type TranslationKey,
} from '../../../../app/providers/LanguageContext';
import { InstructorCard } from '../../../../features/profile';
import {
  ScDivider,
  ScSectionTitle,
  ScTextButton,
  ScTintCard,
  StudentPanelBackLink,
} from './StudentCabinetUI';
import { getMyInstructors, StudentCabinetTab } from './studentCabinetUtils';
import {
  formatMessageTimestamp,
  getInstructorHomeworkMessages,
  getInstructorLastLessonDate,
  getInstructorLessonCount,
  getInstructorMessageThreadIds,
  getInstructorRecommendations,
  getInstructorSkillComments,
  getInstructorVideoMessages,
  getPreferredChatBooking,
  getStudentBookingsWithInstructor,
  resolveInstructorUserId,
  resolveMessageLessonDate,
  resolveMessageCourseTitle,
} from './coachUtils';
import { useInstructorBookingMessages } from './useInstructorBookingMessages';
import { LessonRecommendationsList } from '../LessonRecommendationsList';
import {
  ChevronRight,
  ClipboardList,
  ExternalLink,
  ListChecks,
  LucideIcon,
  MessageSquare,
  MessageSquareText,
  Video,
} from 'lucide-react';

type CoachSubView = 'chat' | 'videos' | 'comments' | 'homework' | 'recommendations';
type CoachView = 'list' | CoachSubView;

const EMPTY_BOOKING_IDS: string[] = [];

const COACH_HUB_ITEMS: {
  view: CoachSubView;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: LucideIcon;
}[] = [
  {
    view: 'chat',
    labelKey: 'scCoachChat',
    descKey: 'scCoachChatSub',
    icon: MessageSquare,
  },
  {
    view: 'videos',
    labelKey: 'scCoachVideoReviews',
    descKey: 'scCoachVideoReviewsSub',
    icon: Video,
  },
  {
    view: 'comments',
    labelKey: 'scCoachComments',
    descKey: 'scCoachCommentsSub',
    icon: MessageSquareText,
  },
  {
    view: 'homework',
    labelKey: 'scCoachHomework',
    descKey: 'scCoachHomeworkSub',
    icon: ClipboardList,
  },
  {
    view: 'recommendations',
    labelKey: 'scRecommendations',
    descKey: 'scCoachRecommendationsSub',
    icon: ListChecks,
  },
];

interface StudentCoachPanelProps {
  bookings: Booking[];
  courses: Course[];
  instructors: Instructor[];
  userProfile: UserProfile;
  usersList?: UserProfile[];
  activityLogs?: ActivityLog[];
  skillConfig?: SkillConfig;
  onGoToTab: (tab: StudentCabinetTab) => void;
  onChat: (booking: Booking) => void;
  onOpenLesson: (booking: Booking) => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
  onBookInstructor: (instructor: Instructor) => void;
  onViewInstructorReviews?: (instructor: Instructor) => void;
}

export const StudentCoachPanel: React.FC<StudentCoachPanelProps> = ({
  bookings,
  courses,
  instructors,
  userProfile,
  usersList = [],
  activityLogs = [],
  skillConfig,
  onGoToTab,
  onChat,
  onOpenLesson,
  onToggleRecommendation,
  onBookInstructor,
  onViewInstructorReviews,
}) => {
  const { t, language } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const [view, setView] = useState<CoachView>('list');
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);

  const myInstructors = useMemo(
    () =>
      getMyInstructors(bookings, instructors, userProfile.uid, courses).map((ins) =>
        translateInstructor(ins, lang)
      ),
    [bookings, instructors, userProfile.uid, courses, lang]
  );

  const myInstructorIds = useMemo(() => new Set(myInstructors.map((i) => i.id)), [myInstructors]);

  const otherInstructors = useMemo(
    () =>
      instructors
        .filter((i) => !myInstructorIds.has(i.id) && i.isAvailable)
        .map((i) => translateInstructor(i, lang))
        .sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount),
    [instructors, myInstructorIds, lang]
  );

  const selectedInstructor = useMemo(() => {
    if (!selectedInstructorId) return null;
    const raw = instructors.find((i) => i.id === selectedInstructorId);
    return raw ? translateInstructor(raw, lang) : null;
  }, [instructors, selectedInstructorId, lang]);

  const messageThreadIds = useMemo(
    () =>
      selectedInstructorId && view !== 'list'
        ? getInstructorMessageThreadIds(bookings, courses, selectedInstructorId, userProfile.uid)
        : [],
    [bookings, courses, selectedInstructorId, userProfile.uid, view]
  );

  const { messages, loading: messagesLoading } = useInstructorBookingMessages(
    view !== 'list' ? messageThreadIds : EMPTY_BOOKING_IDS
  );

  const instructorBookings = useMemo(
    () =>
      selectedInstructorId && view !== 'list'
        ? getStudentBookingsWithInstructor(bookings, selectedInstructorId, userProfile.uid)
        : [],
    [bookings, selectedInstructorId, userProfile.uid, view]
  );

  const instructorUserId = selectedInstructor
    ? resolveInstructorUserId(selectedInstructor.id, usersList)
    : undefined;

  const openCoachSection = (instructorId: string, section: CoachSubView) => {
    setSelectedInstructorId(instructorId);
    setView(section);
  };

  const goBackToList = () => {
    setView('list');
    setSelectedInstructorId(null);
  };

  const videoMessages = selectedInstructor
    ? getInstructorVideoMessages(messages, selectedInstructor, instructorUserId)
    : [];
  const homeworkMessages = selectedInstructor
    ? getInstructorHomeworkMessages(messages, selectedInstructor, instructorUserId, userProfile.uid)
    : [];
  const skillComments = selectedInstructor
    ? getInstructorSkillComments(
        userProfile,
        skillConfig,
        lang,
        selectedInstructor.id,
        usersList,
        activityLogs
      )
    : [];
  const recommendationRows = selectedInstructor
    ? getInstructorRecommendations(bookings, courses, selectedInstructor.id, userProfile.uid, lang)
    : [];

  const renderList = () => (
    <>
      <StudentPanelBackLink onClick={() => onGoToTab('home')} />
      <div className="space-y-1">
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t('scNavCoach')}</h1>
        <p className="text-sm text-[var(--ink-dim)]">{t('scCoachHubSub')}</p>
      </div>

      {myInstructors.length === 0 && otherInstructors.length === 0 ? (
        <p className="text-sm text-[var(--ink-dim)] py-4">{t('scCoachNoInstructors')}</p>
      ) : (
        <div className="space-y-8">
          {myInstructors.length > 0 && (
            <section className="space-y-8">
              <ScSectionTitle>{t('scMyInstructors')}</ScSectionTitle>
              {myInstructors.map((ins) => {
                const lessonCount = getInstructorLessonCount(bookings, ins.id, userProfile.uid);
                const lastLesson = getInstructorLastLessonDate(
                  bookings,
                  courses,
                  ins.id,
                  userProfile.uid,
                  lang
                );
                return (
                  <div key={ins.id} className="space-y-4">
                    <InstructorCard
                      instructor={ins}
                      onBook={onBookInstructor}
                      onViewReviews={onViewInstructorReviews}
                      bookLabel={t('scBookAgain')}
                    />
                    <CoachExtendedActions
                      lessonCount={lessonCount}
                      lastLesson={lastLesson}
                      onSelect={(section) => openCoachSection(ins.id, section)}
                    />
                  </div>
                );
              })}
            </section>
          )}

          {myInstructors.length > 0 && otherInstructors.length > 0 && <ScDivider />}

          {otherInstructors.length > 0 && (
            <section className="space-y-8">
              <div className="space-y-1">
                <ScSectionTitle>{t('scAvailableInstructors')}</ScSectionTitle>
                <p className="text-sm text-[var(--ink-dim)]">{t('meetGuidesSub')}</p>
              </div>
              {otherInstructors.map((ins) => (
                <InstructorCard
                  key={ins.id}
                  instructor={ins}
                  onBook={onBookInstructor}
                  onViewReviews={onViewInstructorReviews}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </>
  );

  const renderChat = () => {
    if (!selectedInstructor) return null;
    const preferred = getPreferredChatBooking(bookings, selectedInstructor.id, userProfile.uid);

    return (
      <CoachSectionShell
        title={t('scCoachChat')}
        onBack={goBackToList}
        backLabel={selectedInstructor.name}
      >
        {instructorBookings.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('scCoachNoLessons')}</p>
        ) : (
          <div className="space-y-3">
            {preferred && (
              <ScTintCard tint="accent" className="px-4 py-3.5 space-y-2">
                <p className="text-xs text-[var(--ink-dim)]">{t('scCoachOpenLatestChat')}</p>
                <ScTextButton onClick={() => onChat(preferred)}>
                  {t('scCoachOpenChat')}
                </ScTextButton>
              </ScTintCard>
            )}
            <ScSectionTitle>{t('scCoachSelectLessonChat')}</ScSectionTitle>
            <div className="space-y-2">
              {instructorBookings.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => onChat(booking)}
                  className="w-full flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-left hover:bg-[var(--border-subtle)]/35 transition-colors"
                >
                  <span className="text-sm text-[var(--ink)]">
                    {resolveMessageLessonDate(booking.id, bookings, courses, lang)} · {booking.time}
                  </span>
                  <MessageSquare className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        )}
      </CoachSectionShell>
    );
  };

  const renderVideos = () => {
    if (!selectedInstructor) return null;

    return (
      <CoachSectionShell
        title={t('scCoachVideoReviews')}
        onBack={goBackToList}
        backLabel={selectedInstructor.name}
      >
        {messagesLoading ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('loading')}</p>
        ) : videoMessages.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('scCoachNoVideos')}</p>
        ) : (
          <div className="space-y-4">
            {[...videoMessages].reverse().map((msg) => (
              <ScTintCard key={msg.id} tint="purple" className="px-4 py-3.5 space-y-2">
                <p className="text-xs text-[var(--ink-dim)]">
                  {resolveMessageLessonDate(
                    msg.bookingId,
                    bookings,
                    courses,
                    lang,
                    userProfile.uid
                  )}{' '}
                  · {formatMessageTimestamp(msg.timestamp, lang)}
                </p>
                {msg.text?.trim() && (
                  <p className="text-sm text-[var(--ink)] leading-relaxed">{msg.text}</p>
                )}
                <video
                  src={msg.attachmentUrl}
                  controls
                  className="w-full rounded-lg max-h-64 bg-black/20"
                  preload="metadata"
                />
              </ScTintCard>
            ))}
          </div>
        )}
      </CoachSectionShell>
    );
  };

  const renderComments = () => {
    if (!selectedInstructor) return null;

    return (
      <CoachSectionShell
        title={t('scCoachComments')}
        onBack={goBackToList}
        backLabel={selectedInstructor.name}
      >
        {skillComments.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('scCoachNoComments')}</p>
        ) : (
          <div className="space-y-3">
            {skillComments.map(({ skillId, title, comment, score, maxPoints }) => (
              <ScTintCard key={skillId} tint="amber" className="px-4 py-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-dim)]">
                    {title}
                  </p>
                  <p className="text-xs font-semibold text-amber-600 tabular-nums shrink-0">
                    {t('scCoachSkillScore')
                      .replace('{earned}', String(score))
                      .replace('{max}', String(maxPoints))}
                  </p>
                </div>
                <p className="text-sm text-[var(--ink)] leading-relaxed">&ldquo;{comment}&rdquo;</p>
              </ScTintCard>
            ))}
          </div>
        )}
      </CoachSectionShell>
    );
  };

  const renderHomework = () => {
    if (!selectedInstructor) return null;

    return (
      <CoachSectionShell
        title={t('scCoachHomework')}
        onBack={goBackToList}
        backLabel={selectedInstructor.name}
      >
        {messagesLoading ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('loading')}</p>
        ) : homeworkMessages.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('scCoachNoHomework')}</p>
        ) : (
          <div className="space-y-3">
            {[...homeworkMessages].reverse().map((msg) => {
              const lessonDate = resolveMessageLessonDate(
                msg.bookingId,
                bookings,
                courses,
                lang,
                userProfile.uid
              );
              const courseTitle = resolveMessageCourseTitle(
                msg.bookingId,
                bookings,
                courses,
                lang,
                userProfile.uid
              );
              return (
                <ScTintCard key={msg.id} tint="green" className="px-4 py-3.5 space-y-2">
                  <div className="space-y-0.5">
                    {courseTitle && (
                      <p className="text-sm font-medium text-[var(--ink)]">{courseTitle}</p>
                    )}
                    <p className="text-xs text-[var(--ink-dim)]">
                      {lessonDate && `${lessonDate} · `}
                      {formatMessageTimestamp(msg.timestamp, lang)}
                    </p>
                  </div>
                  {msg.text?.trim() && (
                    <p className="text-sm text-[var(--ink)] leading-relaxed">{msg.text}</p>
                  )}
                  {msg.attachmentType === 'image' && msg.attachmentUrl && (
                    <a
                      href={msg.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block overflow-hidden border border-black/10 bg-black/5 max-w-full rounded-none"
                      title={t('chatAttachedPhotoAlt')}
                    >
                      <img
                        src={msg.attachmentUrl}
                        alt={msg.attachmentName || t('chatAttachedPhotoAlt')}
                        className="max-h-[220px] w-auto max-w-full object-contain mx-auto hover:scale-[1.02] transition-transform duration-300 cursor-zoom-in"
                        referrerPolicy="no-referrer"
                      />
                      {(msg.attachmentName || msg.attachmentSize) && (
                        <div className="p-1 px-2 text-[8px] font-mono text-[var(--ink-dim)] bg-black/15 flex items-center justify-between gap-2 border-t border-black/10">
                          <span className="truncate max-w-[150px]">{msg.attachmentName}</span>
                          {msg.attachmentSize && (
                            <span>{(msg.attachmentSize / 1024).toFixed(1)} KB</span>
                          )}
                        </div>
                      )}
                    </a>
                  )}
                  {msg.attachmentType === 'video' && msg.attachmentUrl && (
                    <video
                      src={msg.attachmentUrl}
                      controls
                      playsInline
                      className="w-full rounded-lg max-h-64 bg-black/20"
                      preload="metadata"
                    />
                  )}
                  {msg.attachmentType === 'link' && msg.attachmentUrl && (
                    <a
                      href={msg.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
                    >
                      {msg.attachmentName || msg.attachmentUrl}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  )}
                </ScTintCard>
              );
            })}
          </div>
        )}
      </CoachSectionShell>
    );
  };

  const renderRecommendations = () => {
    if (!selectedInstructor) return null;

    const byBooking = new Map<string, typeof recommendationRows>();
    recommendationRows.forEach((row) => {
      const list = byBooking.get(row.booking.id) ?? [];
      list.push(row);
      byBooking.set(row.booking.id, list);
    });

    return (
      <CoachSectionShell
        title={t('scRecommendations')}
        onBack={goBackToList}
        backLabel={selectedInstructor.name}
      >
        {recommendationRows.length === 0 ? (
          <p className="text-sm text-[var(--ink-dim)]">{t('scCoachNoRecommendations')}</p>
        ) : (
          <div className="space-y-4">
            {Array.from(byBooking.entries()).map(([bookingId, rows]) => {
              const booking = rows[0].booking;
              return (
                <ScTintCard key={bookingId} tint="amber" className="px-4 py-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-[var(--ink-dim)]">{rows[0].dateLabel}</p>
                    <ScTextButton onClick={() => onOpenLesson(booking)}>
                      {t('scMoreDetails')}
                    </ScTextButton>
                  </div>
                  <LessonRecommendationsList
                    booking={booking}
                    onToggle={onToggleRecommendation}
                    compact
                  />
                </ScTintCard>
              );
            })}
          </div>
        )}
      </CoachSectionShell>
    );
  };

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto pt-6 px-4 sm:px-6 w-full min-w-0">
      {view === 'list' && renderList()}
      {view === 'chat' && renderChat()}
      {view === 'videos' && renderVideos()}
      {view === 'comments' && renderComments()}
      {view === 'homework' && renderHomework()}
      {view === 'recommendations' && renderRecommendations()}
    </div>
  );
};

const CoachExtendedActions: React.FC<{
  lessonCount: number;
  lastLesson: string | null;
  onSelect: (view: CoachSubView) => void;
}> = ({ lessonCount, lastLesson, onSelect }) => {
  const { t } = useLanguage();

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--border-subtle)]/20">
        <p className="text-xs text-[var(--ink-dim)]">
          {t('scCoachLessonsCount').replace('{n}', String(lessonCount))}
          {lastLesson ? ` · ${t('scCoachLastLesson').replace('{date}', lastLesson)}` : ''}
        </p>
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {COACH_HUB_ITEMS.map(({ view, labelKey, descKey, icon: Icon }) => (
          <button
            key={view}
            type="button"
            onClick={() => onSelect(view)}
            className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-[var(--border-subtle)]/40 transition-colors"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/22 bg-[var(--accent-muted)]/45 text-[var(--accent)]">
              <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-[var(--ink)]">{t(labelKey)}</span>
              <span className="block text-xs text-[var(--ink-dim)] mt-0.5 truncate">
                {t(descKey)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-dim)]" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
};

const CoachSectionShell: React.FC<{
  title: string;
  backLabel: string;
  onBack: () => void;
  children: React.ReactNode;
}> = ({ title, backLabel, onBack, children }) => (
  <div className="space-y-6">
    <StudentPanelBackLink onClick={onBack} label={backLabel} />
    <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{title}</h1>
    {children}
  </div>
);
