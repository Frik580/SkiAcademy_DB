import React, { useMemo } from 'react';
import { KaspiPaymentPanel } from '../../kaspi-payments/KaspiPaymentPanel';
import { Booking, Course, WalletLedgerEntry } from '../../../types';
import { StudentWalletHistoryList } from '../../../features/student-cabinet';
import { ScPageIntro } from '../../../features/student-cabinet';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { StudentCabinetTab } from '../../../features/student-cabinet';
import { useAccountWalletHistory } from '../../wallet';
import { useWalletStore } from '../../wallet/walletStore';
import { ActionButton } from '../../../ui/ActionButton';
import { prepareAccountWalletHistory } from '../../../domain/wallet';
import { STUDENT_CABINET_CONTENT_CLASS } from '../../student-cabinet/components/student/studentCabinetPresentation';

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
  onGoToTab,
  showBackLink = true,
}) => {
  const { t, language } = useLanguage();
  const history = useAccountWalletHistory();
  const balanceError = useWalletStore(
    (state) => state.canonicalWalletAccountId === userId && state.canonicalWalletError
  );
  const retryBalance = useWalletStore((state) => state.refreshCanonicalWallet);
  const operations = useMemo(
    () =>
      prepareAccountWalletHistory(
        history.operations,
        bookings,
        courses,
        language === 'ru' ? 'ru' : 'en'
      ),
    [history.operations, bookings, courses, language]
  );

  return (
    <div className={`pb-24 pt-6 space-y-6 ${STUDENT_CABINET_CONTENT_CLASS}`}>
      <ScPageIntro
        onBack={showBackLink && onGoToTab ? () => onGoToTab('settings') : undefined}
        backLabelKey="scNavProfile"
        title={t('scProfileWalletHistory')}
        subtitle={t('scProfileWalletHistorySub')}
      />
      {balanceError && (
        <div role="alert" className="space-y-2">
          <p>{t('walletBalanceLoadError')}</p>
          <ActionButton onClick={retryBalance} size="sm">
            {t('retry')}
          </ActionButton>
        </div>
      )}
      <KaspiPaymentPanel accountId={userId} />
      <StudentWalletHistoryList {...history} operations={operations} />
    </div>
  );
};
