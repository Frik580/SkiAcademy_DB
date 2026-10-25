import React from 'react';
import { Booking, Course, WalletLedgerEntry } from '../../../types';
import { StudentWalletHistoryList } from '../../../features/student-cabinet';
import { ScPageIntro } from '../../../features/student-cabinet';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { StudentCabinetTab } from '../../../features/student-cabinet';

export interface WalletPanelProps {
  userId: string;
  bookings: Booking[];
  courses: Course[];
  walletLedgerEntries?: WalletLedgerEntry[];
  onGoToTab?: (tab: StudentCabinetTab) => void;
  showBackLink?: boolean;
}

export const WalletPanel: React.FC<WalletPanelProps> = ({
  userId,
  bookings,
  courses,
  walletLedgerEntries = [],
  onGoToTab,
  showBackLink = true,
}) => {
  const { t } = useLanguage();

  return (
    <div className="pb-24 mx-auto pt-6 px-4 sm:px-6 w-full min-w-0 space-y-6 max-w-3xl">
      <ScPageIntro
        onBack={showBackLink && onGoToTab ? () => onGoToTab('settings') : undefined}
        backLabelKey="scNavProfile"
        title={t('scProfileWalletHistory')}
        subtitle={t('scProfileWalletHistorySub')}
      />
      <StudentWalletHistoryList
        userId={userId}
        bookings={bookings}
        courses={courses}
        ledgerEntries={walletLedgerEntries}
      />
    </div>
  );
};
