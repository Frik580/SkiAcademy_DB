import React, { useMemo } from 'react';
import {
  Award,
  ChevronRight,
  LucideIcon,
  Mountain,
  Settings,
  TrendingUp,
  Trophy,
  User,
  Video,
  CalendarRange,
} from 'lucide-react';
import { useLanguage, type TranslationKey } from '../../../lib/LanguageContext';
import { DEFAULT_SKILL_CONFIG } from '../../../lib/skillData';
import { AchievementsConfig } from '../../../lib/achievementConfig';
import { StudentCabinetContext } from './StudentCabinetHome';
import { StudentProfilePersonalSection } from './StudentProfilePersonalSection';
import { StudentProfilePreferencesSection } from './StudentProfilePreferencesSection';
import { SkillRadarChart } from './SkillRadarChart';
import { ScStatGrid, ScTextButton, StudentPanelBackLink } from './StudentCabinetUI';
import {
  buildStudentHistory,
  getAchievements,
  getSeasonBookings,
  getStudentStats,
  StudentCabinetTab,
} from './studentCabinetUtils';
import { calculateSkillProgress } from '../../../lib/skillData';
import { StudentHistoryList } from './StudentHistoryList';

type ProfileHubTab = Extract<
  StudentCabinetTab,
  | 'profile_personal'
  | 'profile_journey'
  | 'profile_skills'
  | 'profile_certificates'
  | 'profile_achievements'
  | 'profile_season'
  | 'profile_videos'
  | 'profile_preferences'
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
  const { t } = useLanguage();

  return (
    <div
      className={`pb-24 mx-auto pt-6 px-4 sm:px-6 w-full min-w-0 space-y-6 ${
        wide ? 'max-w-none' : 'max-w-3xl'
      }`}
    >
      <StudentPanelBackLink onClick={() => onGoToTab('settings')} labelKey="scNavProfile" />
      <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t(titleKey)}</h1>
      {children}
    </div>
  );
};

export const StudentProfileHubPanel: React.FC<Pick<StudentCabinetContext, 'onGoToTab'>> = ({
  onGoToTab,
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 pb-24 max-w-3xl mx-auto pt-6 px-4 sm:px-6 w-full min-w-0">
      <StudentPanelBackLink onClick={() => onGoToTab('home')} />
      <div className="space-y-1">
        <h1 className="text-2xl font-serif font-light text-[var(--ink)]">{t('scNavProfile')}</h1>
        <p className="text-sm text-[var(--ink-dim)]">{t('scProfileHubSub')}</p>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)]">
        {PROFILE_HUB_ITEMS.map(({ tab, labelKey, descKey, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onGoToTab(tab)}
            className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-[var(--border-subtle)]/40 transition-colors"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent)]/22 bg-[var(--accent-muted)]/45 text-[var(--accent)]">
              <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
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

interface ProfileSubPanelProps extends StudentCabinetContext {
  onSignOut: () => void;
  onUpdateProfile?: (data: Partial<import('../../../types').UserProfile>) => Promise<void>;
  onInvalidFile: () => void;
  onUploadSuccess: () => void;
  onUploadError: () => void;
  achievementsConfig?: AchievementsConfig;
  skillProgress: ReturnType<typeof calculateSkillProgress>;
  onToggleSkillToday?: (skillItemId: string, pinned: boolean) => void;
}

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
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

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
        dismissedReviewIds
      ),
    [userProfile, bookings, courses, reviews, lang, t, activityLogs, dismissedReviewIds]
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
  const { t } = useLanguage();

  return (
    <ProfilePanelShell titleKey="scProfileSkills" onGoToTab={onGoToTab}>
      <SkillRadarChart
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
  const { t } = useLanguage();

  return (
    <ProfilePanelShell titleKey="scProfileCertificates" onGoToTab={onGoToTab}>
      <p className="text-sm text-[var(--ink-dim)]">{t('scProfileCertificatesEmpty')}</p>
    </ProfilePanelShell>
  );
};

export const StudentProfileAchievementsPanel: React.FC<ProfileSubPanelProps> = ({
  onGoToTab,
  userProfile,
  bookings,
  courses,
  reviews,
  activityLogs = [],
  skillConfig,
  achievementsConfig,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';

  const achievements = useMemo(
    () =>
      getAchievements(
        userProfile,
        bookings,
        skillConfig,
        lang,
        activityLogs,
        reviews.filter((review) => review.userId === userProfile.uid),
        courses,
        achievementsConfig
      ),
    [userProfile, bookings, skillConfig, lang, activityLogs, reviews, courses, achievementsConfig]
  );

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
  bookings,
  skillConfig,
}) => {
  const { t } = useLanguage();
  const seasonYear = new Date().getFullYear();
  const skillItems = skillConfig?.items ?? DEFAULT_SKILL_CONFIG.items;
  const seasonBookings = useMemo(
    () => getSeasonBookings(bookings, userProfile.uid),
    [bookings, userProfile.uid]
  );
  const stats = useMemo(
    () => getStudentStats(userProfile, seasonBookings, skillItems),
    [userProfile, seasonBookings, skillItems]
  );

  return (
    <ProfilePanelShell titleKey="scProfileSeason" onGoToTab={onGoToTab}>
      <p className="text-sm text-[var(--ink-dim)]">
        {t('scProfileSeasonYear').replace('{year}', String(seasonYear))}
      </p>
      <ScStatGrid
        items={[
          { label: t('scLessonsCount'), value: stats.lessons, tint: 'sky' },
          { label: t('scHoursCount'), value: stats.hours, tint: 'green' },
          { label: t('scExercisesMastered'), value: stats.exercisesMastered, tint: 'purple' },
          { label: t('scPointsEarned'), value: stats.points, tint: 'orange' },
        ]}
      />
    </ProfilePanelShell>
  );
};

export const StudentProfileVideosPanel: React.FC<ProfileSubPanelProps> = ({ onGoToTab }) => {
  const { t } = useLanguage();

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
