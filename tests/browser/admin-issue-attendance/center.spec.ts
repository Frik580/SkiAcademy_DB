import { expect, test } from '@playwright/test';

for (const width of [375, 390, 430, 768, 1023, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    for (const language of ['ru', 'en']) {
      test(`center ${width} ${theme} ${language}`, async ({ page }) => {
        let releaseCommand!: () => void;
        const commandGate = new Promise<void>((resolve) => {
          releaseCommand = resolve;
        });
        const commands: Array<{ kind: string; intent: { attendance: unknown[] } }> = [];
        await page.route('**/__attendance_command', async (route) => {
          commands.push(route.request().postDataJSON());
          await commandGate;
          await route.fulfill({ status: 200 });
        });
        await page.route('**/__attendance_refresh', (route) => route.fulfill({ status: 200 }));
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize({ width, height: 900 });
        await page.goto(
          `/tests/browser/admin-issue-attendance/index.html?kind=center&theme=${theme}&language=${language}&roster=${language === 'ru' ? 'single' : 'group'}`
        );
        const trigger = page
          .getByRole('button')
          .filter({
            hasText: language === 'ru' ? 'Нет данных о посещаемости' : 'Missing attendance',
          })
          .first();
        await trigger.scrollIntoViewIfNeeded();
        const originalScrollY = await page.evaluate(() => scrollY);
        await trigger.click();
        const detail = page.getByLabel(language === 'ru' ? 'Детали' : 'Issue detail', {
          exact: true,
        });
        await expect(detail).toBeVisible();
        expect(await detail.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        if (width < 1024) {
          await expect(detail).toHaveAttribute('role', 'dialog');
          const box = await detail.boundingBox();
          expect(box?.x).toBe(0);
          expect(box?.y).toBe(0);
          expect(box?.width).toBe(width);
          expect(box?.height).toBe(900);
          await page.screenshot({
            path: `.scratch/admin-issue-attendance/center-${width}-${theme}-${language}.png`,
          });
        } else {
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
        }
        const close = detail.getByRole('button', {
          name: language === 'ru' ? 'Закрыть' : 'Close',
          exact: true,
        });
        await close.click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.locator('[inert]')).toHaveCount(0);
        await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
        if (width < 1024) {
          await expect(trigger).toBeFocused();
          await expect.poll(() => page.evaluate(() => scrollY)).toBe(originalScrollY);
          await expect(page.locator('body')).not.toHaveCSS('position', 'fixed');
          await page.mouse.move(width - 10, 850);
          await page.mouse.wheel(0, 150);
          await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(originalScrollY);
        }
        await trigger.click();
        if (width < 1024) {
          await expect(detail).toHaveAttribute('role', 'dialog');
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await trigger.click();
          await expect(detail).toHaveAttribute('role', 'dialog');
        }
        const action = detail.getByRole('button', {
          name: language === 'ru' ? 'Все присутствовали' : 'Everyone attended',
        });
        await action.click();
        await expect(
          detail.getByRole('button', { name: language === 'ru' ? 'Сохраняем...' : 'Saving...' })
        ).toBeDisabled();
        await expect(close).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(detail).toBeVisible();
        const refreshed = page.waitForResponse('**/__attendance_refresh');
        releaseCommand();
        await refreshed;
        const savedText = language === 'ru' ? 'Посещаемость сохранена' : 'Attendance saved';
        await expect(detail.getByText(savedText, { exact: true })).toBeVisible();
        await expect(close).toBeEnabled();
        if (language === 'ru') await close.click();
        else await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(close).toHaveCount(0);
        await expect(page.getByText(savedText, { exact: true })).toBeVisible();
        await expect(trigger).toHaveCount(0);
        expect(commands).toEqual([
          expect.objectContaining({
            kind: 'finalize_booking_attendance',
            intent: expect.objectContaining({
              attendance: [
                expect.objectContaining({ attendanceStatus: 'present' }),
                ...(language === 'en'
                  ? [
                      expect.objectContaining({ attendanceStatus: 'present' }),
                      expect.objectContaining({
                        attendanceStatus: 'absent',
                        expectedAttendanceRevision: 3,
                      }),
                    ]
                  : []),
              ],
            }),
          }),
        ]);
        expect(errors).toEqual([]);
      });
    }
  }
}

test('failed save can close and reopen, then confirmed retry can close during a failed refresh', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const keys: string[] = [];
  await page.route('**/__attendance_command', async (route) => {
    keys.push(route.request().postDataJSON().idempotencyKey);
    await route.fulfill({ status: keys.length === 1 ? 503 : 200 });
  });
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await page.route('**/__attendance_refresh', async (route) => {
    await refreshGate;
    await route.fulfill({ status: 503 });
  });
  await page.goto('/tests/browser/admin-issue-attendance/index.html?kind=center&language=en');
  const trigger = page.getByRole('button').filter({ hasText: 'Missing attendance' }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Everyone attended' }).click();
  await expect(dialog.getByText(/Could not save attendance/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(/Could not save attendance/)).toBeVisible();
  await trigger.click();
  const refreshing = page.waitForRequest('**/__attendance_refresh');
  await dialog.getByRole('button', { name: 'Everyone attended' }).click();
  await refreshing;
  await expect(dialog.getByText('Updating task data…')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Attendance saved', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button').filter({ hasText: 'Attendance and payment conflict' })
  ).toBeVisible();
  releaseRefresh();
  await expect(page.getByText(/The data could not be refreshed/)).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

test('other issue and open detail survive the 1023/1024 breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1023, height: 900 });
  await page.goto('/tests/browser/admin-issue-attendance/index.html?kind=center&language=en');
  const trigger = page
    .getByRole('button')
    .filter({ hasText: 'Attendance and payment conflict' })
    .first();
  await trigger.click();
  const detail = page.getByLabel('Issue detail', { exact: true });
  await expect(detail).toHaveAttribute('role', 'dialog');
  await expect(
    detail.getByRole('heading', { name: 'Attendance and payment conflict', exact: true })
  ).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Everyone attended' })).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(detail).toBeVisible();
  await expect(page.locator('[inert]')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/modal-scroll-lock/);
  await page.setViewportSize({ width: 1023, height: 900 });
  await expect(detail).toHaveAttribute('role', 'dialog');
  await expect.poll(async () => (await detail.boundingBox())?.y).toBe(0);
  await page.keyboard.press('Tab');
  expect(await detail.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[inert]')).toHaveCount(0);
  await trigger.click();
  await detail.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(trigger).toBeFocused();
});
