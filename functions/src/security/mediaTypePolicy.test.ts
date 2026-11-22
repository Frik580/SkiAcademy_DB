import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_VIDEO_MAX_BYTES,
  assertChatMediaContentMatchesType,
  assertSupportedChatMediaUploadType,
  chatMediaUploadLimit,
  imageContentMatchesType,
  isAllowedProtectedImageType,
  isChatVideoContainer,
} from './mediaTypePolicy';

const png = () =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();

const jpeg = () =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();

const webp = () =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .webp()
    .toBuffer();

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script></svg>'
);
const html = Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>');
/** Smallest container headers a browser produced file starts with. */
const mp4Header = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
const webmHeader = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(24)]);

describe('CA-SEC-06A chat media upload allowlist', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])(
    'accepts supported upload type %s',
    (type) => {
      expect(() => assertSupportedChatMediaUploadType(type)).not.toThrow();
    }
  );

  it.each([
    'image/svg+xml',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif',
    'image/bmp',
    'text/html',
    'application/pdf',
    'application/octet-stream',
    '',
  ])('denies unsupported upload type %s', (type) => {
    expect(() => assertSupportedChatMediaUploadType(type)).toThrow('Unsupported media format');
  });

  it('applies the ordinary image policy to LIVE public paths and GIF only to TEST paths', () => {
    for (const path of [
      'participant-avatars/participant_1/avatar.jpg',
      'courses/course_1.webp',
      'instructors/instructor_1.jpg',
    ]) {
      for (const type of ['image/jpeg', 'image/png', 'image/webp'])
        expect(isAllowedProtectedImageType(path, type)).toBe(true);
      for (const type of ['image/gif', 'image/svg+xml', 'text/html'])
        expect(isAllowedProtectedImageType(path, type)).toBe(false);
    }
    expect(isAllowedProtectedImageType('test-actors/actor_1/avatar.jpg', 'image/gif')).toBe(true);
    expect(
      isAllowedProtectedImageType('test-sessions/session_1/misc/private-image.jpg', 'image/gif')
    ).toBe(true);
    expect(
      isAllowedProtectedImageType('test-sessions/session_1/misc/private-image.jpg', 'image/svg+xml')
    ).toBe(false);
  });

  it('bounds declared types with the documented limits', () => {
    expect(chatMediaUploadLimit('image/jpeg')).toBe(CHAT_IMAGE_MAX_BYTES);
    expect(chatMediaUploadLimit('video/webm')).toBe(CHAT_VIDEO_MAX_BYTES);
    expect(() => chatMediaUploadLimit('image/svg+xml')).toThrow('Unsupported media format');
  });
});

describe('CA-SEC-06A image content classification', () => {
  it.each([
    ['image/jpeg', jpeg],
    ['image/png', png],
    ['image/webp', webp],
  ] as const)('accepts real %s bytes', async (type, build) => {
    await expect(imageContentMatchesType(await build(), type)).resolves.toBe(true);
  });

  it('rejects re-labelled raster content', async () => {
    await expect(imageContentMatchesType(await png(), 'image/jpeg')).resolves.toBe(false);
    await expect(imageContentMatchesType(await jpeg(), 'image/webp')).resolves.toBe(false);
  });

  it('rejects SVG and HTML posing as an image', async () => {
    await expect(imageContentMatchesType(svg, 'image/png')).resolves.toBe(false);
    await expect(imageContentMatchesType(svg, 'image/jpeg')).resolves.toBe(false);
    await expect(imageContentMatchesType(html, 'image/png')).resolves.toBe(false);
    await expect(imageContentMatchesType(html, 'image/webp')).resolves.toBe(false);
  });

  it('rejects truncated and empty payloads', async () => {
    await expect(imageContentMatchesType(Buffer.alloc(0), 'image/jpeg')).resolves.toBe(false);
    await expect(imageContentMatchesType(Buffer.from([0xff, 0xd8]), 'image/jpeg')).resolves.toBe(
      false
    );
  });

  it('classifies GIF for the protected TEST paths it is still allowed on', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .gif()
      .toBuffer();
    await expect(imageContentMatchesType(gif, 'image/gif')).resolves.toBe(true);
    await expect(imageContentMatchesType(gif, 'image/png')).resolves.toBe(false);
  });

  // Documented residual risk (CA-SEC-06A F5): a valid raster header with an
  // appended payload is accepted. It is inert because every response is served
  // with nosniff/attachment and only rendered through <img>/<video>/Blob.
  it('accepts a raster payload with appended markup and never classifies it as HTML', async () => {
    const polyglot = Buffer.concat([await jpeg(), Buffer.from(html)]);
    await expect(imageContentMatchesType(polyglot, 'image/jpeg')).resolves.toBe(true);
    await expect(imageContentMatchesType(polyglot, 'image/png')).resolves.toBe(false);
    const metadata = await sharp(polyglot).metadata();
    expect(metadata.format).toBe('jpeg');
  });
});

describe('CA-SEC-06A video container classification', () => {
  it('accepts MP4 and WebM container headers only', () => {
    expect(isChatVideoContainer(mp4Header, 'video/mp4')).toBe(true);
    expect(isChatVideoContainer(webmHeader, 'video/webm')).toBe(true);
    expect(isChatVideoContainer(webmHeader, 'video/mp4')).toBe(false);
    expect(isChatVideoContainer(mp4Header, 'video/webm')).toBe(false);
    expect(isChatVideoContainer(svg, 'video/webm')).toBe(false);
    expect(isChatVideoContainer(html, 'video/mp4')).toBe(false);
  });

  it('denies declared types that are not on the allowlist', async () => {
    await expect(assertChatMediaContentMatchesType(svg, 'image/svg+xml')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('denies mislabelled payloads with invalid-argument', async () => {
    await expect(assertChatMediaContentMatchesType(svg, 'image/png')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(assertChatMediaContentMatchesType(html, 'video/webm')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(
      assertChatMediaContentMatchesType(webmHeader, 'video/mp4')
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('accepts a matching payload', async () => {
    await expect(assertChatMediaContentMatchesType(await jpeg(), 'image/jpeg')).resolves.toBe(
      undefined
    );
    await expect(
      assertChatMediaContentMatchesType(webmHeader, 'video/webm')
    ).resolves.toBe(undefined);
  });
});
