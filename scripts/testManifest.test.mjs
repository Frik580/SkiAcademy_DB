import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ROOT, suites, executionGroups, deferredSuites } from './testManifest.mjs';
import {
  discoverTests,
  matches,
  selectFiles,
  validateManifest,
  validateResults,
} from './validateTestManifest.mjs';
import { runGroup, runProcess, vitestArgs } from './runManifestTests.mjs';
const copy = (value) => structuredClone(value);
const inventory = JSON.parse(
  readFileSync(new URL('./testManifest.inventory.json', import.meta.url), 'utf8')
);
const files = Object.keys(inventory);
const validate = (options) => validateManifest({ inventory, files, ...options });
const suite = suites.find((item) => item.id === 'app-unit');
const file = 'tests/unit/example.test.ts';
const report = (status) => ({
  success: true,
  testResults: [
    {
      name: resolve(ROOT, file),
      status: 'passed',
      assertionResults: [
        { ancestorTitles: ['example'], title: 'works', meta: { carveTestId: 'example_0' }, status },
      ],
    },
  ],
});

describe('canonical manifest integrity', () => {
  it('accounts for every source test, with exactly one required or documented deferred owner', () => {
    const result = validateManifest();
    assert.deepEqual(result.files, discoverTests());
    assert.equal(
      new Set([...result.selected.values()].flat()).size,
      [...result.selected.values()].flat().length
    );
  });
  it('handles Windows separators, nested and immediate globs, spaces and literal dots', () => {
    assert.ok(matches('tests\\unit\\folder name\\a.test.ts', 'tests/unit/**/*.test.ts'));
    assert.ok(matches('tests/unit/a.test.ts', 'tests/unit/**/*.test.ts'));
    assert.equal(matches('tests/unit/aXtestYts', 'tests/unit/**/*.test.ts'), false);
    const args = vitestArgs(
      suites.find((s) => s.id === 'reset-rehearsal'),
      'C:\\repo name\\out.json'
    );
    assert.ok(args.includes('--outputFile=C:/repo name/out.json'));
    assert.equal(
      args.some((arg) => arg.includes('"')),
      false
    );
  });
  it('rejects removed, disabled, empty and unresolved required suites', () => {
    assert.throws(
      () => validate({ manifest: suites.filter((item) => item.id !== 'app-unit') }),
      /Unknown|assignment|removed/
    );
    const disabled = copy(suites);
    disabled[0].required = false;
    assert.throws(() => validate({ manifest: disabled }), /disabled/);
    const empty = copy(suites);
    empty[0].files = ['missing/**/*.test.ts'];
    assert.throws(() => validate({ manifest: empty }), /Empty/);
    const unresolved = copy(suites);
    unresolved[0].files.push('missing.test.ts');
    assert.throws(() => validate({ manifest: unresolved }), /Unresolved/);
  });
  it('rejects unknown files, disappeared files and silent required-to-deferred changes', () => {
    assert.throws(() => validate({ files: [...files, 'tests/new-unowned.test.ts'] }), /Unknown/);
    assert.throws(
      () =>
        validate({
          files: files.filter((f) => f !== files.find((f) => inventory[f] === 'app-unit')),
        }),
      /missing/
    );
    const changed = { ...inventory };
    changed[files.find((f) => inventory[f] === 'app-unit')] = 'deferred:colocated';
    assert.throws(() => validate({ inventory: changed }), /assignment changed/);
  });
  it('rejects duplicate selections and missing execution groups', () => {
    const duplicates = copy(suites);
    duplicates.push({ ...duplicates[0], id: 'duplicate' });
    assert.throws(() => validate({ manifest: duplicates }), /Duplicate execution/);
    const unassigned = copy(suites);
    unassigned[0].executionGroup = 'unknown';
    assert.throws(() => validate({ manifest: unassigned }), /Unassigned/);
  });
  it('rejects emulator drift, Functions in reset and broadened skip policy', () => {
    const drift = copy(suites);
    drift.find((s) => s.id === 'reset-rehearsal').emulators.push('functions');
    assert.throws(() => validate({ manifest: drift }), /Emulator/);
    const skip = copy(suites);
    skip[0].skipPolicy = 'anything';
    assert.throws(() => validate({ manifest: skip }), /skip policy/);
  });
  it('partitions all reset files away from backend, and Rules away from integration', () => {
    const reset = selectFiles(
      suites.find((s) => s.id === 'reset-rehearsal'),
      files
    );
    const backend = selectFiles(
      suites.find((s) => s.id === 'canonical-backend'),
      files
    );
    assert.equal(reset.length, 4);
    const backendArgs = vitestArgs(
      suites.find((s) => s.id === 'canonical-backend'),
      '/tmp/results.json'
    );
    assert.ok(backendArgs.includes('.emulator.test.ts'));
    assert.ok(!backendArgs.includes('functions/src/'));
    assert.ok(reset.every((f) => !backend.includes(f)));
    assert.ok(
      !selectFiles(
        suites.find((s) => s.id === 'firebase-integration'),
        files
      ).includes('tests/firestore.rules.test.ts')
    );
    assert.ok(deferredSuites.every((s) => s.reason && s.proposedGroup));
  });
  it('CI executes every manifest group once and retains existing quality gate dependencies', () => {
    const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    function assertBindings(text) {
      text = text.replaceAll('\r\n', '\n');
      const headings = [...text.matchAll(/^  ([\w-]+):\r?$/gm)];
      const jobs = Object.fromEntries(
        headings.map((match, index) => [
          match[1],
          text.slice(match.index, headings[index + 1]?.index ?? text.length),
        ])
      );
      const calls = [
        ...text.matchAll(
          /^        run: node scripts\/runManifestTests\.mjs --group ([\w-]+)\r?$/gm
        ),
      ].map((match) => match[1]);
      assert.deepEqual(calls.sort(), executionGroups.map((group) => group.id).sort());
      for (const group of executionGroups)
        assert.ok(
          jobs[group.ciGate]?.includes(
            `        run: node scripts/runManifestTests.mjs --group ${group.id}\n`
          )
        );
      const needs = jobs.quality
        .match(/    needs:\s*\[([\s\S]*?)\]/)?.[1]
        .split(/[,\s]+/)
        .filter(Boolean);
      assert.deepEqual(
        needs?.sort(),
        [...new Set(executionGroups.map((group) => group.ciGate))].sort()
      );
      assert.equal(text.includes('continue-on-error:'), false);
    }
    assertBindings(workflow.replaceAll('\r\n', '\n'));
    assert.throws(() =>
      assertBindings(
        workflow.replace(
          'run: node scripts/runManifestTests.mjs --group app',
          '# run: node scripts/runManifestTests.mjs --group app'
        )
      )
    );
    assert.throws(() => assertBindings(workflow.replace('        firestore,', '')));
    const local = readFileSync(new URL('./runLocalTestSuite.mjs', import.meta.url), 'utf8');
    assert.ok(local.includes('for (const group of executionGroups)'));
  });
});
it('matches real Vitest discovery for app projects and backend filters', () => {
  for (const id of ['app-unit', 'canonical-backend']) {
    const current = suites.find((suite) => suite.id === id);
    const filters = id === 'app-unit' ? ['tests/unit/'] : ['.emulator.test.ts'];
    const args = [
      'node_modules/vitest/vitest.mjs',
      'list',
      '--config',
      current.config,
      ...filters,
      '--filesOnly',
      '--json',
    ];
    for (const exclude of current.exclude ?? [])
      args.push(
        '--exclude',
        exclude.startsWith('functions/') ? exclude.slice('functions/'.length) : exclude
      );
    const output = execFileSync(process.execPath, args, {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, CARVE_TEST_EXCLUDES: JSON.stringify(current.exclude ?? []) },
    });
    const actual = JSON.parse(output)
      .map((entry) => entry.file.replaceAll('\\', '/').slice(ROOT.replaceAll('\\', '/').length))
      .sort();
    assert.deepEqual(actual, selectFiles(current, files).sort());
  }
});

