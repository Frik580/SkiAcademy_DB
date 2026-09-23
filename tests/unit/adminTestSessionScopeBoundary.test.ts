import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ADMIN_SOURCE_ROOT = join(process.cwd(), 'src/features/admin');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

describe('Admin TestSession scope boundary', () => {
  it('keeps requestedTestSessionId opt-in limited to Testing and canonical Finance', () => {
    const consumers = sourceFiles(ADMIN_SOURCE_ROOT)
      .filter((path) => readFileSync(path, 'utf8').includes('requestedTestSessionId'))
      .map((path) => relative(ADMIN_SOURCE_ROOT, path).replaceAll('\\', '/'))
      .sort();

    expect(consumers).toEqual([
      'components/finance/CanonicalFinancePanel.tsx',
      'components/finance/useAdminFinanceReadModels.ts',
      'testing/AdminTestingPanel.tsx',
    ]);
  });
});
