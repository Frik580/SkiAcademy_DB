import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  ROOT,
  suites,
  executionGroups,
  deferredSuites,
  releaseSuites,
  profiles,
  profileSuite,
  smokeFiles,
  executionPlan,
  releaseGroups,
} from './testManifest.mjs';
import {
  discoverTests,
  matches,
  selectFiles,
  selectProfileFiles,
  validateManifest,
  validateResults,
  validateReleaseMapping,
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
      const prText = text.split('  release-validation:')[0];
      const calls = [
        ...prText.matchAll(
          /^        run: node scripts\/runManifestTests\.mjs --group ([\w-]+)(?: --profile [^\n]+)?\r?$/gm
        ),
      ].map((match) => match[1]);
      assert.deepEqual(calls.sort(), executionGroups.map((group) => group.id).sort());
      for (const group of executionGroups)
        assert.ok(
          jobs[group.ciGate]?.includes(
            `        run: node scripts/runManifestTests.mjs --group ${group.id}`
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
    assert.ok(local.includes('for (const group of groups)'));
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

describe('Phase 2 profile safety', () => {
  it('derives quick logic selection from canonical ownership with complete coverage reserved for PR', () => {
    assert.deepEqual(profiles.quick, [
      'translations',
      'app-unit',
      'shared-domain',
      'functions-unit',
      'node-guards',
    ]);
    const app = suites.find((suite) => suite.id === 'app-unit');
    assert.deepEqual(profileSuite(app, 'quick').files, app.files);
    assert.equal(profileSuite(app, 'quick').coverage, false);
    assert.equal(profileSuite(app, 'pr').coverage, true);
    const candidates = [
      'tests/unit/logic.test.ts',
      'tests/unit/hook.test.ts',
      'tests/unit/panel.test.tsx',
    ];
    const quick = profileSuite(app, 'quick');
    assert.deepEqual(
      selectProfileFiles(quick, candidates, (file) =>
        file.includes('hook')
          ? "import { renderHook } from '@testing-library/react'"
          : "it('calculates policy', () => {});"
      ),
      [candidates[0]]
    );
    assert.deepEqual(selectProfileFiles(profileSuite(app, 'pr'), candidates), candidates);
    assert.deepEqual(
      selectProfileFiles(quick, [candidates[0]], (file) =>
        file.startsWith('tests/')
          ? "import { resolveUiLanguage } from '../../src/lib/i18n/translations';"
          : 'navigator.language'
      ),
      []
    );
    const selected = selectProfileFiles(quick, files);
    assert.ok(selected.length > 0);
    assert.ok(selected.length < selectFiles(app, files).length);
    assert.ok(selected.every((file) => inventory[file] === 'app-unit'));
  });
  it('composes all full/release stages once and keeps QUICK free of emulators', () => {
    assert.deepEqual(executionPlan('pr'), executionGroups);
    assert.deepEqual(executionPlan('release'), releaseGroups);
    assert.deepEqual(executionPlan('full'), [...executionGroups, ...releaseGroups]);
    assert.equal(
      new Set(executionPlan('full').map((group) => group.id)).size,
      executionPlan('full').length
    );
    assert.ok(executionPlan('quick').every((group) => !group.emulators?.length));
    assert.throws(() => executionPlan('invalid'), /Unknown/);
    const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    assert.ok(workflow.includes('run: node scripts/runLocalTestSuite.mjs release'));
  });
  it('partitions Hosting bodies from smoke/full without weakening skip validation', () => {
    const browser = suites.find((suite) => suite.id === 'playwright');
    for (const profile of ['pr', 'smoke', 'full', 'e2e', 'hosting']) {
      const selection = profileSuite(browser, profile);
      assert.deepEqual(selection.allowedSkips, []);
      assert.ok(selection.playwrightArgs.includes('@hosting'));
      assert.equal(selection.playwrightArgs[0], profile === 'hosting' ? '--grep' : '--grep-invert');
    }
    assert.deepEqual(profileSuite(browser, 'smoke').files, smokeFiles);
    assert.equal(profileSuite(browser, 'smoke').preview, true);
    assert.equal(profileSuite(browser, 'smoke').liveFixtures, false);
    assert.equal(profileSuite(browser, 'full').preview, true);
    assert.equal(profileSuite(browser, 'full').liveFixtures, true);
    assert.equal(profileSuite(browser, 'e2e').preview, true);
    assert.equal(profileSuite(browser, 'e2e').liveFixtures, true);
    for (const name of [
      'prelaunch-security',
      'booking-flow',
      'booking-invariants',
      'course-enrollment-smoke',
    ])
      assert.ok(smokeFiles.includes(`e2e/${name}.spec.ts`));
    assert.throws(() => profileSuite(browser, 'invalid'), /Unknown/);
  });
  it('promotes every deferred runtime file exactly once with Windows-safe report IDs', () => {
    const promoted = releaseSuites.flatMap((suite) => selectFiles(suite, files));
    const expected = Object.entries(inventory)
      .filter(
        ([, owner]) => owner.startsWith('deferred:') && owner !== 'deferred:compile-contracts'
      )
      .map(([file]) => file);
    assert.deepEqual(promoted.sort(), expected.sort());
    assert.equal(promoted.length, new Set(promoted).size);
    for (const suite of releaseSuites) assert.doesNotMatch(suite.id, /[<>:"/\\|?*]/);
  });
  it('rejects profiles that could turn mandatory backend or release gates into empty success', async () => {
    for (const [group, profile] of [
      ['backend', 'quick'],
      ['reset', 'quick'],
      ['e2e', 'quick'],
      ['migration', 'pr'],
      ['hosting', 'pr'],
      ['app', 'smoke'],
    ])
      await assert.rejects(runGroup(group, { profile }), /Invalid group/);
  });
  it('discovers exactly the QUICK frontend selection with an explicit include', () => {
    const suite = profileSuite(
      suites.find((suite) => suite.id === 'app-unit'),
      'quick'
    );
    const expected = selectProfileFiles(suite, files);
    const output = execFileSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'list', '--config', suite.config, '--filesOnly', '--json'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
        env: {
          ...process.env,
          CARVE_TEST_INCLUDES: JSON.stringify(expected),
          CARVE_TEST_ENVIRONMENT: 'node',
        },
      }
    );
    const actual = JSON.parse(output)
      .map((entry) => entry.file.replaceAll('\\', '/').slice(ROOT.replaceAll('\\', '/').length))
      .sort();
    assert.deepEqual(actual, expected.sort());
  });
  it('rejects orphaned release mappings and missing compile/Hosting gates', () => {
    const releases = structuredClone(releaseSuites);
    releases[0].executionGroup = 'missing-release-group';
    assert.throws(() => validateReleaseMapping(releases), /mapping/);
    assert.throws(() => validateReleaseMapping(releaseSuites, []), /mapping/);
  });
  it('discovers exactly the promoted colocated inventory using exact source paths', () => {
    const suite = releaseSuites.find((suite) => suite.id === 'release-colocated');
    const expected = selectFiles(suite, files);
    const output = execFileSync(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs',
        'list',
        '--config',
        suite.config,
        ...expected.map((file) => resolve(ROOT, file)),
        '--filesOnly',
        '--json',
      ],
      { cwd: ROOT, encoding: 'utf8', windowsHide: true }
    );
    const actual = JSON.parse(output)
      .map((entry) => entry.file.replaceAll('\\', '/').slice(ROOT.replaceAll('\\', '/').length))
      .sort();
    assert.deepEqual(actual, expected.sort());
  });
});

it('Playwright discovery preserves full bodies and partitions Hosting with every security transport in smoke', () => {
  const browser = suites.find((suite) => suite.id === 'playwright');
  const discover = (args) => {
    const output = execFileSync(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json', ...args],
      { cwd: ROOT, encoding: 'utf8', windowsHide: true }
    );
    const report = JSON.parse(output);
    assert.equal(report.errors.length, 0);
    const results = [];
    const visit = (section) => {
      for (const spec of section.specs ?? []) results.push(`${spec.file}::${spec.title}`);
      for (const child of section.suites ?? []) visit(child);
    };
    for (const section of report.suites) visit(section);
    return results;
  };
  const all = discover([]);
  const full = discover(profileSuite(browser, 'full').playwrightArgs);
  const hosting = discover([
    ...profileSuite(browser, 'hosting').playwrightArgs,
    'e2e/prelaunch-security.spec.ts',
  ]);
  const smoke = discover(profileSuite(browser, 'smoke').playwrightArgs);
  assert.deepEqual([...full, ...hosting].sort(), all.sort());
  assert.equal(new Set([...full, ...hosting]).size, all.length);
  assert.equal(hosting.length, 2);
  assert.ok(smoke.length < full.length);
  for (const id of smoke) assert.ok(full.includes(id));
  assert.equal(smoke.filter((id) => id.startsWith('prelaunch-security.spec.ts::')).length, 3);
});
