import { expect, type Page } from '@playwright/test';

/** Authenticated route mounted and managed Participant selection resolved.
 * Tile-specific content (XP, Next Step, etc.) still needs its own assertions.
 */
export async function waitForCabinetReady(page: Page, participantId: string): Promise<void> {
  // Scope badges are decorative and may be absent on a tab or for one person.
  // The shell contract survives reloads, tab navigation and Participant changes.
  await expect(
    page.getByRole('main').locator(
      `[data-testid="student-cabinet"][data-cabinet-state="ready"][data-cabinet-participant-id="${participantId}"]`
    )
  ).toBeVisible();
}
