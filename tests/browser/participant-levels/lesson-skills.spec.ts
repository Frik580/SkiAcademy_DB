import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const width of [375, 1024]) {
    test(`lesson skills fit at ${width}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/tests/browser/participant-levels/lesson-skills.html?theme=${theme}`);
      const dialog = page.getByRole('dialog');
      const beginner = dialog.getByRole('button', { name: 'Beginner 1' });
      const carve = dialog.getByRole('button', { name: 'Carve 1' });
      await expect(carve).toHaveAttribute('aria-expanded', 'true');
      await beginner.focus();
      await page.keyboard.press('Enter');
      await expect(beginner).toHaveAttribute('aria-expanded', 'true');
      await expect(carve).toHaveAttribute('aria-expanded', 'true');
      await expect(dialog.getByText('0 / 10 · 0%')).toBeVisible();
      await expect(dialog.getByText('8 / 10 · 80%')).toBeVisible();

      const layout = await dialog.evaluate((modal) => {
        const row = modal.querySelectorAll('.lesson-skill-row')[1]!;
        const [title, score] = Array.from(row.children, (child) => child.getBoundingClientRect());
        const probe = document.createElement('span');
        probe.style.color = 'var(--ink)';
        probe.style.backgroundColor = 'var(--card-bg)';
        modal.append(probe);
        const buttonStyle = getComputedStyle(modal.querySelector('.lesson-skill-toggle')!);
        const probeStyle = getComputedStyle(probe);
        const usesThemeTokens =
          buttonStyle.color === probeStyle.color &&
          buttonStyle.backgroundColor === probeStyle.backgroundColor;
        probe.remove();
        return {
          fits: [
            document.documentElement,
            modal,
            modal.querySelector('.admin-modal-body')!,
            row,
          ].every((element) => element.scrollWidth <= element.clientWidth),
          scoreBelow: score.top >= title.bottom,
          scoreRight: score.left >= title.right,
          usesThemeTokens,
        };
      });
      expect(layout).toMatchObject({ fits: true, usesThemeTokens: true });
      expect(width === 375 ? layout.scoreBelow : layout.scoreRight).toBe(true);
    });
  }
}
