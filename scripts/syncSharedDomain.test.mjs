import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  utimesSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { resolveFunctionsBuildProvenance, DIRTY_RELEASE_MESSAGE } from './deploymentProvenance.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generator = readFileSync(join(repo, 'functions/scripts/syncSharedDomain.cjs'), 'utf8');
const require = createRequire(import.meta.url);

test('working-tree generator preserves the matching vendored manifest bytes', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'sync-shared-domain-current-'));
  try {
    const dist = join(temporary, 'packages/shared-domain/dist');
    const packageDirectory = join(temporary, 'functions/shared-domain');
    mkdirSync(dist, { recursive: true });
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(dist, 'index.js'), 'module.exports = {};\n');
    const manifest = join(packageDirectory, 'package.json');
    const expected = readFileSync(join(repo, 'functions/shared-domain/package.json'), 'utf8');
    const sync = () =>
      runInNewContext(generator, {
        require,
        __dirname: join(temporary, 'functions/scripts'),
      });
    // Generate from scratch first, so a stale vendored contract cannot pass.
    sync();
    assert.equal(readFileSync(manifest, 'utf8'), expected.replace(/\r\n/g, '\n'));
    for (const eol of ['\n', '\r\n']) {
      writeFileSync(manifest, expected.replace(/\r\n/g, '\n').replace(/\n/g, eol));
      utimesSync(manifest, new Date(1000000000000), new Date(1000000000000));
      const bytes = readFileSync(manifest);
      const mtime = statSync(manifest).mtimeMs;
      sync();
      sync();
      assert.deepEqual(readFileSync(manifest), bytes);
      assert.equal(statSync(manifest).mtimeMs, mtime);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// A sparse local clone provides a real committed baseline without creating commits.
for (const autocrlf of ['false', 'true']) {
  test(`sync preserves clean Git provenance and unchanged bytes (core.autocrlf=${autocrlf})`, () => {
    const temporary = mkdtempSync(join(tmpdir(), 'sync-shared-domain-'));
    const fixture = join(temporary, 'repo');
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: fixture,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    try {
      execFileSync('git', ['clone', '--shared', '--no-checkout', repo, fixture], {
        windowsHide: true,
        stdio: 'pipe',
      });
      git('config', 'core.autocrlf', autocrlf);
      git(
        'sparse-checkout',
        'set',
        '--no-cone',
        '/functions/shared-domain/package.json',
        '/.gitignore'
      );
      git('checkout', '--detach', 'HEAD');
      // Keep the clean provenance fixture at one revision when the working tree
      // intentionally changes both the generator and its vendored manifest.
      const fixtureGenerator = git('show', 'HEAD:functions/scripts/syncSharedDomain.cjs');
      const dist = join(fixture, 'packages/shared-domain/dist');
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, 'index.js'), 'module.exports = {};\n');
      const manifest = join(fixture, 'functions/shared-domain/package.json');
      const baseline = readFileSync(manifest, 'utf8');
      const sync = (source = fixtureGenerator) =>
        runInNewContext(source, {
          require,
          __dirname: join(fixture, 'functions/scripts'),
        });
      const provenance = () =>
        resolveFunctionsBuildProvenance({
          cwd: fixture,
          env: { CARVE_RELEASE: '1' },
          buildTimestamp: '2026-10-20T00:00:00.000Z',
        });
      assert.equal(git('status', '--porcelain'), '');
      assert.equal(provenance().dirty, false);
      // Check both byte representations even on an LF host; compare against Git on
      // the native checkout representation, so Git's own EOL rules remain authoritative.
      for (const eol of ['\n', '\r\n']) {
        writeFileSync(manifest, baseline.replace(/\r\n/g, '\n').replace(/\n/g, eol));
        utimesSync(manifest, new Date(1000000000000), new Date(1000000000000));
        const bytes = readFileSync(manifest),
          mtime = statSync(manifest).mtimeMs;
        sync();
        sync();
        assert.deepEqual(readFileSync(manifest), bytes);
        assert.equal(statSync(manifest).mtimeMs, mtime);
      }
      writeFileSync(manifest, baseline);
      sync();
      assert.equal(git('status', '--porcelain'), '');
      assert.equal(provenance().dirty, false);
      assert.equal(
        readFileSync(join(fixture, 'functions/shared-domain/dist/index.js'), 'utf8'),
        'module.exports = {};\n'
      );

      // A genuine change in the generated contract still changes Git and blocks release.
      sync(fixtureGenerator.replace("version: '0.1.0'", "version: '0.1.1'"));
      assert.match(git('status', '--porcelain'), /M functions\/shared-domain\/package.json/);
      assert.equal(JSON.parse(readFileSync(manifest, 'utf8')).version, '0.1.1');
      assert.throws(provenance, { message: DIRTY_RELEASE_MESSAGE });

      writeFileSync(manifest, baseline);
      writeFileSync(join(fixture, 'unrelated-wip.txt'), 'real WIP');
      sync();
      assert.throws(provenance, { message: DIRTY_RELEASE_MESSAGE });

      // Missing output must be generated rather than silently skipped.
      rmSync(manifest);
      sync();
      assert.equal(readFileSync(manifest, 'utf8'), baseline.replace(/\r\n/g, '\n'));
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
}
