// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { waitForFunctionsEmulatorReady } from '../../e2e/functions-readiness';
import { functionsCallableUrl } from '../../e2e/emulator-config';

const readinessEndpoints = [
  'optimizeImage',
  'executeGuestCanonicalCommand',
  'executeCanonicalCommand',
  'queryKaspiPayments',
];

function healthyProbeResponse(init: RequestInit): Response {
  return new Response(
    init.method === 'GET'
      ? 'Missing u parameter'
      : JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Bad Request' } }),
    { status: 400 }
  );
}

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
    const responses: Response[] = [];
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const response = healthyProbeResponse(init);
      responses.push(response);
      return response;
    });
    vi.stubGlobal('fetch', fetch);
    const first = waitForFunctionsEmulatorReady();
    // Async advancement drains probe microtasks before scheduling each retry.
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(1);
    await first;
    const second = waitForFunctionsEmulatorReady();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(20);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(fetch).toHaveBeenCalledTimes(24);
    expect(responses.every((response) => response.bodyUsed)).toBe(true);
    for (let round = 0; round < 6; round += 1) {
      expect(fetch.mock.calls.slice(round * 4, (round + 1) * 4)).toEqual(
        readinessEndpoints.map((endpoint, index) => [
          functionsCallableUrl(endpoint),
          {
            method: index === 0 ? 'GET' : 'POST',
            redirect: 'error',
            signal: expect.any(AbortSignal),
            // Missing envelope must be rejected before domain/admission writes.
            ...(index === 0 ? {} : { headers: { 'Content-Type': 'application/json' }, body: '{}' }),
          },
        ])
      );
    }
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
        const round = Math.floor(requests++ / 4);
        return round === 1 ? new Response('Unavailable', { status: 503 }) : healthyProbeResponse(init);
      })
    );
    const ready = waitForFunctionsEmulatorReady();
    await vi.advanceTimersByTimeAsync(1_749);
    expect(requests).toBe(16);
    await vi.advanceTimersByTimeAsync(1);
    await ready;
    expect(requests).toBe(20);
  });

  it.each(['executeCanonicalCommand', 'queryKaspiPayments'])(
    'bounds repeated unhealthy probes and records failing %s without response payloads',
    async (failingEndpoint) => {
      vi.useFakeTimers();
      directory = mkdtempSync(join(tmpdir(), 'e2e-readiness-'));
      vi.stubEnv('CARVE_E2E_DIAGNOSTICS_DIR', directory);
      const cancel = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async (url: string, init: RequestInit) => {
            if (!url.endsWith(`/${failingEndpoint}`)) return healthyProbeResponse(init);
            const response = new Response('Unavailable', { status: 503 });
            const cancelBody = response.body!.cancel.bind(response.body);
            vi.spyOn(response.body!, 'cancel').mockImplementation(async () => {
              await cancelBody();
              cancel();
            });
            return response;
          }
        )
      );
      const outcome = waitForFunctionsEmulatorReady().catch((error) => error);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await outcome).toBeInstanceOf(Error);
      expect(fetch).toHaveBeenCalledTimes(240 * 4);
      expect(cancel).toHaveBeenCalledTimes(240);
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
        authCallableReady: failingEndpoint !== 'executeCanonicalCommand',
        kaspiCallableReady: failingEndpoint !== 'queryKaspiPayments',
      });
      expect(timeout.attempts).toBe(240);
      expect(timeout.stableProbes).toBe(0);
      expect(timeout.ready).toBe(false);
      expect(lines.join('\n')).not.toContain('Unavailable');
    }
  );

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
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init!.signal!.aborted).toBe(true);
      expect(init!.signal!.reason.name).toBe('TimeoutError');
    }
    expect(Date.now() - started).toBeGreaterThanOrEqual(3_000);
    expect(Date.now() - started).toBeLessThan(4_500);
  });
});
