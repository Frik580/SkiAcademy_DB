import { describe, expect, it } from 'vitest';
import {
  formatCanonicalKztForDisplay,
  isUsdToKztDisplayRateAvailable,
} from '../../src/features/admin/operations/adminFinancialOverview';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.9A.1 FinancialOverview display', () => {
  it('formats canonical KZT and uses FX only for USD presentation', () => {
    expect(formatCanonicalKztForDisplay(80_000, 'KZT', 500)).toMatch(/80\s000 ₸/);
    expect(formatCanonicalKztForDisplay(80_000, 'USD', 500)).toBe('$160');
    expect(formatCanonicalKztForDisplay(0, 'KZT', 500)).toBe('0 ₸');
    expect(isUsdToKztDisplayRateAvailable(0)).toBe(false);
    expect(formatCanonicalKztForDisplay(80_000, 'USD', 0)).toMatch(/80\s000 ₸/);
  });

  it('does not present a failed overview query as zero revenue', () => {
    const host = readRepoFile('src/features/admin/operations/AdminFinancialOverviewHost.tsx');
    const overview = readRepoFile('src/features/admin/components/finance/FinancialOverview.tsx');
    expect(host).toContain('revenueError={finance.error}');
    expect(host).toContain('finance.error ? undefined : finance.item?.netSettledKzt');
    expect(overview).toContain('adminFinanceOverviewLoadFailed');
    expect(overview).not.toContain('revenueIsCanonicalKzt');
    expect(overview).toContain("t('totalRevenue')");
    expect(overview).toContain("t('activeLessons')");
    expect(overview).toContain("t('completedLessons')");
    expect(overview).toContain("t('allGuidesCount')");
    expect(overview).toContain('saveUsdToKztRate');
    expect(overview).toContain("(['day', 'week', 'month'] as const)");
  });
});