describe('execution result guards', () => {
  it('rejects the passing file wrapper emitted by Node for an empty test module', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'carve-empty-node-'));
    const emptyFile = resolve(directory, 'empty.test.mjs');
    try {
      writeFileSync(emptyFile, '// no test bodies');
      const subprocessEnv = { ...process.env };
      delete subprocessEnv.NODE_TEST_CONTEXT;
      const output = execFileSync(
        process.execPath,
        ['--test', '--test-reporter=./scripts/testManifestNodeReporter.mjs', emptyFile],
        { cwd: ROOT, encoding: 'utf8', windowsHide: true, env: subprocessEnv }
      );
      const result = JSON.parse(output);
      assert.equal(result.tests.length, 0);
      assert.throws(
        () => validateResults({ ...suite, runner: 'node' }, result, [emptyFile]),
        /Empty test run/
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('requires actual successful assertions in every selected file', () => {
    assert.equal(validateResults(suite, report('passed'), [file]).passed, 1);
    assert.throws(
      () => validateResults(suite, report('passed'), [file, 'tests/unit/absent.test.ts']),
      /not executed/
    );
    assert.throws(
      () => validateResults(suite, report('passed'), ['tests/unit/different.test.ts']),
      /Unexpected result/
    );
  });
  it('rejects every unexpected skip, failure, empty run and duplicate identity', () => {
    for (const state of ['skipped', 'pending', 'todo', 'failed'])
      assert.throws(() => validateResults(suite, report(state), [file]), /SKIP|Failed/);
    assert.throws(
      () => validateResults(suite, { success: true, testResults: [] }, [file]),
      /Empty/
    );
    const duplicate = report('passed');
    duplicate.testResults[0].assertionResults.push(duplicate.testResults[0].assertionResults[0]);
    assert.throws(() => validateResults(suite, duplicate, [file]), /Duplicate testcase/);
    duplicate.testResults[0].assertionResults[1] = {
      ...duplicate.testResults[0].assertionResults[0],
      meta: { carveTestId: 'example_1' },
    };
    assert.equal(validateResults(suite, duplicate, [file]).passed, 2);
  });
  it('accepts only the two named Hosting skips and preserves the existing retry policy', () => {
    const browser = suites.find((s) => s.id === 'playwright');
    const report = {
      config: { rootDir: resolve(ROOT, 'e2e') },
      errors: [],
      suites: [
        {
          specs: [
            ...browser.allowedSkips.map((s) => ({
              file: s.file.slice('e2e/'.length),
              title: s.title,
              tests: [{ status: 'skipped', results: [{ status: 'skipped' }] }],
            })),
            {
              file: 'other.spec.ts',
              title: 'works',
              tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
            },
          ],
        },
      ],
    };
    assert.equal(
      validateResults(browser, report, ['e2e/prelaunch-security.spec.ts', 'e2e/other.spec.ts'])
        .skipped,
      2
    );
    report.suites[0].specs[2].tests[0] = {
      status: 'flaky',
      results: [{ status: 'failed' }, { status: 'passed' }],
    };
    assert.equal(
      validateResults(browser, report, ['e2e/prelaunch-security.spec.ts', 'e2e/other.spec.ts'])
        .retryAttempts,
      1
    );
    report.suites[0].specs[0].title = 'unexpected';
    assert.throws(
      () =>
        validateResults(browser, report, ['e2e/prelaunch-security.spec.ts', 'e2e/other.spec.ts']),
      /SKIP/
    );
  });
  it('fails closed for missing runners and unknown execution groups', async () => {
    await assert.rejects(runProcess('carve-missing-runner-0123456789', []), /ENOENT/);
    await assert.rejects(runGroup('unknown'), /Unknown execution group/);
  });
});
