import { test, expect, type Page, type Locator } from '@playwright/test';
import { createRequire } from 'node:module';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import {
  loadRuntimeConfig,
  signInStudent,
  fillBookingSelectors,
  submitStudentBookingConfirmation,
  waitForNewBlockingBookingForPayer,
  signInAccount,
} from './fixtures';
import { getBlockingBookingIdsForPayer } from './firestore-admin';
import { E2E_PROJECT_ID, functionsCallableUrl } from './emulator-config';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');
const { getStorage: getAdminStorage } = requireFunctions(
  'firebase-admin/storage'
) as typeof import('firebase-admin/storage');
const e2eBucket = () => getAdminStorage().bucket(`${E2E_PROJECT_ID}.appspot.com`);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  // Global setup checks Functions readiness. Warm only the booking and chat
  // callables that gate this media scenario before the first file selection.
  // An invalid callable envelope is rejected before admission/domain mutations.
  for (const name of [
    'queryLessonBookingReadModels',
    'queryLessonPricingSettingsReadModel',
    'queryChatMessages',
    'mutateChatMessage',
  ]) {
    const response = await fetch(functionsCallableUrl(name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    }).catch((error: unknown) => {
      throw new Error(`Functions readiness failed for ${name}`, { cause: error });
    });
    expect(response.status, `${name} emulator readiness`).toBe(400);
  }
  const media = await fetch(functionsCallableUrl('bookingChatMedia'), {
    signal: AbortSignal.timeout(15_000),
  });
  expect(media.status).toBe(401);
});

async function browserRead(page: Page, token: string, path: string) {
  return page.evaluate(
    async ({ token, url }) => {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      return { status: response.status, size: (await response.arrayBuffer()).byteLength };
    },
    { token, url: `${functionsCallableUrl('bookingChatMedia')}?${new URLSearchParams({ path })}` }
  );
}

async function openBrowserChatStream(page: Page, token: string, threadId: string) {
  const state = await page.evaluateHandle(
    async ({ token, url }) => {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok || !response.body) throw new Error(`Chat stream failed: ${response.status}`);
      return {
        reader: response.body.getReader(),
        decoder: new TextDecoder(),
        pending: '',
      };
    },
    {
      token,
      url: `${functionsCallableUrl('chatMessagesStream')}?${new URLSearchParams({ threadId })}`,
    }
  );
  return {
    read: () =>
      state.evaluate(async (stream) => {
        for (;;) {
          const boundary = stream.pending.indexOf('\n\n');
          if (boundary >= 0) {
            const frame = stream.pending.slice(0, boundary);
            stream.pending = stream.pending.slice(boundary + 2);
            return frame;
          }
          const chunk = await stream.reader.read();
          if (chunk.done) throw new Error('Chat stream ended before the next frame.');
          stream.pending += stream.decoder.decode(chunk.value, { stream: true });
        }
      }),
    close: async () => {
      await state.evaluate(({ reader }) => reader.cancel()).catch(() => undefined);
      await state.dispose();
    },
  };
}

