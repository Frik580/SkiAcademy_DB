import { describe, expect, it } from 'vitest';
import {
  LocalizedCompressionError,
  compressVideo,
} from '../../src/features/bookings/components/booking_chat/chatCompression';

const videoFile = (type: string, bytes: number) =>
  new File([new Uint8Array(bytes)], `clip.${type.split('/')[1]}`, { type });

describe('CA-SEC-06A chat video compression allowlist', () => {
  it.each(['video/webm', 'video/mp4'])(
    'passes a small allowlisted %s through unchanged',
    async (type) => {
      const file = videoFile(type, 100 * 1024);
      const result = await compressVideo(file);
      expect(result.blob).toBe(file);
      expect(result.name).toBe(file.name);
    }
  );

  it.each(['video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'application/octet-stream'])(
    'never passes a small unverifiable %s through to the media gateway',
    async (type) => {
      // jsdom has no MediaRecorder/captureStream, so the unsupported container must
      // fail instead of being uploaded with an unverifiable Content-Type.
      await expect(compressVideo(videoFile(type, 100 * 1024))).rejects.toBeInstanceOf(
        LocalizedCompressionError
      );
      await expect(compressVideo(videoFile(type, 500 * 1024))).rejects.toMatchObject({
        i18nKey: 'chatCompressionUnsupported',
      });
    }
  );
});
