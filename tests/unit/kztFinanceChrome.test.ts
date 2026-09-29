import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('KZT finance chrome', () => {
  it('uses currency-neutral iconography in the KZT financial overview', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/features/admin/components/finance/FinancialOverview.tsx'),
      'utf8'
    );

    expect(source).toContain('Banknote');
    expect(source).not.toContain('DollarSign');
  });
});
