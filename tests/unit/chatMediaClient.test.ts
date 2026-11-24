import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  token: vi.fn().mockResolvedValue('fresh-token'),
  fetch: vi.fn(),
}));
vi.mock('../../src/infrastructure/firebase', () => ({
  app: {
    options: { projectId: 'demo-ski-school-e2e', storageBucket: 'demo-ski-school-e2e.appspot.com' },
  },
  auth: { currentUser: { getIdToken: mocks.token } },
  firebaseEmulatorConfig: { useEmulators: false },
}));
import {
  chatMediaPath,
  downloadChatMedia,
  isSupportedChatMediaType,
  uploadChatMedia,
} from '../../src/features/chat/chatMediaClient';
beforeEach(() => {
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.fetch.mockReset();
  mocks.token.mockClear();
});
describe('private chat media client', () => {
  it('recovers a completed LIVE upload before sending any chunks on reselection', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: true, status: 201 });
    const path = 'chat/booking-1/retry.jpg';
    const uploadId = '11111111-1111-4111-8111-111111111111';
    await expect(
      uploadChatMedia(new Blob(['photo'], { type: 'image/jpeg' }), path, uploadId, true)
    ).resolves.toBe(`chat-media:${path}`);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toContain(`uploadId=${uploadId}`);
    expect(mocks.fetch.mock.calls[0][0]).toContain('checkOnly=true');
    expect(mocks.fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it('returns a committed attachment when the earlier finish wins the race with a resumed chunk', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true, status: 201 });
    const path = 'chat/booking-1/resume.jpg';
    await expect(
      uploadChatMedia(new Blob(['photo'], { type: 'image/jpeg' }), path, undefined, true)
    ).resolves.toBe(`chat-media:${path}`);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][0]).toContain('resume=true');
  });
  it('retries a transport failure for the same LIVE chunk', async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValue({ ok: true });
    await expect(
      uploadChatMedia(new Blob(['photo'], { type: 'image/jpeg' }), 'chat/booking-1/retry.jpg')
    ).resolves.toBe('chat-media:chat/booking-1/retry.jpg');
    expect(mocks.fetch.mock.calls[0][0]).toBe(mocks.fetch.mock.calls[1][0]);
  });
  it('surfaces a quota response without resending finish', async () => {
    const retryAt = Date.now() + 60_000;
    mocks.fetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ quota: { reason: 'uploads', retryAt } }), { status: 429 })
      )
      .mockResolvedValueOnce({ ok: true });
    await expect(
      uploadChatMedia(new Blob(['photo'], { type: 'image/jpeg' }), 'chat/booking-1/limit.jpg')
    ).rejects.toMatchObject({ reason: 'uploads', retryAt });
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch.mock.calls[2][1].method).toBe('DELETE');
  });
  it('retries a lost finish response with the same upload identity', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new TypeError('Connection lost'))
      .mockResolvedValueOnce({ ok: true });
    await expect(
      uploadChatMedia(new Blob(['photo'], { type: 'image/jpeg' }), 'chat/booking-1/retry.jpg')
    ).resolves.toBe('chat-media:chat/booking-1/retry.jpg');
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch.mock.calls[1][0]).toBe(mocks.fetch.mock.calls[2][0]);
  });
  it('converts historical token URLs into paths without fetching the token URL', async () => {
    const oldUrl =
      'https://firebasestorage.googleapis.com/v0/b/demo-ski-school-e2e.appspot.com/o/chat%2Fbooking-1%2Fphoto.jpg?alt=media&token=old-token';
    expect(chatMediaPath(oldUrl)).toBe('chat/booking-1/photo.jpg');
    mocks.fetch.mockResolvedValue(
      new Response('image', { headers: { 'X-Media-Size': '5', 'Content-Type': 'image/jpeg' } })
    );
    const blob = await downloadChatMedia(oldUrl);
    expect(blob.type).toBe('image/jpeg');
    expect(mocks.fetch.mock.calls[0][0]).toContain(
      '/bookingChatMedia?path=chat%2Fbooking-1%2Fphoto.jpg'
    );
    expect(mocks.fetch.mock.calls[0][0]).not.toContain('old-token');
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer fresh-token');
    expect(mocks.fetch.mock.calls[0][1].cache).toBe('no-store');
  });
  it('rejects external and wrong-bucket URLs', () => {
    expect(() => chatMediaPath('https://evil.example/file')).toThrow();
    expect(() =>
      chatMediaPath('https://firebasestorage.googleapis.com/v0/b/other/o/chat%2Fx%2Fy')
    ).toThrow();
  });
  it('uploads media through chunk/finish and stores an opaque path without a token', async () => {
    mocks.fetch.mockResolvedValue({ ok: true });
    const value = await uploadChatMedia(
      new Blob(['photo'], { type: 'image/jpeg' }),
      'chat/booking-1/photo.jpg'
    );
    expect(value).toBe('chat-media:chat/booking-1/photo.jpg');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[0][0]).toContain('op=chunk');
    expect(mocks.fetch.mock.calls[1][0]).toContain('op=finish');
    expect(mocks.token).toHaveBeenCalledTimes(2);
  });
  it('rechecks authorization on repeated downloads and never falls back after denial', async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response('image', { headers: { 'X-Media-Size': '5' } }))
      .mockResolvedValueOnce({ ok: false, status: 403 });
    await downloadChatMedia('chat-media:chat/booking-1/photo.jpg');
    await expect(downloadChatMedia('chat-media:chat/booking-1/photo.jpg')).rejects.toThrow('403');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it('mirrors the server media allowlist and refuses unsupported files before uploading', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
      expect(isSupportedChatMediaType(type)).toBe(true);
    for (const type of [
      'image/svg+xml',
      'image/gif',
      'image/heic',
      'image/avif',
      'video/quicktime',
      'text/html',
      '',
    ])
      expect(isSupportedChatMediaType(type)).toBe(false);
    for (const type of ['image/svg+xml', 'image/gif', 'image/heic', 'video/quicktime', 'text/html'])
      await expect(
        uploadChatMedia(new Blob(['payload'], { type }), 'chat/booking-1/payload.jpg')
      ).rejects.toThrow('Invalid chat media format or size');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
