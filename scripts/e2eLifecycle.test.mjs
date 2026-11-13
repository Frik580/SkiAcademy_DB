import { it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { diagnose } from './e2eDiagnostics.mjs';
import { trackE2ETree } from './e2eProcessTree.mjs';

it('POSIX tracking cleans detached/reparented descendants and excludes reused or unrelated PIDs', () => {
  let table = [
    { pid: 100, parent: 1, started: 'root' },
    { pid: 101, parent: 100, started: 'java-detached' },
    { pid: 102, parent: 101, started: 'browser-detached' },
    { pid: 103, parent: 100, started: 'old-worker' },
    { pid: 999, parent: 1, started: 'unrelated' },
  ];
  const killed = [];
  const tree = trackE2ETree(100, {
    readTable: () => table,
    killProcess: (pid) => killed.push(pid),
  });
  try {
    tree.capture();
    table = [
      { pid: 101, parent: 1, started: 'java-detached' },
      { pid: 102, parent: 1, started: 'browser-detached' },
      { pid: 103, parent: 1, started: 'different-process-reused-pid' },
      { pid: 104, parent: 101, started: 'new-owned-worker' },
      { pid: 999, parent: 1, started: 'unrelated' },
    ];
    tree.kill();
    assert.deepEqual(killed.sort(), [101, 102, 104]);
  } finally {
    tree.stop();
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  it(`${signal} preserves cancellation status and terminates an uncooperative child tree`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2e-signals-'));
    const marker = join(directory, 'ready.json');
    const descendant = `process.on('SIGINT',()=>{}); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`;
    const child = `
      const { spawn } = require('node:child_process');
      process.on('SIGINT',()=>{}); process.on('SIGTERM',()=>{});
      const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { stdio: 'ignore', detached: process.platform !== 'win32' });
      require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify([process.pid, grandchild.pid]));
      setInterval(()=>{},1000);
    `;
    const fixture = `
      import { runE2EProcess } from ${JSON.stringify(new URL('./e2eProcess.mjs', import.meta.url).href)};
      import { existsSync } from 'node:fs';
      const timer = setInterval(() => {
        if (existsSync(${JSON.stringify(marker)})) { clearInterval(timer); process.emit(${JSON.stringify(signal)}); }
      }, 20);
      const code = await runE2EProcess(process.execPath, ['-e', ${JSON.stringify(child)}], {
        group: true, stage: 'fixture', shutdownGraceMs: 100, stdio: 'ignore',
      });
      console.log(JSON.stringify({ code }));
    `;
    try {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        ['--input-type=module', '-e', fixture],
        {
          timeout: 10_000,
          windowsHide: true,
          env: { ...process.env, CARVE_E2E_DIAGNOSTICS_DIR: directory },
        }
      );
      assert.equal(JSON.parse(stdout).code, signal === 'SIGINT' ? 130 : 143);
      const pids = JSON.parse(readFileSync(marker, 'utf8'));
      for (const pid of pids) {
        const isAlive = () => {
          try {
            process.kill(pid, 0);
            // A reaped-by-init zombie cannot execute or keep handles open.
            return (
              !existsSync(`/proc/${pid}/status`) ||
              !/^State:\s+Z/m.test(readFileSync(`/proc/${pid}/status`, 'utf8'))
            );
          } catch (error) {
            if (error.code !== 'ESRCH' && error.code !== 'ENOENT') throw error;
            return false;
          }
        };
        const deadline = Date.now() + 1_000;
        let alive = isAlive();
        while (alive && Date.now() < deadline) {
          await delay(20);
          alive = isAlive();
        }
        assert.equal(alive, false, `descendant ${pid} is still running`);
      }
      const events = readdirSync(directory)
        .filter((name) => name.endsWith('.jsonl'))
        .flatMap((name) =>
          readFileSync(join(directory, name), 'utf8').trim().split('\n').map(JSON.parse)
        );
      assert.ok(
        events.some((event) => event.stage === 'fixture:interrupt' && event.signal === signal)
      );
      assert.ok(events.some((event) => event.stage === 'fixture:exit'));
      if (process.platform !== 'win32')
        assert.ok(events.some((event) => event.stage === 'fixture:force-stop'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

it('diagnostic files are bounded and do not require normal shutdown to persist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'e2e-diagnostics-'));
  const previous = process.env.CARVE_E2E_DIAGNOSTICS_DIR;
  process.env.CARVE_E2E_DIAGNOSTICS_DIR = directory;
  try {
    for (let i = 0; i < 700; i++) diagnose('fixture:progress', { value: 'x'.repeat(1024) });
    const content = readFileSync(join(directory, readdirSync(directory)[0]), 'utf8');
    assert.ok(content.length >= 512 * 1024 && content.length < 514 * 1024);
    assert.ok(
      content
        .trim()
        .split('\n')
        .every((line) => JSON.parse(line).stage === 'fixture:progress')
    );
  } finally {
    if (previous === undefined) delete process.env.CARVE_E2E_DIAGNOSTICS_DIR;
    else process.env.CARVE_E2E_DIAGNOSTICS_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
