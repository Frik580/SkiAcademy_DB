import { spawn, spawnSync } from 'node:child_process';
import { diagnose } from './e2eDiagnostics.mjs';
import { trackE2ETree } from './e2eProcessTree.mjs';

// The outer Firebase CLI owns cleanup, including descendants that detach.
export async function runE2EProcess(
  command,
  args,
  { group = false, timeoutMs, stage, shutdownGraceMs = 5_000, ...options } = {}
) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    ...options,
    detached: group && process.platform !== 'win32',
  });
  diagnose(`${stage}:spawn`, { childPid: child.pid });
  const tree =
    group && child.pid && process.platform !== 'win32' ? trackE2ETree(child.pid) : undefined;
  let interrupted;
  let escalation;
  const send = (signal) => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') {
        // Windows has no POSIX signal forwarding; terminate the owned tree.
        const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
          timeout: 1_500,
        });
        if (result.status !== 0) {
          diagnose(`${stage}:tree-stop-failed`, {
            status: result.status,
            code: result.error?.code,
          });
          child.kill('SIGKILL');
        }
      } else if (group && signal === 'SIGKILL') {
        tree?.kill();
        process.kill(-child.pid, signal);
      } else child.kill(signal);
    } catch (error) {
      if (error.code !== 'ESRCH') diagnose(`${stage}:signal-error`, { code: error.code });
    }
  };
  const interrupt = (signal) => {
    if (interrupted) return;
    interrupted = signal;
    diagnose(`${stage}:interrupt`, { signal, childPid: child.pid });
    tree?.capture();
    send(signal);
    escalation = setTimeout(() => {
      diagnose(`${stage}:force-stop`, { signal: 'SIGKILL', childPid: child.pid });
      send('SIGKILL');
    }, shutdownGraceMs);
    escalation.unref();
  };
  const onInt = () => interrupt('SIGINT');
  const onTerm = () => interrupt('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  const deadline = timeoutMs ? setTimeout(() => interrupt('SIGTERM'), timeoutMs) : undefined;
  try {
    return await new Promise((done, fail) => {
      child.once('error', fail);
      child.once('exit', (code, signal) => {
        diagnose(`${stage}:exit`, { code, signal, interrupted });
        // Clean remaining members even if the CLI exited before its descendants.
        if (group && process.platform !== 'win32') send('SIGKILL');
        done(interrupted === 'SIGTERM' ? 143 : interrupted ? 130 : (code ?? 1));
      });
    });
  } finally {
    clearTimeout(deadline);
    clearTimeout(escalation);
    tree?.stop();
    process.off('SIGINT', onInt);
    process.off('SIGTERM', onTerm);
  }
}
