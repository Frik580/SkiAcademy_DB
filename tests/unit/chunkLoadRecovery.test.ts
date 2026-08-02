import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isChunkLoadError, reloadForStaleChunk } from '../../src/lib/chunkLoadRecovery';

describe('isChunkLoadError', () => {
  it('detects stale dynamic import failures', () => {
    expect(
      isChunkLoadError(
        new Error(
          'Failed to fetch dynamically imported module: https://example.com/assets/PersonalCabinet-BTuwajtr.js'
        )
      )
    ).toBe(true);
  });

  it('ignores unrelated runtime errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

describe('reloadForStaleChunk', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    vi.stubGlobal('location', { reload: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reloads once and blocks repeated reloads within cooldown', () => {
    expect(reloadForStaleChunk()).toBe(true);
    expect(window.location.reload).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_000);
    expect(reloadForStaleChunk()).toBe(false);
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });

  it('allows another reload after cooldown expires', () => {
    reloadForStaleChunk();
    vi.advanceTimersByTime(10_001);
    expect(reloadForStaleChunk()).toBe(true);
    expect(window.location.reload).toHaveBeenCalledTimes(2);
  });
});
