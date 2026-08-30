import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

describe('AdminIssue canonical UI boundary', () => {
  it('does not read canonical issue collections directly from Firestore', () => {
    const sources = [
      'src/features/admin/issues/AdminIssueCenter.tsx',
      'src/features/admin/issues/useAdminIssueReadModels.ts',
      'src/lib/canonical/canonicalReadModelClient.ts',
    ]
      .map(readRepoFile)
      .join('\n');

    expect(sources).not.toMatch(/from ['"]firebase\/firestore['"]/);
    expect(sources).not.toMatch(
      /(?:collection|doc|onSnapshot|getDocs|getDoc)\s*\([^)]*admin_issues/
    );
    expect(sources).toContain('queryAdminIssueReadModels');
  });

  it('contains no generic AdminIssue resolution mutation bypass', () => {
    const featureSource = readRepoFile('src/features/admin/issues/AdminIssueCenter.tsx');
    const functionsIndex = readRepoFile('functions/src/index.ts');

    expect(featureSource).not.toMatch(
      /executeCanonicalCommand|resolveAdminIssue|dismissAdminIssue/
    );
    expect(functionsIndex).not.toMatch(/export const (?:resolve|dismiss|mark).*AdminIssue/i);
    expect(featureSource).toContain('adminIssueActionsDeferred');
  });
});