async function expectBlobImage(scope: Page | Locator, name: string) {
  const image = scope.getByRole('img', { name, exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', /^blob:/);
}

test('authenticated lesson chat uploads, sends and reloads a private image and plays video', async ({
  page,
}, testInfo) => {
  test.setTimeout(360_000);
  page.setDefaultNavigationTimeout(30_000);
  page.setDefaultTimeout(15_000);
  const pending = new Set<string>();
  page.on('request', (request) => pending.add(new URL(request.url()).pathname));
  page.on('requestfinished', (request) => pending.delete(new URL(request.url()).pathname));
  page.on('requestfailed', (request) => {
    pending.delete(new URL(request.url()).pathname);
    console.log('request failed', new URL(request.url()).pathname, request.failure()?.errorText);
  });
  page.on('pageerror', (error) => console.log('browser error', error.message));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.endsWith('/bookingChatMedia')) {
      console.log(
        'Browser media response',
        response.request().method(),
        url.searchParams.get('op') ?? 'read',
        response.status(),
        response.headers()['content-type']
      );
    }
  });
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  const runtime = loadRuntimeConfig();
  expect(runtime.projectId).toBe(E2E_PROJECT_ID);
  const directUrls: string[] = [];
  let studentToken = '';
  let mediaPath = '';
  page.on('request', (request) => {
    if (/firebasestorage\.googleapis\.com\/v0\/.+\/o\//.test(request.url()))
      directUrls.push(request.url());
    if (request.url().includes('/bookingChatMedia?')) {
      studentToken = request.headers().authorization?.replace(/^Bearer /, '') ?? studentToken;
      mediaPath = new URL(request.url()).searchParams.get('path') ?? mediaPath;
    }
  });
  await page.addInitScript(() => {
    const created: string[] = [];
    const revoked: string[] = [];
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      revoke(url);
    };
    Object.assign(window, { mediaBlobAudit: { created, revoked } });
  });
  const before = await getBlockingBookingIdsForPayer(runtime.studentUid);
  try {
    await signInStudent(page, runtime);
    await page.getByRole('button', { name: 'Book Lesson', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Choose a coach' })).toBeVisible();
    const pricingReady = page.waitForResponse(
      (response) =>
        response.url().includes('/queryLessonPricingSettingsReadModel') &&
        response.status() === 200,
      { timeout: 30_000 }
    );
    await page
      .getByRole('button')
      .filter({ hasText: runtime.workspaceInstructorName })
      .first()
      .click();
    await pricingReady;
  } catch (error) {
    console.log('pending page resources', [...pending]);
    throw error;
  }
  // A failed attempt keeps its canonical Booking and resource reservation.
  // Give every retry/repeat a different date without bypassing availability.
  const dayOffset = 7 + testInfo.repeatEachIndex * (testInfo.project.retries + 1) + testInfo.retry;
  await fillBookingSelectors(page, dayOffset, {
    participantDisplayName: runtime.studentDisplayName,
    time: '11:00',
  });
  await submitStudentBookingConfirmation(page);
  const booking = await waitForNewBlockingBookingForPayer(
    runtime.studentUid,
    before,
    (candidate) => candidate.lifecycleStatus === 'confirmed'
  );
  const coachVideoName = `coach-feedback-${booking.bookingId}.webm`;
  const coachImageName = `coach-homework-${booking.bookingId}.jpg`;
  const svgName = `hostile-image-${booking.bookingId}.svg`;
  const mislabeledVideoName = `mislabeled-svg-${booking.bookingId}.webm`;
  const coachVideoText = `Coach video E2E ${booking.bookingId}`;
  await page.goto('/cabinet/calendar', { waitUntil: 'domcontentloaded' });
  const openChat = async () => {
    await page
      .locator(`[id="booking-card-${booking.bookingId}"]`)
      .getByRole('button', { name: /Chat|Чат/ })
      .click();
    const chat = page.locator('.ui-modal').filter({
      has: page.getByRole('heading', { name: /Lesson Discussion|Обсуждение занятия/ }),
    });
    await expect(chat).toBeVisible();
    return chat;
  };
  let chat = await openChat();
  console.log('Browser: authenticated student opened canonical Booking chat');
  const studentText = 'Student chat regression check';
  await chat.locator('input[type=text]').fill(studentText);
  await chat.locator('input[type=text]').press('Enter');
  await expect(chat.getByText(studentText, { exact: true })).toBeVisible();
  const studentMessage = await getFirestore()
    .doc(`bookings/${booking.bookingId}`)
    .collection('verified_chat_messages')
    .where('text', '==', studentText)
    .get();
  expect(studentMessage.docs.map((message) => message.data())).toMatchObject([
    { senderId: runtime.studentUid, senderRole: 'client', senderName: runtime.studentDisplayName },
  ]);
  console.log('Browser: authenticated student sent verified text');
  const image = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 16;
      canvas.getContext('2d')!.fillRect(0, 0, 16, 16);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((value) => resolve(value!), 'image/jpeg')
      );
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    })
  );
  await chat.locator('input[type=file][accept="image/*"]').setInputFiles({
    name: 'private-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: image,
  });
  await expectBlobImage(chat, 'Attachment preview');
  // Use the real composer; attachment persists in the message after pending preview disappears.
  await chat.locator('input[type=text]').fill('Private media E2E');
  await chat.locator('input[type=text]').press('Enter');
  await expect(chat.getByText('Private media E2E', { exact: true })).toBeVisible();
  console.log('Browser: JPEG uploaded and attachment message sent');
  await chat.getByTitle('Close', { exact: true }).click();
  chat = await openChat();
  await expectBlobImage(chat, 'private-photo.jpg');
  await page.reload();
  chat = await openChat();
  const rendered = chat.getByRole('img', { name: 'private-photo.jpg', exact: true });
  await expect(rendered).toBeVisible();
  await expect(rendered).toHaveAttribute('src', /^blob:/);
  await expect
    .poll(() => rendered.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  // Generate a playable local WebM; no external fixtures or media downloads.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillRect(0, 0, 16, 16);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const parts: BlobPart[] = [];
    recorder.ondataavailable = (event) => parts.push(event.data);
    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    // Static canvas capture can contain only one timestamp-zero frame, which
    // Chromium considers ended before play(). Record actual changing frames.
    let frame = 0;
    const animation = setInterval(() => {
      context.fillStyle = frame++ % 2 ? 'red' : 'blue';
      context.fillRect(0, 0, 16, 16);
    }, 50);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    clearInterval(animation);
    recorder.stop();
    await done;
    stream.getTracks().forEach((track) => track.stop());
    return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()));
  });
  await chat.locator('input[type=file][accept="video/*"]').setInputFiles({
    name: 'private-video.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(bytes),
  });
  await expect(chat.getByText('private-video.webm', { exact: true })).toBeVisible();
  await chat.locator('input[type=text]').fill('Private video E2E');
  await chat.locator('input[type=text]').press('Enter');
  await expect(chat.getByText('Private video E2E', { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'private-video.webm' }).click();
  const video = chat.getByText('Private video E2E', { exact: true }).locator('..').locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('src', /^blob:/);
  await video.evaluate((element) => (element as HTMLVideoElement).play());
  await expect
    .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(video).toBeVisible();
  await page.evaluate(() => localStorage.setItem('alpine_glide_lang', 'ru'));
  await page.reload();
  chat = await openChat();
  await expectBlobImage(chat, 'private-photo.jpg');
  await chat.getByRole('button', { name: 'private-video.webm' }).click();
  const reloadedVideo = chat
    .getByText('Private video E2E', { exact: true })
    .locator('..')
    .locator('video');
  await expect(reloadedVideo).toBeVisible();
  await expect(reloadedVideo).toHaveAttribute('src', /^blob:/);
  await page.screenshot({ path: testInfo.outputPath('student-mobile-ru.png') });
  await chat.getByTitle('Закрыть', { exact: true }).click();
  expect(
    await page.evaluate(() => {
      const audit = (
        window as unknown as { mediaBlobAudit: { created: string[]; revoked: string[] } }
      ).mediaBlobAudit;
      return audit.created.every((url) => audit.revoked.includes(url)) && audit.created.length > 0;
    })
  ).toBe(true);

  // A denied download remains an error/retry control and cannot use a public URL.
  await page.route('**/bookingChatMedia?**', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 403, body: '{}' });
    else await route.continue();
  });
  chat = await openChat();
  const retry = chat.getByRole('button', { name: 'private-photo.jpg', exact: true });
  await expect(retry).toBeVisible();
  await page.unroute('**/bookingChatMedia?**');
  await retry.click();
  await expectBlobImage(chat, 'private-photo.jpg');
  expect(directUrls).toEqual([]);
  const messages = await getFirestore()
    .collection('bookings')
    .doc(booking.bookingId)
    .collection('verified_chat_messages')
    .limit(10)
    .get();
  const attachments = messages.docs.map((doc) => doc.data()).filter((message) => message.attachmentUrl);
  expect(attachments).toHaveLength(2);
  for (const attachment of attachments) {
    expect(attachment).toMatchObject({
      senderId: runtime.studentUid,
      senderRole: 'client',
      senderName: runtime.studentDisplayName,
    });
    expect(attachment.attachmentUrl).toMatch(new RegExp(`^chat-media:chat/${booking.bookingId}/`));
  }
  console.log(
    'Browser: playback, mobile RU reload, Blob cleanup and authorized error retry passed; private references persisted'
  );

  // Use the path actually requested by the client (the video in this sequence).
  expect(mediaPath).toMatch(new RegExp(`^chat/${booking.bookingId}/`));
  expect(studentToken).not.toBe('');
  expect((await browserRead(page, studentToken, mediaPath)).status).toBe(200);

  const rolePages: Page[] = [];
  const testDocumentsBefore: DocumentSnapshot[] = [];
  const testStoragePaths: string[] = [];
  const livePath = mediaPath;
  try {
    const login = async (
      email: string,
      password: string,
      expectedPath?: '/cabinet' | '/instructor'
    ) => {
      const context = await page
        .context()
        .browser()!
        .newContext({
          baseURL: 'http://127.0.0.1:5173',
          locale: 'en-US',
          viewport: { width: 1280, height: 900 },
        });
      const rolePage = await context.newPage();
      rolePage.setDefaultTimeout(15_000);
      rolePage.setDefaultNavigationTimeout(30_000);
      await rolePage.addInitScript(() => localStorage.setItem('alpine_glide_lang', 'en'));
      rolePages.push(rolePage);
      await rolePage.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
        route.abort()
      );
      let response: ReturnType<typeof rolePage.waitForResponse> | undefined;
      await signInAccount(rolePage, { email, password, expectedPath }, () => {
        response = rolePage.waitForResponse((response) =>
          response.url().includes('accounts:signInWithPassword')
        );
      });
      const { idToken } = (await (await response!).json()) as { idToken: string };
      console.log('Browser: role login passed', expectedPath ?? 'admin');
      return { page: rolePage, token: idToken };
    };
    const instructor = await login(
      runtime.instructorEmail,
      runtime.instructorPassword,
      '/instructor'
    );
    expect((await browserRead(instructor.page, instructor.token, mediaPath)).status).toBe(200);
    await instructor.page
      .locator(`[id="instructor-lesson-${booking.bookingId}"]`)
      .getByRole('button', { name: /Chat/ })
      .click();
    const instructorChat = instructor.page.locator('.ui-modal');
    await expectBlobImage(instructorChat, 'private-photo.jpg');
    await instructorChat.locator('input[type=file][accept="video/*"]').setInputFiles({
      name: coachVideoName,
      mimeType: 'video/webm',
      buffer: Buffer.from(bytes),
    });
    await expect(instructorChat.getByText(coachVideoName, { exact: true })).toBeVisible();
    await instructorChat.locator('input[type=text]').fill(coachVideoText);
    await instructorChat.locator('input[type=text]').press('Enter');
    await expect(instructorChat.getByText(coachVideoText, { exact: true })).toBeVisible();
    await instructorChat
      .getByRole('checkbox', { name: 'Homework assignment', exact: true })
      .last()
      .check();
    await instructorChat.locator('input[type=file][accept="image/*"]').setInputFiles({
      name: coachImageName,
      mimeType: 'image/jpeg',
      buffer: image,
    });
    await expect(instructorChat.getByText(coachImageName, { exact: true })).toBeVisible();
    await instructorChat.locator('input[type=text]').fill('Coach homework E2E');
    await instructorChat.locator('input[type=text]').press('Enter');
    await expect(instructorChat.getByText('Coach homework E2E', { exact: true })).toBeVisible();
    // Bypass the UI raster compressor as a hostile authorized sender could.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" onload="localStorage.setItem(\'h1-svg-executed\',\'yes\')"><script>localStorage.setItem("h1-svg-executed","yes")</script><rect width="16" height="16" fill="red"/></svg>'
    );
    const svgPath = `chat/${booking.bookingId}/hostile-image.svg`;
    const svgMessageId = `svg-regression-${booking.bookingId}`;
    const svgVideoMessageId = `svg-video-regression-${booking.bookingId}`;
    // The media gateway classifies bytes: an active payload is rejected even when
    // the sender is an authorized chat participant.
    expect(
      await instructor.page.evaluate(
        async ({ token, url, bytes }) => {
          const uploadId = crypto.randomUUID();
          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          };
          const chunk = await fetch(`${url}&op=chunk&index=0&uploadId=${uploadId}`, {
            method: 'POST',
            headers,
            body: new Uint8Array(bytes),
          });
          const finish = await fetch(
            `${url}&op=finish&count=1&type=image%2Fsvg%2Bxml&uploadId=${uploadId}`,
            { method: 'POST', headers }
          );
          return [chunk.status, finish.status];
        },
        {
          token: instructor.token,
          url: `${functionsCallableUrl('bookingChatMedia')}?${new URLSearchParams({ path: svgPath })}`,
          bytes: [...svg],
        }
      )
    ).toEqual([204, 400]);
    // Historical objects may already exist: seed one directly to keep the
    // inert-render regression for already published hostile attachments.
    await e2eBucket()
      .file(svgPath)
      .save(svg, { resumable: false, metadata: { contentType: 'image/svg+xml' } });
    const homeworkFixture = await getFirestore()
      .collection('bookings')
      .doc(booking.bookingId)
      .collection('verified_chat_messages')
      .where('text', '==', 'Coach homework E2E')
      .limit(1)
      .get();
    expect(homeworkFixture.size).toBe(1);
    await getFirestore()
      .doc(`bookings/${booking.bookingId}/messages/${svgMessageId}`)
      .set({
        ...homeworkFixture.docs[0].data(),
        id: svgMessageId,
        text: 'SVG passive viewer regression',
        attachmentUrl: `chat-media:${svgPath}`,
        attachmentName: svgName,
        attachmentSize: svg.length,
        timestamp: new Date().toISOString(),
      });
    await page.evaluate(() => localStorage.removeItem('h1-svg-executed'));
    await getFirestore()
      .doc(`bookings/${booking.bookingId}/messages/${svgVideoMessageId}`)
      .set({
        ...homeworkFixture.docs[0].data(),
        id: svgVideoMessageId,
        text: 'SVG mislabeled video regression',
        attachmentType: 'video',
        attachmentUrl: `chat-media:${svgPath}`,
        attachmentName: mislabeledVideoName,
        attachmentSize: svg.length,
        timestamp: new Date().toISOString(),
      });
    await page.locator('.ui-modal').getByTitle('Закрыть', { exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page
      .getByRole('button', { name: 'Coach', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/cabinet\/coach$/);
    await page
      .getByRole('button', { name: /Video reviews/ })
      .first()
      .click();
    await page.getByRole('button', { name: coachVideoName, exact: true }).click();
    const galleryVideo = page
      .getByText(coachVideoText, { exact: true })
      .locator('..')
      .locator('video');
    await expect(galleryVideo).toBeVisible();
    await expect(galleryVideo).toHaveAttribute('src', /^blob:/);
    await galleryVideo.evaluate((element) => (element as HTMLVideoElement).play());
    await expect
      .poll(() => galleryVideo.evaluate((element) => (element as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: runtime.workspaceInstructorName, exact: true }).click();
    await page
      .getByRole('button', { name: /Homework/ })
      .first()
      .click();
    const galleryImage = page.getByRole('img', { name: coachImageName, exact: true });
    await expect(galleryImage).toBeVisible();
    await expect(galleryImage).toHaveAttribute('src', /^blob:/);
    await expect(page.getByRole('button', { name: mislabeledVideoName, exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: svgName, exact: true })).toHaveCount(0);
    const viewerOpened = page.waitForEvent('popup');
    await page.getByRole('button', { name: coachImageName, exact: true }).click();
    const viewer = await viewerOpened;
    await expect(viewer.getByRole('img', { name: coachImageName, exact: true })).toHaveAttribute(
      'src',
      /^blob:/
    );
    expect(viewer.url()).toBe('about:blank');
    await viewer.close();
    await page.goto('/cabinet', { waitUntil: 'domcontentloaded' });
    const homeworkHistory = page.getByRole('region', { name: 'Homework', exact: true });
    await expect(homeworkHistory.getByText(/Archived homework/).first()).toBeVisible();
    const mislabeledVideo = homeworkHistory.getByRole('button', { name: mislabeledVideoName, exact: true });
    await mislabeledVideo.click();
    await expect(mislabeledVideo).toHaveText(/↻/);
    await expect(homeworkHistory.locator('video[src^="blob:"]')).toHaveCount(0);
    const archivedImage = homeworkHistory.getByRole('img', { name: svgName, exact: true });
    await expect(archivedImage).toBeVisible();
    // Archive cards render inline. Exercise native "Open image in new tab"
    // using the exact Blob URL displayed by that card.
    await expect(archivedImage).toHaveAttribute('src', /^blob:/);
    const displayedSvg = await archivedImage.getAttribute('src');
    expect(
      await page.evaluate(async (url) => (await (await fetch(url!)).blob()).type, displayedSvg)
    ).toBe('image/png');
    const nativeImageViewer = await page.context().newPage();
    await nativeImageViewer.goto(displayedSvg!);
    await expect
      .poll(() =>
        nativeImageViewer
          .locator('img')
          .evaluate((element) => (element as HTMLImageElement).naturalWidth)
      )
      .toBe(16);
    expect(await nativeImageViewer.evaluate(() => localStorage.getItem('h1-svg-executed'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('h1-svg-executed'))).toBeNull();
    await nativeImageViewer.close();
    expect(directUrls).toEqual([]);
    console.log(
      'Browser: instructor upload, coach video gallery and homework image Blob zoom passed'
    );
    const admin = await login(runtime.adminEmail, runtime.adminPassword);
    expect((await browserRead(admin.page, admin.token, mediaPath)).status).toBe(200);
    const adminBooking = (await getFirestore().doc(`bookings/${booking.bookingId}`).get()).data()!;
    const plannerDate = new Intl.DateTimeFormat('sv-SE', {
      timeZone: adminBooking.occurrence.timeZone,
    }).format(new Date(adminBooking.occurrence.interval.startsAt.seconds * 1000));
    const planner = new URLSearchParams({
      tab: 'operations',
      plannerDate,
      plannerBooking: booking.bookingId,
    });
    await admin.page.goto(`/admin?${planner}`, {
      waitUntil: 'domcontentloaded',
    });
    await admin.page.getByRole('button', { name: 'Open Chat / Discussion', exact: true }).click();
    const adminChat = admin.page.getByRole('dialog', { name: 'Lesson Discussion' });
    await expectBlobImage(adminChat, 'private-photo.jpg');
    const adminText = 'Administration chat regression check';
    await adminChat.locator('input[type=text]').fill(adminText);
    await adminChat.locator('input[type=text]').press('Enter');
    await expect(adminChat.getByText(adminText, { exact: true })).toBeVisible();
    const adminMessage = await getFirestore()
      .doc(`bookings/${booking.bookingId}`)
      .collection('verified_chat_messages')
      .where('text', '==', adminText)
      .get();
    expect(adminMessage.docs.map((message) => message.data())).toMatchObject([
      { senderRole: 'admin', senderName: runtime.adminDisplayName },
    ]);
    await admin.page.screenshot({ path: testInfo.outputPath('admin-chat-desktop-en.png') });
    const outsider = await login(runtime.studentBEmail, runtime.studentBPassword, '/cabinet');
    expect((await browserRead(outsider.page, outsider.token, livePath)).status).toBe(403);

    const db = getFirestore();
    const owner = db.doc(`participant_management_active_owner/${runtime.studentParticipantId}`);
    const originalOwner = (await owner.get()).data()!;
    const stream = await openBrowserChatStream(page, studentToken, booking.bookingId);
    try {
      expect(await stream.read()).toContain('private-photo.jpg');
      await owner.update({ accountId: runtime.studentBUid });
      expect(await stream.read()).toMatch(/^event: denied/);
      expect((await browserRead(page, studentToken, mediaPath)).status).toBe(403);
      expect((await browserRead(outsider.page, outsider.token, mediaPath)).status).toBe(200);
    } finally {
      await stream.close();
      await owner.set(originalOwner);
    }
    const record = db.doc(`bookings/${booking.bookingId}`);
    const original = (await record.get()).data()!;
    await record.update({ 'occurrence.instructorId': runtime.instructorId });
    try {
      expect((await browserRead(instructor.page, instructor.token, mediaPath)).status).toBe(403);
      expect((await browserRead(page, studentToken, mediaPath)).status).toBe(200);
    } finally {
      await record.set(original);
    }
    expect(
      (
        await browserRead(
          admin.page,
          admin.token,
          `test-sessions/test_session_a/booking-chat/${booking.bookingId}/photo.jpg`
        )
      ).status
    ).toBe(403);
    const { TestActorSchema, TestActorAssignmentSchema, TestSessionSchema, BookingSchema } =
      requireFunctions('@ski-academy/shared-domain') as typeof import('@ski-academy/shared-domain');
    const testSessionId = `test_session_media_${booking.bookingId}`;
    const testBookingId = `booking_media_test_${booking.bookingId}`;
    // Restore only this scenario's fixtures, including the outsider's LIVE/TEST identity.
    testDocumentsBefore.push(
      ...(await db.getAll(
        db.doc(`test_sessions/${testSessionId}`),
        db.doc(`users/${runtime.studentBUid}`),
        db.doc(`participants/${runtime.studentBParticipantId}`),
        db.doc(`test_actors/${runtime.studentBUid}`),
        db.doc(`test_actor_assignments/${runtime.studentBUid}`),
        db.doc(`test_sessions/${testSessionId}/membership/${runtime.studentBUid}`),
        db.doc(`bookings/${testBookingId}`)
      ))
    );
    const metadata = {
      revision: 1,
      createdAt: original.createdAt,
      updatedAt: original.updatedAt,
      audit: original.audit,
    };
    await db.doc(`test_sessions/${testSessionId}`).set(
      TestSessionSchema.parse({
        ...metadata,
        testSessionId,
        schemaVersion: 1,
        status: 'active',
        label: 'Media browser TEST',
        createdByAccountId: runtime.studentUid,
        config: { startingBalanceKzt: 0, clonedCourseIds: [] },
        inventoryRevision: 0,
      })
    );
    await db.doc(`test_actors/${runtime.studentBUid}`).set(
      TestActorSchema.parse({
        ...metadata,
        accountId: runtime.studentBUid,
        participantIds: [runtime.studentBParticipantId],
        kind: 'test_parent',
        allowed: true,
        dataScope: 'test',
      })
    );
    await db.doc(`test_actor_assignments/${runtime.studentBUid}`).set(
      TestActorAssignmentSchema.parse({
        accountId: runtime.studentBUid,
        activeTestSessionId: testSessionId,
        revision: 1,
        updatedAt: original.updatedAt,
        audit: original.audit,
      })
    );
    await db
      .doc(`test_sessions/${testSessionId}/membership/${runtime.studentBUid}`)
      .set({ accountId: runtime.studentBUid });
    await db.doc(`bookings/${testBookingId}`).set(
      BookingSchema.parse({
        ...original,
        bookingId: testBookingId,
        dataScope: 'test',
        testSessionId,
        party: { kind: 'individual', participantIds: [runtime.studentBParticipantId] },
        occurrence: {
          ...original.occurrence,
          serviceParty: { participantIds: [runtime.studentBParticipantId] },
        },
      })
    );
    const testPath = `test-sessions/${testSessionId}/booking-chat/${testBookingId}/test.jpg`;
    const transformedAccount = db.doc(`users/${runtime.studentBUid}`);
    const transformedParticipant = db.doc(`participants/${runtime.studentBParticipantId}`);
    await transformedAccount.update({ dataScope: 'test' });
    await transformedParticipant.update({ dataScope: 'test' });
    testStoragePaths.push(testPath);
    expect(
      await outsider.page.evaluate(
        async ({ token, url, bytes }) => {
          const uploadId = crypto.randomUUID();
          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          };
          const chunk = await fetch(`${url}&op=chunk&index=0&uploadId=${uploadId}`, {
            method: 'POST',
            headers,
            body: new Uint8Array(bytes),
          });
          const finish = await fetch(
            `${url}&op=finish&count=1&type=image%2Fjpeg&uploadId=${uploadId}`,
            { method: 'POST', headers }
          );
          return [chunk.status, finish.status];
        },
        {
          token: outsider.token,
          url: `${functionsCallableUrl('bookingChatMedia')}?${new URLSearchParams({ path: testPath })}`,
          bytes: [...image],
        }
      )
    ).toEqual([204, 201]);
    expect((await browserRead(outsider.page, outsider.token, testPath)).status).toBe(200);
    expect((await browserRead(page, studentToken, testPath)).status).toBe(403);
    expect((await browserRead(outsider.page, outsider.token, livePath)).status).toBe(403);
    expect(
      (
        await browserRead(
          outsider.page,
          outsider.token,
          testPath.replace(testSessionId, 'test_session_other')
        )
      ).status
    ).toBe(403);
    const avatarPath = `test-actors/${runtime.studentBParticipantId}/avatar.jpg`;
    testStoragePaths.push(avatarPath);
    const avatarRequest = (viewer: Page, token: string, path: string, upload = false) =>
      viewer.evaluate(
        async ({ token, url, bytes }) => {
          const response = await fetch(url, {
            method: bytes ? 'POST' : 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              ...(bytes ? { 'Content-Type': 'image/jpeg' } : {}),
            },
            body: bytes ? new Uint8Array(bytes) : undefined,
            signal: AbortSignal.timeout(20_000),
            cache: 'no-store',
          });
          return {
            status: response.status,
            cacheControl: response.headers.get('cache-control'),
            length: (await response.arrayBuffer()).byteLength,
          };
        },
        {
          token,
          url: `${functionsCallableUrl('protectedImages')}?${new URLSearchParams({ path })}`,
          bytes: upload ? [...image] : undefined,
        }
      );
    expect(
      (
        await avatarRequest(
          outsider.page,
          outsider.token,
          `participant-avatars/${runtime.studentBParticipantId}/avatar.jpg`,
          true
        )
      ).status
    ).toBe(201);
    expect(await avatarRequest(outsider.page, outsider.token, avatarPath)).toEqual({
      status: 200,
      cacheControl: 'private, no-store',
      length: image.length,
    });
    expect((await avatarRequest(page, studentToken, avatarPath)).status).toBe(403);
    const { getStorage } = requireFunctions(
      'firebase-admin/storage'
    ) as typeof import('firebase-admin/storage');
    const [storedAvatar] = await getStorage()
      .bucket(`${E2E_PROJECT_ID}.appspot.com`)
      .file(avatarPath)
      .getMetadata();
    expect(storedAvatar.metadata?.firebaseStorageDownloadTokens).toBeUndefined();
    await db.doc(`test_sessions/${testSessionId}`).update({ status: 'locked' });
    expect((await avatarRequest(outsider.page, outsider.token, avatarPath)).status).toBe(403);
    console.log(
      'Browser roles: student/instructor/admin 200; outsider 403; owner/instructor revocation 403; LIVE-to-TEST 403; TEST avatar owner 200, after lock 403'
    );
  } catch (error) {
    for (const [index, rolePage] of rolePages.entries()) {
      await rolePage
        .screenshot({ path: testInfo.outputPath(`role-${index}-failure.png`) })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await Promise.allSettled(rolePages.map((rolePage) => rolePage.context().close()));
    try {
      if (testDocumentsBefore.length) {
        const restore = getFirestore().batch();
        for (const snapshot of testDocumentsBefore) {
          if (snapshot.exists) restore.set(snapshot.ref, snapshot.data()!);
          else restore.delete(snapshot.ref);
        }
        await restore.commit();
      }
    } finally {
      if (testStoragePaths.length) {
        const { getStorage } = requireFunctions(
          'firebase-admin/storage'
        ) as typeof import('firebase-admin/storage');
        const bucket = getStorage().bucket(`${E2E_PROJECT_ID}.appspot.com`);
        await Promise.all(
          testStoragePaths.map((path) => bucket.file(path).delete({ ignoreNotFound: true }))
        );
      }
    }
  }
});
