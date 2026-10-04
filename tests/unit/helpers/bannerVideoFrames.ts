import { act } from '@testing-library/react';
import { vi } from 'vitest';

/** Explicitly deliver frames; play resolution and readyState never synthesize one. */
export function mockBannerVideoFrames() {
  let nextId = 1;
  const callbacks = new Map<number, { video: HTMLVideoElement; callback: VideoFrameRequestCallback }>();
  const requestDescriptor = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
  const cancelDescriptor = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
  const request = vi.fn(function (this: HTMLVideoElement, callback: VideoFrameRequestCallback) {
    const id = nextId++;
    callbacks.set(id, { video: this, callback });
    return id;
  });
  const cancel = vi.fn((id: number) => { callbacks.delete(id); });
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { configurable: true, value: request });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: cancel });
  return {
    request,
    cancel,
    pending(video: HTMLVideoElement) {
      const entry = [...callbacks.entries()].find(([, item]) => item.video === video);
      if (!entry) throw new Error('No pending video frame');
      return entry;
    },
    deliver(video: HTMLVideoElement) {
      const [id, item] = this.pending(video);
      callbacks.delete(id);
      act(() => item.callback(0, { mediaTime: video.currentTime, presentedFrames: id } as VideoFrameCallbackMetadata));
    },
    restore() {
      if (requestDescriptor) Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', requestDescriptor);
      else Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
      if (cancelDescriptor) Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', cancelDescriptor);
      else Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
    },
  };
}
