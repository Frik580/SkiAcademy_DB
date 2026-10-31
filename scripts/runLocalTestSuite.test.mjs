import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRequiredSuites,
  buildEmulatorTestStages,
  DATA_EMULATORS,
} from './runLocalTestSuite.mjs';

function reportFor(kind) {
  const expected =
    kind === 'functions'
      ? [
          [
            'bookingAttendanceMigrationGuard.emulator.test.ts',
            18,
            'runs the actual CLI twice and requires explicit cutover',
          ],
          ['bookingAttendanceCommands.emulator.test.ts', 30],
          ['chatMedia.emulator.test.ts', 32],
        ]
      : [
          ['dataReset.emulator.test.ts', 20],
          ['dataResetLiveFixtures.emulator.test.ts', 4],
          [
            'dataResetAuthorization.emulator.test.ts',
            8,
            'serializes parallel apply and requires new authorization for safe partial resume/bootstrap',
          ],
          ['guestConfirmationWork.emulator.test.ts', 24],
        ];
  return {
    success: true,
    testResults: expected.map(([file, count, required]) => ({
      name: `C:/repo/functions/src/test/${file}`,
      status: 'passed',
      assertionResults: Array.from({ length: count }, (_, i) => ({
        status: 'passed',
        title: i === 0 && required ? required : `assertion ${i}`,
      })),
    })),
  };
}

describe('local CI-parity runner', () => {
  it('runs data emulators without Functions to prevent trigger contention', () => {
    assert.equal(DATA_EMULATORS, 'auth,firestore,storage');
    const stages = buildEmulatorTestStages('/tmp/carve-results');
    assert.equal(stages.length, 3);
    assert.deepEqual(
      stages.map((stage) => stage.name),
      ['backend', 'reset', 'integration']
    );
    assert.ok(stages.every((stage) => stage.emulators.join(',') === DATA_EMULATORS));
    assert.deepEqual(stages[1].command, [
      'node',
      'scripts/runManifestTests.mjs',
      '--group',
      'reset',
    ]);
  });
  it('accepts executed canonical security and reset coverage', () => {
    assert.doesNotThrow(() => assertRequiredSuites(reportFor('functions'), 'functions'));
    assert.doesNotThrow(() => assertRequiredSuites(reportFor('reset'), 'reset'));
  });
  it('rejects silent skipping of important tests', () => {
    const r = reportFor('functions');
    r.testResults[1].assertionResults[0].status = 'skipped';
    assert.throws(() => assertRequiredSuites(r, 'functions'), /skipped or failed/);
  });
  it('rejects absent or too-small suites', () => {
    const r = reportFor('reset');
    r.testResults.pop();
    assert.throws(() => assertRequiredSuites(r, 'reset'), /exactly one/);
    const r2 = reportFor('reset');
    r2.testResults[2].assertionResults.pop();
    assert.throws(() => assertRequiredSuites(r2, 'reset'), /skipped or failed/);
  });
  it('rejects missing CLI and authorization rehearsal guards', () => {
    const r = reportFor('functions');
    r.testResults[0].assertionResults[0].title = 'wrong';
    assert.throws(() => assertRequiredSuites(r, 'functions'), /migration CLI/);
    const r2 = reportFor('reset');
    r2.testResults[2].assertionResults[0].title = 'wrong';
    assert.throws(() => assertRequiredSuites(r2, 'reset'), /authorization\/resume/);
  });
});
