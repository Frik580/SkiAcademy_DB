import { expect, type Page } from '@playwright/test';

/** Wait for the multi-participant student cabinet and its selected Participant. */
export async function waitForCabinetReady(page: Page, participantId: string): Promise<void> {
  // The authenticated navbar alone can precede the lazy route and its data.
  // Observe product UI; importing a module neither proves hydration nor scope.
  await expect(
    page
      .getByRole('banner')
      .locator('[data-testid="navbar-participant-switcher"]:visible')
      .locator(`[data-participant-id="${participantId}"]`)
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('main').locator(`[data-participant-scope="${participantId}"]`).first()
  ).toBeVisible();
}
