#!/usr/bin/env node
/**
 * Validates en/ru translation key parity in translations.ts.
 * Usage: node scripts/check-translations.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', '--config', 'vitest.config.ts', 'tests/unit/translationsParity.test.ts'],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }
);

process.exit(result.status ?? 1);
