import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, executionGroups } from './testManifest.mjs';
import { validateManifest } from './validateTestManifest.mjs';
import { runGroup, withInterruptHandlers } from './runManifestTests.mjs';
export { assertRequiredSuites } from './validateTestManifest.mjs';
export const DATA_EMULATORS = 'auth,firestore,storage';

// Kept as a reviewable description for the runner's existing isolation regressions.
export function buildEmulatorTestStages() {
  return executionGroups
    .filter((group) => ['backend', 'reset', 'integration'].includes(group.id))
    .map((group) => ({
      name: group.id,
      emulators: group.emulators,
      command: ['node', 'scripts/runManifestTests.mjs', '--group', group.id],
    }));
}
export async function runLocalTestSuite() {
  validateManifest();
  const started = Date.now();
  const ledgerDir = join(ROOT, '.scratch/test-egress');
  const previousLedgers = new Map(
    (existsSync(ledgerDir) ? readdirSync(ledgerDir) : []).map((name) => [
      name,
      statSync(join(ledgerDir, name)).mtimeMs,
    ])
  );
  const auditEgress = () => {
    const ledgers = existsSync(ledgerDir)
      ? readdirSync(ledgerDir).filter(
          (name) =>
            /^(vitest|e2e)-.*\.log$/.test(name) &&
            previousLedgers.get(name) !== statSync(join(ledgerDir, name)).mtimeMs
        )
      : [];
    const attempts = ledgers.reduce(
      (count, name) =>
        count +
        readFileSync(join(ledgerDir, name), 'utf8')
          .split(/\r?\n/)
          .filter((line) => line.trim()).length,
      0
    );
    return { ledgers, attempts: ledgers.length ? attempts : null };
  };
  let activeGroup;
  let groupStarted;
  const reportDir = join(ROOT, '.scratch/test-manifest', `local-${Date.now()}-${process.pid}`);
  mkdirSync(reportDir, { recursive: true });
  const summary = { status: 'RUNNING', startedAt: new Date().toISOString(), groups: [] };
  try {
    await withInterruptHandlers(async () => {
      for (const group of executionGroups) {
        console.log(`\n=== ${group.id} (${group.ciGate}) ===`);
        const stageStart = Date.now();
        activeGroup = group.id;
        groupStarted = stageStart;
        const result = await runGroup(group.id, { reportDir });
        summary.groups.push({ ...result, wallMs: Date.now() - stageStart });
        writeFileSync(join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2));
      }
    });
    const egress = auditEgress();
    if (egress.attempts !== 0) throw new Error('Missing or nonzero Firestore egress evidence');
    summary.status = 'PASS';
    console.log('PASS: all canonical manifest groups completed.');
  } catch (error) {
    summary.status = 'FAIL';
    summary.error = error.message;
    summary.failedGroup = { group: activeGroup, wallMs: Date.now() - groupStarted };
    throw error;
  } finally {
    summary.wallMs = Date.now() - started;
    summary.egress = auditEgress();
    writeFileSync(join(reportDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(`Preserved test results and stage durations: ${reportDir}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runLocalTestSuite();
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
