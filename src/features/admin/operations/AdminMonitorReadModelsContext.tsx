import React, { createContext, useCallback, useContext, useRef } from 'react';
import { useAdminMonitorReadModels } from './useAdminMonitorReadModels';

type AdminMonitorReadModelsValue = ReturnType<typeof useAdminMonitorReadModels> & {
  readonly refreshAll: () => Promise<void>;
  readonly registerPlannerRefresh: (refresh: (() => Promise<void>) | null) => void;
  readonly refreshAllProjections: () => Promise<void>;
};

const AdminMonitorReadModelsContext = createContext<AdminMonitorReadModelsValue | null>(null);

export function AdminMonitorReadModelsProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const monitor = useAdminMonitorReadModels();
  const plannerRefreshRef = useRef<(() => Promise<void>) | null>(null);
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
  const registerPlannerRefresh = useCallback((refresh: (() => Promise<void>) | null) => {
    plannerRefreshRef.current = refresh;
  }, []);
  const refreshAllProjections = useCallback(async () => {
    await refreshAll();
    await plannerRefreshRef.current?.();
  }, [refreshAll]);

  const value: AdminMonitorReadModelsValue = {
    ...monitor,
    refreshAll,
    registerPlannerRefresh,
    refreshAllProjections,
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
      'useSharedAdminMonitorReadModels requires AdminMonitorReadModelsProvider on the Operations surface.'
    );
  }
  return value;
}
