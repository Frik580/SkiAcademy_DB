import { spawnSync } from 'node:child_process';
import { diagnose } from './e2eDiagnostics.mjs';

function processTable() {
  const result = spawnSync('ps', ['-eo', 'pid=,ppid=,lstart='], {
    encoding: 'utf8',
    timeout: 250,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0) return [];
  return result.stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), started: match[3] }] : [];
  });
}

// Firebase Java emulators and Playwright browsers can create separate groups.
// Remember owned descendants before parents exit/reparent them, and check their
// start time before killing a PID. Never use process names to select targets.
export function trackE2ETree(
  rootPid,
  { readTable = processTable, killProcess = process.kill } = {}
) {
  const owned = new Map();
  const capture = () => {
    const table = readTable();
    const parents = new Set([rootPid]);
    for (const row of table) {
      if (owned.get(row.pid)?.started === row.started) parents.add(row.pid);
    }
    let changed = true;
    while (changed && parents.size < 4096) {
      changed = false;
      for (const row of table) {
        if (parents.has(row.parent) && !parents.has(row.pid)) {
          parents.add(row.pid);
          owned.set(row.pid, row);
          changed = true;
        }
      }
    }
    if (!table.length) diagnose('process-tree:snapshot-unavailable');
  };
  const kill = () => {
    capture();
    const current = new Map(readTable().map((row) => [row.pid, row]));
    let killed = 0;
    for (const row of [...owned.values()].reverse()) {
      if (current.get(row.pid)?.started !== row.started) continue;
      try {
        killProcess(row.pid, 'SIGKILL');
        killed += 1;
      } catch (error) {
        if (error.code !== 'ESRCH')
          diagnose('process-tree:kill-error', { pid: row.pid, code: error.code });
      }
    }
    diagnose('process-tree:cleanup', { rootPid, tracked: owned.size, killed });
  };
  const timer = setInterval(capture, 1_000);
  timer.unref();
  return { capture, kill, stop: () => clearInterval(timer) };
}
