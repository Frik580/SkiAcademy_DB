const TEST_SCOPE_COLLECTIONS = new Set([
  'test_actors',
  'test_actor_assignments',
  'test_sessions',
]);

export function isTestScopeCollection(name: string): boolean {
  return TEST_SCOPE_COLLECTIONS.has(name);
}

/** Empty TestSession registry docs for LIVE callable unit fakes. */
export function missingTestScopeCollection() {
  return {
    doc: () => ({
      get: async () => ({
        exists: false,
        data: () => undefined,
        get: () => undefined,
      }),
    }),
  };
}
