import { afterEach } from 'vitest';
import { createRequire } from 'node:module';

const guard = createRequire(import.meta.url)('../../scripts/testFirestoreNetworkGuard.cjs');
afterEach(() => {
  const violations = guard.violations.splice(0);
  if (violations.length) throw new Error(violations.join('\n'));
});
