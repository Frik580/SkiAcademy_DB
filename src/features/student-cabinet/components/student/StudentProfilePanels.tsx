import React, { useMemo } from 'react';
import {
  Award,
  LucideIcon,
  Mountain,
  Settings,
  TrendingUp,
  Trophy,
  User,
  Users,
  Video,
  CalendarRange,
  Wallet,
} from 'lucide-react';
import { type TranslationKey } from '../../../../app/providers/LanguageContext';
import { DEFAULT_SKILL_CONFIG } from '../../../../domain/achievements';
import { StudentProfilePersonalSection } from './StudentProfilePersonalSection';
import { StudentProfilePreferencesSection } from './StudentProfilePreferencesSection';
import { LazySkillRadarChart } from './LazySkillRadarChart';
import {
  ScEditorialHubList,
  ScPageIntro,
  ScPageTitle,
  SC_PAGE_INTRO_CLASS,
  ScStatGrid,
  ScTextButton,
  StudentPanelBackLink,
} from './StudentCabinetUI';
import {
  buildStudentHistory,
  StudentCabinetTab,
} from './studentCabinetUtils';
import { StudentHistoryList } from './StudentHistoryList';
import { WalletPanel } from '../../../../features/profile';
import type { StudentProfileHubInput, StudentProfilePanelProps } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';
import { usePresentedParticipantLessonFeedback } from '../../usePresentedParticipantLessonFeedback';
import { useSelectedParticipantLessonStats } from '../../useSelectedParticipantLessonStats';
import {
  accountReviewsFromLegacy,
  usePresentedParticipantAchievements,
} from '../../../participant-achievements';
import { ParticipantManagementPanel } from '../../../participants/components/ParticipantManagementPanel';

type ProfileHubTab = Extract<
  StudentCabinetTab,
  | 'profile_personal'
  | 'profile_wallet'
  | 'profile_journey'
  | 'profile_skills'
  | 'profile_certificates'
  | 'profile_achievements'
  | 'profile_season'
  | 'profile_videos'
  | 'profile_preferences'
  | 'profile_participants'
>;

const PROFILE_HUB_ITEMS: {
  tab: ProfileHubTab;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: LucideIcon;
}[] = [
  {
    tab: 'profile_personal',
    labelKey: 'scProfilePersonal',
    descKey: 'scProfilePersonalSub',
    icon: User,
  },
  {
    tab: 'profile_participants',
    labelKey: 'scProfileParticipants',
    descKey: 'scProfileParticipantsSub',
    icon: Users,
  },
  {
    tab: 'profile_wallet',
    labelKey: 'scProfileWalletHistory',
    descKey: 'scProfileWalletHistorySub',
    icon: Wallet,
  },
  {
    tab: 'profile_journey',
    labelKey: 'scProfileJourney',
    descKey: 'scProfileJourneySub',
    icon: Mountain,
  },
  {
    tab: 'profile_skills',
    labelKey: 'scProfileSkills',
    descKey: 'scProfileSkillsSub',
    icon: TrendingUp,
  },
  {
    tab: 'profile_certificates',
    labelKey: 'scProfileCertificates',
    descKey: 'scProfileCertificatesSub',
    icon: Award,
  },
  {
    tab: 'profile_achievements',
    labelKey: 'scProfileAchievements',
    descKey: 'scProfileAchievementsSub',
    icon: Trophy,
  },
  {
    tab: 'profile_season',
    labelKey: 'scProfileSeason',
    descKey: 'scProfileSeasonSub',
    icon: CalendarRange,
  },
  {
    tab: 'profile_videos',
    labelKey: 'scProfileVideos',
    descKey: 'scProfileVideosSub',
    icon: Video,
  },
  {
    tab: 'profile_preferences',
    labelKey: 'scProfilePreferences',
    descKey: 'scProfilePreferencesSub',
    icon: Settings,
  },
];

interface ProfilePanelShellProps {
  titleKey: TranslationKey;
  onGoToTab: (tab: StudentCabinetTab) => void;
  children: React.ReactNode;
  wide?: boolean;
}

