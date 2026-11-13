// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { waitForFunctionsEmulatorReady } from '../../e2e/functions-readiness';

let directory: string | undefined;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe('Functions readiness diagnostics', () => {
  it('attributes repeated invocations, releases probe bodies and requires three stable rounds each time', async () => {
    vi.useFakeTimers();
    directory = mkdtempSync(join(tmpdir(), 'e2e-readiness-'));
    vi.stubEnv('CARVE_E2E_DIAGNOSTICS_DIR', directory);
    const cancel = vi.fn(async () => {});
    const fetch = vi.fn(async (_url: string, init: RequestInit) => ({
      status: init.method === 'GET' ? 200 : 400,
      body: { cancel },
    }));
    vi.stubGlobal('fetch', fetch);
    const first = waitForFunctionsEmulatorReady();
    await vi.advanceTimersByTimeAsync(1_000);
    await first;
    const second = waitForFunctionsEmulatorReady();
    await vi.advanceTimersByTimeAsync(1_000);
    await second;
    expect(fetch).toHaveBeenCalledTimes(18);
    expect(cancel).toHaveBeenCalledTimes(18);
    const events = readFileSync(join(directory, readdirSync(directory)[0]), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const starts = events.filter((e) => e.stage === 'functions-readiness:start');
    expect(starts).toHaveLength(2);
    expect(starts[0].call).not.toBe(starts[1].call);
    expect(starts[0].caller.join(' ')).toContain('e2eFunctionsReadiness.test.ts');
    expect(events.filter((e) => e.stage === 'functions-readiness:ready')).toHaveLength(2);
  });

  it('resets stability after an unhealthy round', async () => {
    vi.useFakeTimers();
    let requests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const round = Math.floor(requests++ / 3);
        return new Response(null, {
          status: round === 1 ? 503 : init.method === 'GET' ? 200 : 400,
        });
      })
    );
    const ready = waitForFunctionsEmulatorReady();
    await vi.advanceTimersByTimeAsync(1_750);
    await ready;
    expect(requests).toBe(15);
  });

  it('bounds repeated unhealthy probes and records the failing endpoint without response payloads', async () => {
    vi.useFakeTimers();
    directory = mkdtempSync(join(tmpdir(), 'e2e-readiness-'));
    vi.stubEnv('CARVE_E2E_DIAGNOSTICS_DIR', directory);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string, init: RequestInit) =>
          new Response(null, {
            status: url.endsWith('/executeCanonicalCommand')
              ? 503
              : init.method === 'GET'
                ? 200
                : 400,
          })
      )
    );
    const outcome = waitForFunctionsEmulatorReady().catch((error) => error);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await outcome).toBeInstanceOf(Error);
    const lines = readFileSync(join(directory, readdirSync(directory)[0]), 'utf8')
      .trim()
      .split('\n');
    expect(lines.length).toBeLessThanOrEqual(14);
    const timeout = JSON.parse(lines.at(-1)!);
    expect(timeout.stage).toBe('functions-readiness:timeout');
    expect(timeout.elapsedMs).toBe(60_000);
    expect(timeout.checks).toEqual({
      httpReady: true,
      guestCallableReady: true,
      authCallableReady: false,
    });
  });

  it('aborts stalled network requests rather than waiting indefinitely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_done, reject) => {
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), {
              once: true,
            });
          })
      )
    );
    const started = Date.now();
    await expect(waitForFunctionsEmulatorReady(undefined, 100)).rejects.toThrow(
      'did not become ready'
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(Date.now() - started).toBeGreaterThanOrEqual(3_000);
    expect(Date.now() - started).toBeLessThan(4_500);
  });
});
