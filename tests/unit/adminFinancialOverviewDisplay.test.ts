import { describe, expect, it } from 'vitest';
import { formatCanonicalKztForDisplay } from '../../src/features/admin/operations/adminFinancialOverview';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.9A.1 FinancialOverview display', () => {
  it('formats canonical KZT only', () => {
    expect(formatCanonicalKztForDisplay(80_000)).toMatch(/80\s000 ₸/);
    expect(formatCanonicalKztForDisplay(0)).toBe('0 ₸');
  });

  it('does not present a failed overview query as zero revenue', () => {
    const host = readRepoFile('src/features/admin/operations/AdminFinancialOverviewHost.tsx');
    const overview = readRepoFile('src/features/admin/components/finance/FinancialOverview.tsx');
    const chrome = readRepoFile('src/features/admin/components/finance/AdminDisplayChrome.tsx');
    const operational = readRepoFile('src/features/admin/operations/AdminOperationalMetrics.tsx');
    expect(host).toContain('revenueError={finance.error}');
    expect(host).toContain('finance.error ? undefined : finance.item?.netSettledKzt');
    expect(overview).toContain('adminFinanceOverviewLoadFailed');
    expect(overview).not.toContain('revenueIsCanonicalKzt');
    expect(overview).toContain("t('totalRevenue')");
    expect(overview).toContain("(['day', 'week', 'month'] as const)");
    expect(chrome).toContain('₸ KZT');
    expect(chrome).not.toContain('saveUsdToKztRate');
    expect(chrome).not.toContain('setCurrency');
    expect(operational).toContain("t('activeLessons')");
    expect(operational).toContain("t('completedLessons')");
    expect(operational).toContain("t('allGuidesCount')");
  });
});
