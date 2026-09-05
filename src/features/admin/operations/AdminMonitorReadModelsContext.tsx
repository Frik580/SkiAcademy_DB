import React, { createContext, useCallback, useContext } from 'react';
import { useAdminMonitorReadModels } from './useAdminMonitorReadModels';

type AdminMonitorReadModelsValue = ReturnType<typeof useAdminMonitorReadModels> & {
  readonly refreshAll: () => Promise<void>;
};

const AdminMonitorReadModelsContext = createContext<AdminMonitorReadModelsValue | null>(null);

export function AdminMonitorReadModelsProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const monitor = useAdminMonitorReadModels();
  const refreshAll = useCallback(async () => {
    await Promise.all([
      monitor.lessonsHot.retryList(),
      monitor.lessonsHistory.retryList(),
      monitor.enrollmentsRoster.refreshList(),
      monitor.enrollmentsPending.refreshList(),
      monitor.enrollmentsHistory.refreshList(),
    ]);
  }, [
    monitor.enrollmentsHistory,
    monitor.enrollmentsPending,
    monitor.enrollmentsRoster,
    monitor.lessonsHistory,
    monitor.lessonsHot,
  ]);

  const value: AdminMonitorReadModelsValue = {
    ...monitor,
    refreshAll,
  };

  return (
    <AdminMonitorReadModelsContext.Provider value={value}>
      {children}
    </AdminMonitorReadModelsContext.Provider>
  );
}

export function useSharedAdminMonitorReadModels(): AdminMonitorReadModelsValue {
  const value = useContext(AdminMonitorReadModelsContext);
  if (!value) {
    throw new Error(
      'useSharedAdminMonitorReadModels requires AdminMonitorReadModelsProvider in the Admin shell.'
    );
  }
  return value;
}
