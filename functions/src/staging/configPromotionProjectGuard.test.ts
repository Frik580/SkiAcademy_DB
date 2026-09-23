import { describe, expect, it } from 'vitest';
import { assertConfigPromotionProject } from './configPromotionProjectGuard';

describe('configuration promotion project guard', () => {
  it('accepts only the exact staging source and exact production target', () => {
    expect(assertConfigPromotionProject({ role: 'source', explicitProjectId: 'ski-school-staging', env: {} })).toBe('ski-school-staging');
    expect(assertConfigPromotionProject({ role: 'target', explicitProjectId: 'ski-school-8f3ca', env: {} })).toBe('ski-school-8f3ca');
  });

  it('rejects production as source and staging as target', () => {
    expect(() => assertConfigPromotionProject({ role: 'source', explicitProjectId: 'ski-school-8f3ca', env: {} })).toThrow();
    expect(() => assertConfigPromotionProject({ role: 'target', explicitProjectId: 'ski-school-staging', env: {} })).toThrow();
  });

  it('rejects missing or conflicting project ids and emulator routing', () => {
    expect(() => assertConfigPromotionProject({ role: 'target', env: {} })).toThrow(/missing/i);
    expect(() => assertConfigPromotionProject({
      role: 'source', explicitProjectId: 'ski-school-staging', env: { GCLOUD_PROJECT: 'ski-school-8f3ca' },
    })).toThrow(/conflicting/i);
    expect(() => assertConfigPromotionProject({
      role: 'target', explicitProjectId: 'ski-school-8f3ca', env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    })).toThrow(/emulator/i);
  });
});
