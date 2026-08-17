import React, { useMemo, useState } from 'react';
import { useLanguage } from '../../../../lib/LanguageContext';
import { ActivityLog, Booking, Course, Review, UserProfile } from '../../../../types';
import { buildStudentHistory, HistoryFilter } from './studentCabinetUtils';
import { ScSectionTitle, StudentPanelBackLink } from './StudentCabinetUI';
import { StudentHistoryList } from './StudentHistoryList';
import { useProfileStore } from '../../../../features/profile';
import { ActionButton } from '../../../../ui/ActionButton';

interface StudentHistoryPanelProps {
  userProfile: UserProfile;
  bookings: Booking[];
  courses: Course[];
  reviews: Review[];
  activityLogs?: ActivityLog[];
  dismissedReviewIds?: string[];
  onOpenLesson: (booking: Booking) => void;
  onWriteReview: (booking: Booking) => void;
  onOpenDevelopment: () => void;
  onBack: () => void;
  onToggleRecommendation?: (bookingId: string, recommendationId: string, checked: boolean) => void;
}

export const StudentHistoryPanel: React.FC<StudentHistoryPanelProps> = ({
  userProfile,
  bookings,
  courses,
  reviews,
  activityLogs = [],
  dismissedReviewIds = [],
  onOpenLesson,
  onWriteReview,
  onOpenDevelopment,
  onBack,
  onToggleRecommendation,
}) => {
  const { language, t } = useLanguage();
  const lang = language === 'ru' ? 'ru' : 'en';
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const activityLogsHasMore = useProfileStore((state) => state.activityLogsHasMore);
  const loadMoreActivityLogs = useProfileStore((state) => state.loadMoreActivityLogs);

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
    <div className="space-y-0 pb-24 max-w-3xl mx-auto w-full px-4 sm:px-6 min-w-0">
      <section className="py-6 space-y-4">
        <StudentPanelBackLink onClick={onBack} labelKey="scNavProfile" />
        <div className="space-y-1">
          <ScSectionTitle>{t('scHistoryFullTitle')}</ScSectionTitle>
          <p className="text-sm text-[var(--ink-dim)]">{t('scHistorySubtitle')}</p>
        </div>
        <StudentHistoryList
          events={history}
          bookings={bookings}
          courses={courses}
          reviews={reviews}
          dismissedReviewIds={dismissedReviewIds}
          filter={filter}
          onFilterChange={setFilter}
          showFilters
          groupByMonth
          showDateLabels={false}
          expandedTrainingCards
          onOpenLesson={onOpenLesson}
          onWriteReview={onWriteReview}
          onOpenDevelopment={onOpenDevelopment}
          onToggleRecommendation={onToggleRecommendation}
        />
        {activityLogsHasMore && (
          <div className="flex justify-center pt-3">
            <ActionButton onClick={loadMoreActivityLogs} size="sm">
              Load more history
            </ActionButton>
          </div>
        )}
      </section>
    </div>
  );
};
