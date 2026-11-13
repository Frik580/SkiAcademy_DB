import { appendFileSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// One bounded file per process avoids concurrent read/modify/write races.
export function diagnose(stage, details = {}) {
  const directory = process.env.CARVE_E2E_DIAGNOSTICS_DIR;
  if (!directory) return;
  try {
    mkdirSync(directory, { recursive: true });
    const path = join(directory, `events-${process.pid}.jsonl`);
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      /* First event. */
    }
    if (size >= 512 * 1024) return;
    appendFileSync(
      path,
      `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, stage, ...details })}\n`
    );
  } catch {
    // Diagnostics must never replace the test result.
  }
}

export function heartbeat(stage) {
  const sample = () => {
    const memory = {};
    // Evidence for future OOM investigations; SIGKILL alone proves nothing.
    for (const name of ['memory.current', 'memory.peak', 'memory.events']) {
      try {
        memory[name] = readFileSync(`/sys/fs/cgroup/${name}`, 'utf8').trim();
      } catch {
        /* Non-Linux/v1. */
      }
    }
    diagnose(stage, { rss: process.memoryUsage().rss, memory });
  };
  sample();
  const timer = setInterval(sample, 15_000);
  timer.unref();
  return () => clearInterval(timer);
}
