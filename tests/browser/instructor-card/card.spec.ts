import { expect, test, type Locator } from '@playwright/test';

async function appearance(trigger: Locator) {
  return trigger.evaluate((button) => {
    const svg = button.querySelector('svg')!;
    const s = getComputedStyle(button);
    const i = getComputedStyle(svg);
    const avatar = button.parentElement!.parentElement!;
    const a = avatar.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const v = svg.getBoundingClientRect();
    const painted = svg.getBBox();
    const matrix = svg.getScreenCTM()!;
    const halfStroke = parseFloat(i.strokeWidth) / 2;
    return {
      top: v.top - a.top,
      right: a.right - v.right,
      paintedTop: (painted.y - halfStroke) * matrix.d + matrix.f - a.top,
      paintedRight: a.right - ((painted.x + painted.width + halfStroke) * matrix.a + matrix.e),
      button: { x: b.x, y: b.y, width: b.width, height: b.height },
      iconWidth: v.width,
      color: i.color,
      opacity: i.opacity,
      background: s.backgroundColor,
      border: s.borderTopWidth,
      shadow: s.boxShadow,
      filter: i.filter,
      transition: i.transitionDuration,
      transitionProperty: i.transitionProperty,
    };
  });
}

for (const width of [390, 768, 1440]) {
  for (const theme of ['light', 'dark']) {
    for (const blocked of [false, true]) {
      test(`${width}px ${theme} blocked=${blocked}: corner, hover, layout and focus`, async ({
        page,
      }, info) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) =>
          route.abort()
        );
        await page.goto(
          `/tests/browser/instructor-card/index.html?theme=${theme}&blocked=${blocked}`
        );
        const trigger = page.getByRole('button', {
          name: blocked ? 'Unblock instructor' : 'Block instructor',
        });
        await expect(trigger).toBeVisible();
        await expect
          .poll(() =>
            page.locator('.ui-list-row').evaluate((card) => getComputedStyle(card).opacity)
          )
          .toBe('1');
        const before = await appearance(trigger);
        expect(before.top).toBeCloseTo(0, 1);
        expect(before.right).toBeCloseTo(0, 1);
        expect(before.paintedTop).toBeCloseTo(0, 1);
        expect(before.paintedRight).toBeCloseTo(0, 1);
        expect(before.button.width).toBe(44);
        expect(before.button.height).toBe(44);
        expect(before.iconWidth).toBe(width < 768 ? 12 : 16);
        await expect(trigger.locator(blocked ? '.lucide-x' : '.lucide-check')).toHaveCount(1);
        expect(before.background).toBe('rgba(0, 0, 0, 0)');
        expect(before.border).toBe('0px');
        expect(before.shadow).toBe('none');
        expect(before.filter).toBe('none');
        expect(before.opacity).toBe('1');
        expect(before.transition).toBe('0.15s');
        await trigger.hover();
        await expect
          .poll(async () => (await appearance(trigger)).iconWidth)
          .toBeCloseTo(before.iconWidth * 1.1, 1);
        const hovered = await appearance(trigger);
        expect(hovered.button).toEqual(before.button);
        expect(hovered.color).toBe(before.color);
        expect(hovered.background).toBe(before.background);
        expect(hovered.shadow).toBe('none');
        expect(hovered.filter).toBe('none');
        expect(hovered.opacity).toBe('1');
        await page.mouse.move(0, 0);
        await expect
          .poll(async () => (await appearance(trigger)).iconWidth)
          .toBeCloseTo(before.iconWidth, 1);
        await expect(page.getByRole('button', { name: 'Book Lesson' })).toHaveCount(1);
        if (blocked) await expect(page.getByRole('button', { name: 'Book Lesson' })).toBeDisabled();
        else await expect(page.getByRole('button', { name: 'Book Lesson' })).toBeEnabled();
        const avatarFilter = await page
          .getByRole('img')
          .evaluate((img) => getComputedStyle(img).filter);
        expect(avatarFilter).toBe(blocked ? 'grayscale(1)' : 'none');
        const contentOpacity = await page
          .locator('.ui-list-row > .flex-1')
          .evaluate((content) => getComputedStyle(content).opacity);
        expect(contentOpacity).toBe(blocked ? '0.8' : '1');
        expect(
          await page
            .locator('.ui-list-row')
            .evaluate((card) => getComputedStyle(card).backgroundColor)
        ).toBe('rgba(0, 0, 0, 0)');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.keyboard.press('Tab');
        await expect(trigger).toBeFocused();
        expect(await trigger.evaluate((button) => getComputedStyle(button).outlineWidth)).toBe(
          '2px'
        );
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await page.mouse.click(4, 4);
        await page.locator('main').screenshot({ path: info.outputPath('card.png') });
      });
    }
  }
}

for (const language of ['en', 'ru']) {
  test(`${language}: block and unblock update card and booking without reload`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route(/googleapis\.com|firebaseio\.com|cloudfunctions\.net/, (route) =>
      route.abort()
    );
    await page.goto(`/tests/browser/instructor-card/index.html?language=${language}`);
    const ru = language === 'ru';
    const trigger = page.getByRole('button', {
      name: ru ? 'Заблокировать инструктора' : 'Block instructor',
      exact: true,
    });
    await trigger.click();
    const confirm = page.getByRole('button', { name: ru ? 'Заблокировать' : 'Block', exact: true });
    await expect(confirm).toBeDisabled();
    await page.getByRole('textbox').fill('Reason');
    await confirm.click();
    await expect(
      page.getByRole('button', { name: ru ? 'Забронировать' : 'Book Lesson', exact: true })
    ).toBeDisabled();
    const unblock = page.getByRole('button', {
      name: ru ? 'Разблокировать инструктора' : 'Unblock instructor',
      exact: true,
    });
    await expect(unblock).toBeFocused();
    const normal = await appearance(unblock);
    await unblock.hover();
    expect((await appearance(unblock)).transitionProperty).toBe('none');
    expect((await appearance(unblock)).iconWidth).toBe(normal.iconWidth);
    await unblock.click();
    await page
      .getByRole('button', { name: ru ? 'Разблокировать' : 'Unblock', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: ru ? 'Забронировать' : 'Book Lesson', exact: true })
    ).toBeEnabled();
    await expect(trigger).toBeFocused();
  });
}
