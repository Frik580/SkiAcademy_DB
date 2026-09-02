import { useMemo } from 'react';
import { CanonicalGuestFinancePanel } from '../finance/CanonicalGuestFinancePanel';
import { useAdminMonitorReadModels } from '../operations/useAdminMonitorReadModels';
import type { UserProfile } from '../../../types';
import { guestFinanceRowsFromReadModels } from './adminGuestFinanceRows';

interface AdminGuestFinanceHostProps {
  readonly adminAccountId: string;
  readonly accounts: UserProfile[];
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export function AdminGuestFinanceHost(props: AdminGuestFinanceHostProps) {
  const {
    lessonsHot,
    lessonsHistory,
    enrollmentsRoster,
    enrollmentsPending,
    enrollmentsHistory,
  } = useAdminMonitorReadModels();
  const rows = useMemo(
    () =>
      guestFinanceRowsFromReadModels(
        [...lessonsHot.list.items, ...lessonsHistory.list.items],
        [
          ...enrollmentsRoster.list.items,
          ...enrollmentsPending.list.items,
          ...enrollmentsHistory.list.items,
        ]
      ),
    [
      enrollmentsHistory.list.items,
      enrollmentsPending.list.items,
      enrollmentsRoster.list.items,
      lessonsHistory.list.items,
      lessonsHot.list.items,
    ]
  );
  return <CanonicalGuestFinancePanel {...props} rows={rows} />;
}
