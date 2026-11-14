import type { Page } from '@playwright/test';

/** Wait for the live Vite route's complete import graph in the current document. */
export async function waitForCabinetModule(page: Page): Promise<void> {
  // DOMContentLoaded and the authenticated navbar can precede this lazy route.
  // A reload/goto creates a new module registry, so repeat this per document.
  // Do not mutate stores or substitute module readiness for product assertions.
  await page.evaluate(async () => {
    const moduleUrl = '/src/app/routes/CabinetRouteContainer.tsx';
    await import(moduleUrl);
  });
}