const ProfilePanelShell: React.FC<ProfilePanelShellProps> = ({
  titleKey,
  onGoToTab,
  children,
  wide = false,
}) => {
  const { t } = useStudentCabinetTranslations();

  return (
    <div
      className={`pb-24 mx-auto pt-6 px-4 sm:px-6 w-full min-w-0 space-y-6 ${
        wide ? 'max-w-none' : 'max-w-3xl'
      }`}
    >
      <div className={SC_PAGE_INTRO_CLASS}>
        <StudentPanelBackLink onClick={() => onGoToTab('settings')} labelKey="scNavProfile" />
        <ScPageTitle>{t(titleKey)}</ScPageTitle>
      </div>
      {children}
    </div>
  );
};

export const StudentProfileHubPanel: React.FC<StudentProfileHubInput> = ({ onGoToTab }) => {
  const { t } = useStudentCabinetTranslations();

  return (
    <div className="space-y-8 pb-24 max-w-3xl mx-auto pt-6 px-4 sm:px-6 w-full min-w-0">
      <ScPageIntro
        onBack={() => onGoToTab('home')}
        title={t('scNavProfile')}
        subtitle={t('scProfileHubSub')}
      />
      <ScEditorialHubList
        items={PROFILE_HUB_ITEMS.map(({ tab, labelKey, descKey, icon }) => ({
          id: tab,
          label: t(labelKey),
          description: t(descKey),
          icon,
          onClick: () => onGoToTab(tab),
        }))}
      />
    </div>
  );
};

type ProfileSubPanelProps = StudentProfilePanelProps;

export const StudentProfilePersonalPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
  onUpdateProfile,
  onInvalidFile,
  onUploadSuccess,
  onUploadError,
}) => (
  <ProfilePanelShell titleKey="scProfilePersonal" onGoToTab={onGoToTab}>
    <StudentProfilePersonalSection
      userProfile={userProfile}
      onUpdateProfile={onUpdateProfile}
      onInvalidFile={onInvalidFile}
      onUploadSuccess={onUploadSuccess}
      onUploadError={onUploadError}
    />
  </ProfilePanelShell>
);

export const StudentProfileParticipantsPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
}) => (
  <ProfilePanelShell titleKey="scProfileParticipants" onGoToTab={onGoToTab}>
    <ParticipantManagementPanel accountId={userProfile.uid} />
  </ProfilePanelShell>
);

export const StudentProfileWalletPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
  bookings,
  courses,
  walletLedgerEntries = [],
}) => (
  <WalletPanel
    userId={userProfile.uid}
    bookings={bookings}
    courses={courses}
    walletLedgerEntries={walletLedgerEntries}
    onGoToTab={onGoToTab}
    showBackLink
  />
);

export const StudentProfileJourneyPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
  bookings,
  courses,
  reviews,
  activityLogs = [],
  dismissedReviewIds = [],
  onOpenLesson,
  onWriteReview,
  onContinueDevelopment,
  onToggleRecommendation,
}) => {
  const { language, t } = useStudentCabinetTranslations();
  const lang = language === 'ru' ? 'ru' : 'en';
  const feedback = usePresentedParticipantLessonFeedback(bookings);
  const pendingByLessonId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [lessonBookingId, flags] of feedback.flagsByLessonId) {
      if (flags.hasPending) {
        map.set(lessonBookingId, feedback.pendingCountForLesson(lessonBookingId));
      }
    }
    return map;
  }, [feedback]);

  const history = useMemo(
    () =>
      buildStudentHistory(
        userProfile,
        bookings,
        courses,
        reviews,
        lang,
        t,
        activityLogs,
        dismissedReviewIds,
        pendingByLessonId
      ),
    [
      userProfile,
      bookings,
      courses,
      reviews,
      lang,
      t,
      activityLogs,
      dismissedReviewIds,
      pendingByLessonId,
    ]
  );

  return (
    <ProfilePanelShell titleKey="scProfileJourney" onGoToTab={onGoToTab}>
      <StudentHistoryList
        events={history}
        bookings={bookings}
        courses={courses}
        reviews={reviews}
        dismissedReviewIds={dismissedReviewIds}
        filter="all"
        limit={5}
        onOpenLesson={onOpenLesson}
        onWriteReview={onWriteReview}
        onOpenDevelopment={onContinueDevelopment}
        onToggleRecommendation={onToggleRecommendation}
      />
      {history.length > 0 && (
        <ScTextButton arrow onClick={() => onGoToTab('history')}>
          {t('scHistoryShowAll')}
        </ScTextButton>
      )}
    </ProfilePanelShell>
  );
};

