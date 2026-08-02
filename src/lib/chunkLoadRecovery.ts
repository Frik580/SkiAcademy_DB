const RELOAD_GUARD_KEY = 'chunk-load-reload-at';
const RELOAD_COOLDOWN_MS = 10_000;

export function isChunkLoadError(error: Error | null | undefined): boolean {
  if (!error) return false;

  const message = error.message.toLowerCase();

  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('loading css chunk') ||
    error.name === 'ChunkLoadError'
  );
}

export function reloadForStaleChunk(): boolean {
  const lastReload = sessionStorage.getItem(RELOAD_GUARD_KEY);
  const now = Date.now();

  if (lastReload && now - Number(lastReload) < RELOAD_COOLDOWN_MS) {
    return false;
  }

  sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  window.location.reload();
  return true;
}

export function registerChunkLoadRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadForStaleChunk();
  });
}
