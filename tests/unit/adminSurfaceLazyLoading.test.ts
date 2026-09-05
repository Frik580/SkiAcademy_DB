import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.9A.R.2B Admin surface lazy loading ownership', () => {
  const panel = () => readRepoFile('src/features/admin/components/AdminPanel.tsx');

  it('keeps only lightweight AdminDisplayChrome global above tabs', () => {
    const source = panel();
    expect(source).toContain('AdminDisplayChrome');
    expect(source.indexOf('<AdminDisplayChrome')).toBeLessThan(source.indexOf('<AdminTabNav'));
    expect(source).not.toMatch(/<AdminMonitorReadModelsProvider>[\s\S]*<AdminTabNav/);
    expect(source).not.toMatch(/<AdminFinancialOverviewHost[\s\S]*<AdminTabNav/);
  });

  it('scopes monitor provider and operational metrics to Operations only', () => {
    const source = panel();
    expect(source).toContain("activeTab === 'operations'");
    expect(source).toContain('AdminMonitorReadModelsProvider');
    expect(source).toContain('AdminOperationalMetricsHost');
    const operationsBlock = source.slice(
      source.indexOf("activeTab === 'operations'"),
      source.indexOf("activeTab === 'finance'")
    );
    expect(operationsBlock).toContain('AdminMonitorReadModelsProvider');
    expect(operationsBlock).toContain('AdminOperationalMetricsHost');
    expect(operationsBlock).toContain('AdminActiveBookingMonitor');
    expect(operationsBlock).toContain('AdminPlannerBoard');
    expect(operationsBlock).not.toContain('AdminFinancialOverviewHost');
  });

  it('scopes financial overview scan host to Finance only', () => {
    const source = panel();
    const financeBlock = source.slice(
      source.indexOf("activeTab === 'finance'"),
      source.indexOf("activeTab === 'people'")
    );
    expect(financeBlock).toContain('AdminFinancialOverviewHost');
    expect(financeBlock).toContain('AdminGuestFinanceHost');
    expect(financeBlock).toContain('CanonicalSchoolMovementPanel');
    expect(financeBlock).not.toContain('AdminMonitorReadModelsProvider');
    expect(financeBlock).not.toContain('AdminOperationalMetricsHost');
    expect(financeBlock).not.toContain('AdminPlannerBoard');
    expect(financeBlock).not.toContain('CoursesManager');
  });

  it('People and Product tabs do not mount monitor or finance overview', () => {
    const source = panel();
    const peopleBlock = source.slice(
      source.indexOf("activeTab === 'people'"),
      source.indexOf("activeTab === 'product'")
    );
    const productBlock = source.slice(
      source.indexOf("activeTab === 'product'"),
      source.indexOf("activeTab === 'system'")
    );
    const systemBlock = source.slice(source.indexOf("activeTab === 'system'"));

    for (const block of [peopleBlock, productBlock, systemBlock]) {
      expect(block).not.toContain('AdminMonitorReadModelsProvider');
      expect(block).not.toContain('AdminFinancialOverviewHost');
      expect(block).not.toContain('AdminOperationalMetricsHost');
      expect(block).not.toContain('AdminPlannerBoard');
    }
    expect(peopleBlock).toContain('AdminPeopleSection');
    expect(productBlock).toContain('CoursesManager');
  });

  it('finance overview host does not depend on monitor bookings', () => {
    const host = readRepoFile('src/features/admin/operations/AdminFinancialOverviewHost.tsx');
    expect(host).toContain('useAdminFinancialOverviewReadModel');
    expect(host).toContain('finance.item?.netSettledKzt');
    expect(host).not.toContain('useSharedAdminMonitorReadModels');
    expect(host).not.toContain('instructorsCount');
    expect(host).not.toContain('activeBookings');
  });

  it('instructor course detail loads only after selectedCourseId', () => {
    const sync = readRepoFile('src/features/instructor-courses/useInstructorCourseReadSync.ts');
    expect(sync).toContain('never eager-load all assigned courses');
    expect(sync).toContain('if (!input.selectedCourseId)');
    expect(sync).toContain('return [];');
    expect(sync).not.toContain('return [...input.assignedCourses];');
  });
});