export const StudentProfileSkillsPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
  skillConfig,
  onToggleSkillToday,
}) => {
  const { t } = useStudentCabinetTranslations();

  return (
    <ProfilePanelShell titleKey="scProfileSkills" onGoToTab={onGoToTab}>
      <LazySkillRadarChart
        userProfile={userProfile}
        skillConfig={skillConfig}
        onToggleSkillToday={onToggleSkillToday}
        compact={false}
      />
      <ScTextButton arrow onClick={() => onGoToTab('development')}>
        {t('scContinueDevelopment')}
      </ScTextButton>
    </ProfilePanelShell>
  );
};

export const StudentProfileCertificatesPanel: React.FC<ProfileSubPanelProps> = ({ onGoToTab }) => {
  const { t } = useStudentCabinetTranslations();

  return (
    <ProfilePanelShell titleKey="scProfileCertificates" onGoToTab={onGoToTab}>
      <p className="text-sm text-[var(--ink-dim)]">{t('scProfileCertificatesEmpty')}</p>
    </ProfilePanelShell>
  );
};

export const StudentProfileAchievementsPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  reviews,
  selectedParticipantId,
  skillConfig,
  achievementsConfig,
}) => {
  const { language, t } = useStudentCabinetTranslations();
  const lang = language === 'ru' ? 'ru' : 'en';
  const accountReviews = useMemo(
    () => accountReviewsFromLegacy(reviews.filter((review) => Boolean(review.userId))),
    [reviews]
  );
  const { achievements } = usePresentedParticipantAchievements({
    selectedParticipantId,
    language: lang,
    accountReviews,
    achievementsConfig,
    skillConfig,
  });

  return (
    <ProfilePanelShell titleKey="scProfileAchievements" onGoToTab={onGoToTab}>
      {achievements.length === 0 ? (
        <p className="text-sm text-[var(--ink-dim)]">{t('scProfileAchievementsEmpty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {achievements.map((item) => (
            <span
              key={item.id}
              className="inline-flex flex-col gap-0.5 rounded-full border border-[#FFD60A]/28 bg-[#FFD60A]/10 px-3 py-1.5 text-sm text-[var(--ink)]"
            >
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </span>
              {item.earnedAtLabel && (
                <span className="text-[10px] text-[var(--ink-dim)] pl-6">{item.earnedAtLabel}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </ProfilePanelShell>
  );
};

export const StudentProfileSeasonPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
  skillConfig,
  selectedParticipantId,
}) => {
  const { t } = useStudentCabinetTranslations();
  const skillItems = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const { season, seasonYear, loaded } = useSelectedParticipantLessonStats(selectedParticipantId);
  const scores = userProfile.skillScores || {};
  const points = Object.values(scores).reduce((a, b) => a + b, 0);
  const exercisesMastered = skillItems.filter(
    (item) => item.maxPoints > 0 && (scores[item.id] ?? 0) >= item.maxPoints
  ).length;
  const lessonsValue = loaded ? season.completedCount : '—';
  const hoursValue = loaded ? Math.round(season.trainingHours) : '—';

  return (
    <ProfilePanelShell titleKey="scProfileSeason" onGoToTab={onGoToTab}>
      <p className="text-sm text-[var(--ink-dim)]">
        {t('scProfileSeasonYear').replace('{year}', String(seasonYear))}
      </p>
      <ScStatGrid
        items={[
          { label: t('scLessonsCount'), value: lessonsValue, tint: 'sky' },
          { label: t('scHoursCount'), value: hoursValue, tint: 'green' },
          { label: t('scExercisesMastered'), value: exercisesMastered, tint: 'purple' },
          { label: t('scPointsEarned'), value: points, tint: 'orange' },
        ]}
      />
    </ProfilePanelShell>
  );
};

export const StudentProfileVideosPanel: React.FC<ProfileSubPanelProps> = ({ onGoToTab }) => {
  const { t } = useStudentCabinetTranslations();

  return (
    <ProfilePanelShell titleKey="scProfileVideos" onGoToTab={onGoToTab}>
      <p className="text-sm text-[var(--ink-dim)]">{t('scProfileVideosEmpty')}</p>
    </ProfilePanelShell>
  );
};

export const StudentProfilePreferencesPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
  onSignOut,
  onUpdateProfile,
}) => (
  <ProfilePanelShell titleKey="scProfilePreferences" onGoToTab={onGoToTab}>
    <StudentProfilePreferencesSection
      userProfile={userProfile}
      onSignOut={onSignOut}
      onUpdateProfile={onUpdateProfile}
    />
  </ProfilePanelShell>
);
