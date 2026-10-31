import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT,
  suites,
  executionGroups,
  deferredSuites,
  criticalAssertions,
} from './testManifest.mjs';

export const normalize = (value) => value.replaceAll('\\', '/');
export function matches(file, pattern) {
  const expression = normalize(pattern)
    .split('**/')
    .map((part) =>
      part
        .split('*')
        .map((text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*')
    )
    .join('(?:.*/)?');
  return new RegExp(`^${expression}$`).test(normalize(file));
}
export function discoverTests(root = ROOT) {
  const files = [];
  function walk(directory) {
    if (!existsSync(resolve(root, directory))) return;
    for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
      if (
        ['node_modules', 'dist', '.scratch', '.git', '.worktrees', 'graphify-out'].includes(
          entry.name
        )
      )
        continue;
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || file.includes('/type-tests/'))
        files.push(file);
    }
  }
  for (const directory of [
    'src',
    'tests',
    'functions/src',
    'functions/scripts',
    'packages',
    'scripts',
    'e2e',
  ])
    walk(directory);
  return files.sort();
}
export function selectFiles(suite, files) {
  return files.filter(
    (file) =>
      suite.files.some((pattern) => matches(file, pattern)) &&
      !(suite.exclude ?? []).some((pattern) => matches(file, pattern))
  );
}
export function validateManifest({
  root = ROOT,
  manifest = suites,
  groups = executionGroups,
  deferred = deferredSuites,
  inventory,
  files = discoverTests(root),
} = {}) {
  inventory ??= JSON.parse(
    readFileSync(resolve(root, 'scripts/testManifest.inventory.json'), 'utf8')
  );
  const ids = new Set();
  const selected = new Map();
  const assignments = new Map();
  for (const group of groups) {
    if (ids.has(`group:${group.id}`) || !group.ciGate)
      throw new Error(`Invalid execution group: ${group.id}`);
    ids.add(`group:${group.id}`);
  }
  for (const suite of manifest) {
    if (ids.has(suite.id) || suite.required !== true)
      throw new Error(`Duplicate or disabled required suite: ${suite.id}`);
    ids.add(suite.id);
    const group = groups.find((item) => item.id === suite.executionGroup);
    if (!group) throw new Error(`Unassigned suite: ${suite.id}`);
    if (!['node', 'vitest', 'playwright'].includes(suite.runner))
      throw new Error(`Unknown runner: ${suite.runner}`);
    if (
      JSON.stringify(suite.emulators) !== JSON.stringify(group.emulators ?? []) ||
      suite.functionsRequired !== Boolean(group.emulators?.includes('functions'))
    )
      throw new Error(`Emulator dependencies disagree: ${suite.id}`);
    if (suite.executionGroup !== 'e2e' && suite.emulators.includes('functions'))
      throw new Error(`Background Functions forbidden: ${suite.id}`);
    if (
      suite.skipPolicy !== 'none' &&
      !(
        suite.id === 'playwright' &&
        suite.skipPolicy === 'hosting-only' &&
        suite.allowedSkips?.length === 2
      )
    )
      throw new Error(`Invalid skip policy: ${suite.id}`);
    const selection = selectFiles(suite, files);
    if (!selection.length) throw new Error(`Empty required selection: ${suite.id}`);
    for (const pattern of suite.files)
      if (!files.some((file) => matches(file, pattern)))
        throw new Error(`Unresolved test path: ${pattern}`);
    for (const file of selection) {
      if (assignments.has(file)) throw new Error(`Duplicate execution: ${file}`);
      assignments.set(file, suite.id);
    }
    selected.set(suite.id, selection);
  }
  for (const gap of deferred) {
    if (!gap.reason || !gap.proposedGroup) throw new Error(`Unexplained deferred suite: ${gap.id}`);
    for (const file of selectFiles(gap, files)) {
      if (assignments.has(file)) throw new Error(`Duplicate inventory classification: ${file}`);
      assignments.set(file, `deferred:${gap.id}`);
    }
  }
  for (const file of files) {
    if (!assignments.has(file)) throw new Error(`Unknown test file: ${file}`);
    if (inventory[file] !== assignments.get(file))
      throw new Error(
        `Inventory assignment changed: ${file} (${inventory[file]} -> ${assignments.get(file)})`
      );
  }
  for (const file of Object.keys(inventory))
    if (!files.includes(file)) throw new Error(`Inventory test missing: ${file}`);
  for (const id of new Set(Object.values(inventory).filter((id) => !id.startsWith('deferred:'))))
    if (!selected.has(id)) throw new Error(`Required suite removed: ${id}`);
  return { files, selected, assignments };
}
export function assertRequiredSuites(report, kind) {
  kind = kind === 'functions' ? 'backend' : kind;
  if (report?.success !== true || !Array.isArray(report.testResults))
    throw new Error(`${kind}: Vitest did not return a successful JSON report`);
  for (const [file, minimum, title] of criticalAssertions[kind] ?? []) {
    const matches = report.testResults.filter((result) =>
      normalize(result.name ?? '').endsWith(`/${file}`)
    );
    if (matches.length !== 1) throw new Error(`${kind}: expected exactly one ${file} suite`);
    const result = matches[0];
    if (
      result.status !== 'passed' ||
      !Array.isArray(result.assertionResults) ||
      result.assertionResults.length < minimum ||
      result.assertionResults.some((test) => test.status !== 'passed')
    )
      throw new Error(`${kind}: missing, skipped or failed assertions in ${file}`);
    if (title && !result.assertionResults.some((test) => test.title === title))
      throw new Error(
        `${kind}: ${kind === 'reset' ? 'authorization/resume' : 'migration CLI'} regression was not executed`
      );
  }
}
export function validateResults(suite, report, expectedFiles, root = ROOT) {
  const identities = new Set();
  const seen = new Set();
  const counts = { collected: 0, executed: 0, passed: 0, skipped: 0, duplicate: 0 };
  function record(file, title, status, runnerIdentity = title) {
    file = normalize(file);
    if (isAbsolute(file) || /^[A-Za-z]:\//.test(file)) file = normalize(relative(root, file));
    if (!expectedFiles.includes(file)) throw new Error(`Unexpected result file: ${file}`);
    seen.add(file);
    const identity = `${file}::${runnerIdentity}`;
    if (identities.has(identity)) throw new Error(`Duplicate testcase identity: ${identity}`);
    identities.add(identity);
    counts.collected++;
    if (
      status === 'skipped' ||
      status === 'pending' ||
      status === 'todo' ||
      status === 'disabled'
    ) {
      if (!suite.allowedSkips?.some((skip) => skip.file === file && skip.title === title))
        throw new Error(`Unexpected SKIP: ${identity}`);
      counts.skipped++;
    } else if (status === 'passed' || status === 'expected') {
      counts.executed++;
      counts.passed++;
    } else throw new Error(`Failed testcase: ${identity} (${status})`);
  }
  if (suite.runner === 'vitest') {
    if (report.success !== true || !Array.isArray(report.testResults))
      throw new Error('Missing successful Vitest report');
    for (const result of report.testResults) {
      if (result.status !== 'passed' || !result.assertionResults?.length)
        throw new Error(`Empty or failed test file: ${result.name}`);
      for (const test of result.assertionResults) {
        if (!test.meta?.carveTestId)
          throw new Error(`Missing Vitest testcase identity: ${result.name}`);
        record(
          result.name,
          [...(test.ancestorTitles ?? []), test.title].join(' > '),
          test.status,
          test.meta.carveTestId
        );
      }
    }
    assertRequiredSuites(report, suite.executionGroup);
  } else if (suite.runner === 'node') {
    if (report.failed !== 0) throw new Error('Node tests failed');
    for (const test of report.tests ?? []) record(test.file, test.title, test.status);
  } else if (suite.runner === 'playwright') {
    if (!Array.isArray(report.suites) || report.errors?.length)
      throw new Error('Missing or failed Playwright report');
    function visit(section, parents = []) {
      for (const spec of section.specs ?? []) {
        if (spec.tests?.length !== 1)
          throw new Error(`Unexpected Playwright projects: ${spec.title}`);
        const test = spec.tests[0];
        if (!test.results?.length) throw new Error(`Unexecuted Playwright test: ${spec.title}`);
        const finalStatus = test.results.at(-1).status;
        if (test.status !== 'skipped' && finalStatus !== 'passed')
          throw new Error(`Failed Playwright attempt: ${spec.title}`);
        counts.retryAttempts = (counts.retryAttempts ?? 0) + Math.max(0, test.results.length - 1);
        record(
          report.config?.rootDir ? resolve(report.config.rootDir, spec.file) : spec.file,
          [...parents, spec.title].join(' > '),
          test.status === 'skipped' ? 'skipped' : test.status === 'flaky' ? 'expected' : test.status
        );
      }
      for (const child of section.suites ?? [])
        visit(
          child,
          child.file && child.title === child.file ? parents : [...parents, child.title]
        );
    }
    for (const section of report.suites) visit(section);
  }
  if (!counts.collected || !counts.executed) throw new Error(`Empty test run: ${suite.id}`);
  for (const file of expectedFiles)
    if (!seen.has(file)) throw new Error(`Required test file not executed: ${file}`);
  return counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateManifest();
    console.log(
      `Manifest valid: ${result.files.length} inventory files, ${[...result.selected.values()].flat().length} required files, ${suites.length} suites, no duplicate selections.`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
