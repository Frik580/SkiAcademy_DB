import { expect, test, type Locator } from '@playwright/test';

// Resolve modern CSS colors through the browser, then composite alpha in sRGB.
async function contrast(locator: Locator, placeholder = false) {
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        let node: Element | null = element;
        while (node) {
          if (Number(getComputedStyle(node).opacity) !== 1) return false;
          node = node.parentElement;
        }
        return true;
      })
    )
    .toBe(true);
  return locator.evaluate((element, placeholder) => {
    const rgba = (color: string) => {
      if (color.startsWith('rgb')) {
        const values = color.match(/[\d.]+/g)!.map(Number);
        return [...values.slice(0, 3), values[3] ?? 1];
      }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const values = ctx.getImageData(0, 0, 1, 1).data;
      return [values[0], values[1], values[2], values[3] / 255];
    };
    const over = (a: number[], b: number[]) =>
      a.slice(0, 3).map((v, i) => v * a[3] + b[i] * (1 - a[3]));
    const luminance = (rgb: number[]) =>
      rgb
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const layers = [];
    let covered = false;
    let node: Element | null = element;
    while (node) {
      const style = getComputedStyle(node);
      // This helper deliberately excludes image/gradient/glass/group-opacity backgrounds.
      if (
        Number(style.opacity) !== 1 ||
        (!covered && (style.backgroundImage !== 'none' || style.backdropFilter !== 'none'))
      ) {
        throw new Error(
          `Contrast needs pixel measurement: ${node.tagName}.${node.className} (${style.opacity}, ${style.backgroundImage}, ${style.backdropFilter})`
        );
      }
      if (!covered) {
        const color = rgba(style.backgroundColor);
        layers.push(color);
        covered = color[3] === 1;
      }
      node = node.parentElement;
    }
    let bg = [255, 255, 255];
    for (const layer of layers.reverse()) bg = over(layer, bg);
    const style = getComputedStyle(element, placeholder ? '::placeholder' : null);
    if (placeholder && Number(style.opacity) !== 1)
      throw new Error('Unexpected placeholder opacity');
    const values = [luminance(over(rgba(style.color), bg)), luminance(bg)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }, placeholder);
}

for (const theme of ['light', 'dark']) {
  test(`${theme}: public text, rating states and placeholders meet AA`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((theme) => {
      localStorage.setItem('alpine_glide_lang', 'en');
      localStorage.setItem('theme', theme);
      document.addEventListener('DOMContentLoaded', () =>
        document.documentElement.classList.toggle('dark', theme === 'dark')
      );
    }, theme);
    await page.route('**/*', (route) =>
      new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort()
    );
    await page.goto('/tests/browser/public-modals/index.html?contrast=1');
    const description = page.getByText('Course description', { exact: true });
    await expect(description).toBeVisible();
    const priceUnit = page.locator('article').getByText('Full course', { exact: true });
    const rating = page.getByRole('button', { name: '4.8 (12)', exact: true });
    await expect.poll(() => contrast(description)).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(priceUnit)).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(rating)).toBeGreaterThanOrEqual(4.5);
    await rating.hover();
    await expect.poll(() => contrast(rating)).toBeGreaterThanOrEqual(4.5);
    await rating.focus();
    await page.mouse.move(0, 0);
    await expect.poll(() => contrast(rating)).toBeGreaterThanOrEqual(4.5);
    const panel = page.getByTestId('contrast-seats-4');
    expect(
      await contrast(panel.getByText('ACTIVE ENROLLMENT', { exact: true }))
    ).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(panel.getByText('4 of 8 LEFT', { exact: false }))).toBeGreaterThanOrEqual(
      4.5
    );
    await page.goto('/tests/browser/public-modals/index.html');
    for (const kind of ['auth', 'enrollment', 'booking']) {
      await page.getByRole('button', { name: `Open ${kind}`, exact: true }).click();
      const fields = page.locator('input[placeholder]:visible, textarea[placeholder]:visible');
      await expect(fields.first()).toBeVisible();
      for (const field of await fields.all())
        expect(await contrast(field, true)).toBeGreaterThanOrEqual(4.5);
      const labels = page.getByRole('dialog').locator('label');
      for (const label of await labels.all()) {
        if (await label.isVisible()) expect(await contrast(label)).toBeGreaterThanOrEqual(4.5);
      }
      await fields.first().focus();
      expect(await contrast(fields.first(), true)).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });
}
