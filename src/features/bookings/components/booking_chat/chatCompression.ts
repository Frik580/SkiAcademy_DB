import type { TranslationKey } from '../../../../lib/LanguageContext';

export class LocalizedCompressionError extends Error {
  i18nKey: TranslationKey;
  constructor(key: TranslationKey) {
    super(key);
    this.i18nKey = key;
    this.name = 'LocalizedCompressionError';
  }
}

export function formatCompressionError(
  err: unknown,
  t: (key: TranslationKey) => string,
  fallbackKey: TranslationKey
): string {
  if (err instanceof LocalizedCompressionError) {
    return t(err.i18nKey);
  }
  return `${t(fallbackKey)}: ${err instanceof Error ? err.message : String(err)}`;
}

export const compressImage = (file: File): Promise<{ blob: Blob; name: string; size: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new LocalizedCompressionError('chatCompressionCanvasError'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({
                blob,
                name: file.name,
                size: blob.size,
              });
            } else {
              reject(new LocalizedCompressionError('chatCompressionCanvasError'));
            }
          },
          'image/jpeg',
          0.7
        );
      };
      img.onerror = () => reject(new LocalizedCompressionError('chatCompressionImageLoadFailed'));
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const compressVideo = (file: File): Promise<{ blob: Blob; name: string; size: number }> => {
  if (file.size < 400 * 1024) {
    return Promise.resolve({ blob: file, name: file.name, size: file.size });
  }

  const hasCapture =
    'captureStream' in HTMLCanvasElement.prototype ||
    'mozCaptureStream' in HTMLCanvasElement.prototype;
  if (!window.MediaRecorder || !hasCapture) {
    if (file.size < 900 * 1024) {
      return Promise.resolve({ blob: file, name: file.name, size: file.size });
    }
    return Promise.reject(new LocalizedCompressionError('chatCompressionUnsupported'));
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    const timeoutId = setTimeout(() => {
      reject(new LocalizedCompressionError('chatCompressionTimeout'));
    }, 12000);

    video.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      let width = video.videoWidth;
      let height = video.videoHeight;
      const maxDim = 400;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new LocalizedCompressionError('chatCompressionCanvasError'));
        return;
      }

      const canvasStream = (
        canvas as HTMLCanvasElement & {
          captureStream?: (fps: number) => MediaStream;
          mozCaptureStream?: (fps: number) => MediaStream;
        }
      ).captureStream
        ? (
            canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }
          ).captureStream(12)
        : (canvas as HTMLCanvasElement & { mozCaptureStream: (fps: number) => MediaStream })
              .mozCaptureStream
          ? (
              canvas as HTMLCanvasElement & { mozCaptureStream: (fps: number) => MediaStream }
            ).mozCaptureStream(12)
          : null;
      if (!canvasStream) {
        reject(new LocalizedCompressionError('chatCompressionStreamFailed'));
        return;
      }

      let options: MediaRecorderOptions = {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: 150000,
      };
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options = { mimeType: 'video/webm', videoBitsPerSecond: 150000 };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options = { mimeType: '', videoBitsPerSecond: 150000 };
      }

      try {
        const mediaRecorder = new MediaRecorder(canvasStream, options);
        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const compressedBlob = new Blob(chunks, { type: 'video/webm' });
          resolve({
            blob: compressedBlob,
            name: file.name.replace(/\.[^/.]+$/, '') + '_optimized.webm',
            size: compressedBlob.size,
          });
          URL.revokeObjectURL(video.src);
        };

        video.playbackRate = 2.5;
        video.play();
        mediaRecorder.start();

        const drawFrame = () => {
          if (video.paused || video.ended) {
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            }
            return;
          }
          ctx.drawImage(video, 0, 0, width, height);
          if ('requestVideoFrameCallback' in video) {
            (
              video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void }
            ).requestVideoFrameCallback(drawFrame);
          } else {
            setTimeout(drawFrame, 1000 / 12);
          }
        };

        if ('requestVideoFrameCallback' in video) {
          (
            video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void }
          ).requestVideoFrameCallback(drawFrame);
        } else {
          setTimeout(drawFrame, 1000 / 12);
        }

        video.onended = () => {
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        };
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      reject(new LocalizedCompressionError('chatCompressionVideoParseFailed'));
    };
  });
};

export type AttachmentType = 'image' | 'video' | 'link';

export interface PendingAttachment {
  type: AttachmentType;
  url: string;
  name: string;
  size?: number;
}
