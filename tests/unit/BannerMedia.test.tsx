import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANNER_VIDEO_FRAME_FALLBACK_MS, BANNER_VIDEO_STARTUP_WATCHDOG_MS, BannerMedia } from '../../src/ui/BannerMedia';
import { mockBannerVideoFrames } from './helpers/bannerVideoFrames';

const useReducedMotion = vi.fn(() => false);
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

vi.mock('framer-motion', () => ({
  useReducedMotion: () => useReducedMotion(),
}));

const originalLoad = HTMLMediaElement.prototype.load;

describe('BannerMedia', () => {
  beforeEach(() => {
    useReducedMotion.mockReturnValue(false);
    play.mockClear();
    play.mockImplementation(() => Promise.resolve());
    pause.mockClear();
    Object.defineProperty(HTMLMediaElement.prototype, 'load', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: play,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: pause,
    });
  });

  it('renders image only when mediaMode is image', () => {
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="image"
      />
    );
    expect(container.querySelector('img')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/hero.webp');
    expect(container.querySelector('div')).toBeNull();
    expect(document.querySelector('video')).toBeNull();
  });

  it('defaults to image when mediaMode is omitted', () => {
    render(<BannerMedia imageUrl="https://example.com/hero.webp" />);
    expect(document.querySelector('img')).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
  });

  it('renders a video-only element with the derived mp4 and no poster', () => {
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
      />
    );
    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute('src', 'https://example.com/hero.mp4');
    expect(video).toHaveAttribute('preload', 'auto');
    expect(video?.hasAttribute('poster')).toBe(false);
    expect((video as HTMLVideoElement).poster).toBe('');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('div')).toBeNull();
  });

  it('does not render an image before the video loads', () => {
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        isActive
      />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://example.com/hero.mp4');
  });

  it('does not render an image after a healthy video can play', () => {
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
      />
    );
    fireEvent.canPlay(document.querySelector('video')!);
    fireEvent.loadedData(document.querySelector('video')!);
    expect(container.querySelector('img')).toBeNull();
    expect(document.querySelector('video')?.hasAttribute('poster')).toBe(false);
  });

  it('does not mount video or image when the slide is outside the preload window', () => {
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        loadVideo={false}
        shouldLoadVideo={false}
        shouldPreloadVideo={false}
        isActive={false}
      />
    );
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('div')).toBeNull();
  });

  it('preloads the next video without an image or poster', () => {
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo={false}
        shouldPreloadVideo
        isActive={false}
      />
    );
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://example.com/hero.mp4');
    expect(video).toHaveAttribute('preload', 'auto');
    expect(video?.hasAttribute('poster')).toBe(false);
    expect(container.querySelector('img')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('falls back to image when video fails to load', () => {
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
      />
    );
    expect(container.querySelector('img')).toBeNull();
    const video = document.querySelector('video');
    expect(video).not.toBeNull();

    fireEvent.error(video!);

    expect(document.querySelector('video')).toBeNull();
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/hero.webp');
    expect(img).not.toHaveStyle({ visibility: 'hidden' });
  });

  it('resets video failure when image or mode changes', () => {
    const { rerender } = render(
      <BannerMedia
        imageUrl="https://example.com/a.webp"
        videoSourceImageUrl="https://example.com/a.webp"
        mediaMode="video"
      />
    );
    fireEvent.error(document.querySelector('video')!);
    expect(document.querySelector('video')).toBeNull();
    expect(document.querySelector('img')).toBeInTheDocument();

    rerender(
      <BannerMedia
        imageUrl="https://example.com/b.webp"
        videoSourceImageUrl="https://example.com/b.webp"
        mediaMode="video"
      />
    );
    expect(document.querySelector('video')).toHaveAttribute('src', 'https://example.com/b.mp4');
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('video')?.hasAttribute('poster')).toBe(false);
  });

  it('uses static image when prefers-reduced-motion is enabled', () => {
    useReducedMotion.mockReturnValue(true);
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        isActive
      />
    );
    expect(document.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/hero.webp');
    expect(container.querySelector('div')).toBeNull();
  });

  it('resets currentTime and plays when the video becomes active', () => {
    const { rerender } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo={false}
        shouldPreloadVideo
        isActive={false}
      />
    );
    const video = document.querySelector('video') as HTMLVideoElement;
    video.currentTime = 4;
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 2 });
    play.mockClear();

    rerender(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        shouldPreloadVideo={false}
        isActive
      />
    );

    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
    expect(document.querySelector('img')).toBeNull();
  });

  it('pauses without substituting an image when the video becomes inactive', () => {
    const { rerender } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        isActive
      />
    );
    pause.mockClear();

    rerender(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo={false}
        shouldPreloadVideo
        isActive={false}
      />
    );

    expect(pause).toHaveBeenCalled();
    expect(document.querySelector('video')).not.toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('plays a buffered video without calling load()', () => {
    const load = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: load,
    });
    const { rerender } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo={false}
        shouldPreloadVideo
        isActive={false}
      />
    );
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 2 });
    load.mockClear();
    play.mockClear();

    rerender(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        shouldPreloadVideo={false}
        isActive
      />
    );

    expect(load).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
    expect(document.querySelector('img')).toBeNull();
  });

  it('resumes a discarded Safari preload without resetting the resource', () => {
    const load = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: load,
    });
    const { rerender } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo={false}
        shouldPreloadVideo
        isActive={false}
        videoRole="NEXT_PRELOAD"
      />
    );
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 0 });
    Object.defineProperty(video, 'networkState', { configurable: true, get: () => 1 });
    video.currentTime = 3;
    load.mockClear();
    play.mockClear();

    rerender(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        shouldPreloadVideo={false}
        isActive
        videoRole="ACTIVE"
      />
    );

    expect(load).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalled();
    expect(document.querySelector('img')).toBeNull();

    fireEvent.loadedData(video);

    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
    expect(video.muted).toBe(true);
    expect(document.querySelector('img')).toBeNull();
    expect(video.hasAttribute('poster')).toBe(false);
  });

  it('falls back to an image when startup never reaches a frame, without a media error', () => {
    vi.useFakeTimers();
    const onVideoReady = vi.fn();
    const load = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: load,
    });
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        isActive
        onVideoReady={onVideoReady}
      />
    );
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video.error ?? null).toBeNull();

    act(() => {
      vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS);
    });

    expect(onVideoReady).toHaveBeenCalledTimes(1);
    expect(document.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/hero.webp');
    expect(container.querySelector('div')).toBeNull();
  });

  it.each(['inactive', 'unmount'])('ignores an old play rejection after %s', async (exit) => {
    let rejectPlayback!: (reason?: unknown) => void;
    play.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectPlayback = reject; }));
    const onVideoReady = vi.fn();
    const { container, rerender, unmount } = render(
      <BannerMedia imageUrl="https://example.com/hero.webp" mediaMode="video"
        isActive shouldLoadVideo retainVideo onVideoReady={onVideoReady} />
    );
    const video = container.querySelector('video');
    if (exit === 'unmount') unmount();
    else rerender(
      <BannerMedia imageUrl="https://example.com/hero.webp" mediaMode="video"
        isActive={false} shouldLoadVideo={false} retainVideo onVideoReady={onVideoReady} />
    );
    await act(async () => { rejectPlayback(new Error('interrupted playback')); });
    expect(onVideoReady).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toBeNull();
    if (exit === 'inactive') expect(container.querySelector('video')).toBe(video);
  });

  it('falls back to an image when play() rejects', async () => {
    play.mockImplementation(() => Promise.reject(new Error('play rejected')));
    const onVideoReady = vi.fn();
    const { container } = render(
      <BannerMedia
        imageUrl="https://example.com/hero.webp"
        videoSourceImageUrl="https://example.com/hero.webp"
        mediaMode="video"
        shouldLoadVideo
        isActive
        onVideoReady={onVideoReady}
      />
    );
    fireEvent.loadedData(document.querySelector('video')!);
    await act(async () => {
      await Promise.resolve();
    });

    expect(onVideoReady).toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/hero.webp');
    expect(container.querySelector('div')).toBeNull();
  });

  describe('activation frame readiness', () => {
    const girl = 'https://storage.yandexcloud.net/carve/images/girl.mp4';
    let frames: ReturnType<typeof mockBannerVideoFrames>;
    beforeEach(() => { vi.useFakeTimers(); frames = mockBannerVideoFrames(); });
    afterEach(() => { frames.restore(); });
    const buffered = (video: HTMLVideoElement) => {
      Object.defineProperty(video, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(video, 'networkState', { configurable: true, value: 1 });
    };

    it.each(['play', 'watchdog', 'network'] as const)('retries %s activation failure at the next admission with the same URL', async (failure) => {
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive videoRole="ACTIVE" />);
      const first = container.querySelector('video')!;
      buffered(first);
      frames.deliver(first);
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} />);
      if (failure === 'play') play.mockImplementationOnce(() => Promise.reject(new Error('temporary playback failure')));
      rerender(<BannerMedia {...props} isActive videoRole="ACTIVE" />);
      if (failure === 'watchdog') act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS); });
      else if (failure === 'network') {
        Object.defineProperty(first, 'error', { configurable: true, value: { code: 2 } });
        fireEvent.error(first);
      } else await act(async () => { await Promise.resolve(); });
      expect(container.querySelector('video')).toBeNull();
      expect(onVideoReady).toHaveBeenLastCalledWith(false, 'activation');
      const attempts = play.mock.calls.length;
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS * 2); });
      expect(play).toHaveBeenCalledTimes(attempts); // No retry in the failed activation.
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} />);
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} shouldPreloadVideo videoRole="NEXT_PRELOAD" />);
      const retry = container.querySelector('video')!;
      expect(retry).not.toBeNull();
      expect(retry).not.toBe(first);
      expect(retry).toHaveAttribute('src', girl);
      buffered(retry);
      const notifications = onVideoReady.mock.calls.length;
      rerender(<BannerMedia {...props} isActive videoRole="ACTIVE" />);
      expect(onVideoReady).toHaveBeenCalledTimes(notifications); // Stale failed notification cannot skip this activation.
      frames.deliver(retry);
      expect(onVideoReady).toHaveBeenLastCalledWith(true);
      expect(retry).toHaveStyle({ opacity: '1' });
      expect(vi.mocked(HTMLMediaElement.prototype.load).mock.contexts).not.toContain(retry);
    });

    it.each([3, 4])('keeps a real resource error %s persistent across admissions', (code) => {
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive />);
      const video = container.querySelector('video')!;
      Object.defineProperty(video, 'error', { configurable: true, value: { code } });
      fireEvent.error(video);
      expect(onVideoReady).toHaveBeenLastCalledWith(false, 'resource');
      const attempts = play.mock.calls.length;
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} shouldPreloadVideo videoRole="NEXT_PRELOAD" />);
      rerender(<BannerMedia {...props} isActive />);
      expect(container.querySelector('video,img')).toBeNull();
      expect(play).toHaveBeenCalledTimes(attempts);
      rerender(<BannerMedia {...props} imageUrl="https://example.com/repaired.mp4" isActive />);
      expect(container.querySelector('video')).toHaveAttribute('src', 'https://example.com/repaired.mp4');
    });

    it('bounds missing frame callbacks after resolved play, fresh playing and completed seek', async () => {
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive={false} shouldPreloadVideo />);
      const video = container.querySelector('video')!;
      buffered(video);
      video.currentTime = 3;
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      rerender(<BannerMedia {...props} isActive />);
      await act(async () => { await Promise.resolve(); });
      fireEvent.playing(video);
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_FRAME_FALLBACK_MS); });
      expect(onVideoReady).not.toHaveBeenCalled(); // playing alone cannot bypass the pending restart.
      fireEvent.seeked(video);
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_FRAME_FALLBACK_MS - 1); });
      expect(video).toHaveStyle({ opacity: '0' });
      act(() => { vi.advanceTimersByTime(1); });
      expect(onVideoReady).toHaveBeenCalledTimes(1);
      expect(onVideoReady).toHaveBeenCalledWith(true);
      expect(video).toHaveStyle({ opacity: '1' });
      expect(container.querySelector('video')).toBe(video);
      expect(video).toHaveAttribute('src', girl);
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS); });
      expect(container.querySelector('video')).toBe(video);
      expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
    });

    it('does not use cached data or resolved play without fresh playing when frame callbacks never arrive', async () => {
      const onVideoReady = vi.fn();
      const { container } = render(<BannerMedia imageUrl={girl} mediaMode="video" onVideoReady={onVideoReady} />);
      const video = container.querySelector('video')!;
      buffered(video);
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      fireEvent.loadedData(video);
      await act(async () => { await Promise.resolve(); });
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS); });
      expect(onVideoReady).toHaveBeenCalledTimes(1);
      expect(onVideoReady).toHaveBeenCalledWith(false, 'activation');
      expect(container.querySelector('video,img')).toBeNull();
    });

    it('cancels the bounded frame fallback when deactivated', () => {
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive />);
      const video = container.querySelector('video')!;
      buffered(video);
      Object.defineProperty(video, 'paused', { configurable: true, value: false });
      fireEvent.playing(video);
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} />);
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS); });
      expect(onVideoReady).not.toHaveBeenCalled();
      expect(container.querySelector('video')).toBe(video);
    });

    it('does not reveal initial girl.mp4 from data, playing or resolved play before its frame', async () => {
      const onVideoReady = vi.fn();
      const { container } = render(<BannerMedia imageUrl={girl} mediaMode="video" onVideoReady={onVideoReady} />);
      const video = container.querySelector('video')!;
      buffered(video);
      fireEvent.loadedData(video);
      fireEvent.canPlay(video);
      fireEvent.playing(video);
      await act(async () => { await Promise.resolve(); });
      expect(play).toHaveBeenCalledTimes(1);
      expect(video).toHaveStyle({ opacity: '0' });
      expect(onVideoReady).not.toHaveBeenCalled();
      const [, { callback }] = frames.pending(video);
      frames.deliver(video);
      expect(video).toHaveStyle({ opacity: '1' });
      expect(onVideoReady).toHaveBeenCalledTimes(1);
      expect(onVideoReady).toHaveBeenCalledWith(true);
      act(() => callback(0, {} as VideoFrameCallbackMetadata));
      expect(onVideoReady).toHaveBeenCalledTimes(1);
      expect(container.querySelector('img')).toBeNull();
    });

    it('retains element/src and waits for a post-seek frame on reactivation', () => {
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive shouldLoadVideo />);
      const video = container.querySelector('video')!;
      buffered(video);
      frames.deliver(video);
      let position = 3;
      let seeking = false;
      const order: string[] = [];
      Object.defineProperty(video, 'currentTime', { configurable: true, get: () => position, set: (value) => {
        expect(frames.request).toHaveBeenCalled();
        order.push('seek'); position = value; seeking = true;
      } });
      Object.defineProperty(video, 'seeking', { configurable: true, get: () => seeking });
      play.mockImplementation(() => { order.push('play'); return Promise.resolve(); });
      const observer = new MutationObserver(() => {});
      observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} />);
      expect(pause).toHaveBeenCalled();
      expect(video.currentTime).toBe(3);
      frames.request.mockClear();
      rerender(<BannerMedia {...props} isActive shouldLoadVideo />);
      expect(container.querySelector('video')).toBe(video);
      expect(video).toHaveAttribute('src', girl);
      expect(video.currentTime).toBe(0);
      expect(order).toEqual(['seek', 'play']);
      expect(video).toHaveStyle({ opacity: '0' });
      frames.deliver(video); // A callback during the seek cannot reveal the old frame.
      expect(onVideoReady).toHaveBeenCalledTimes(1);
      const [beforeSeekedId, { callback: beforeSeeked }] = frames.pending(video);
      seeking = false;
      fireEvent.seeked(video);
      expect(frames.cancel).toHaveBeenCalledWith(beforeSeekedId);
      act(() => beforeSeeked(0, {} as VideoFrameCallbackMetadata));
      expect(video).toHaveStyle({ opacity: '0' });
      frames.deliver(video);
      expect(video).toHaveStyle({ opacity: '1' });
      expect(onVideoReady).toHaveBeenCalledTimes(2);
      expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
      expect(observer.takeRecords()).toHaveLength(0);
      observer.disconnect();
    });

    it('cancels old frame callbacks and event listeners before the next activation', () => {
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive shouldLoadVideo />);
      const video = container.querySelector('video')!;
      buffered(video);
      const [oldId, { callback }] = frames.pending(video);
      const remove = vi.spyOn(video, 'removeEventListener');
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} />);
      expect(frames.cancel).toHaveBeenCalledWith(oldId);
      expect(remove).toHaveBeenCalledWith('playing', expect.any(Function));
      expect(remove).toHaveBeenCalledWith('seeked', expect.any(Function));
      rerender(<BannerMedia {...props} isActive shouldLoadVideo />);
      act(() => callback(0, {} as VideoFrameCallbackMetadata));
      expect(onVideoReady).not.toHaveBeenCalled();
      expect(video).toHaveStyle({ opacity: '0' });
      frames.deliver(video);
      expect(onVideoReady).toHaveBeenCalledTimes(1);
    });

    it('confirms a zero-position activation without requiring seeked', () => {
      const onVideoReady = vi.fn();
      const { container } = render(<BannerMedia imageUrl={girl} mediaMode="video" onVideoReady={onVideoReady} />);
      const video = container.querySelector('video')!;
      buffered(video);
      expect(video.currentTime).toBe(0);
      frames.deliver(video);
      expect(onVideoReady).toHaveBeenCalledTimes(1);
    });

    it('invalidates the previous source frame when an active video URL changes', () => {
      const onVideoReady = vi.fn();
      const { container, rerender } = render(<BannerMedia imageUrl={girl} mediaMode="video" onVideoReady={onVideoReady} />);
      const video = container.querySelector('video')!;
      buffered(video);
      const [, { callback }] = frames.pending(video);
      rerender(<BannerMedia imageUrl="https://example.com/new.mp4" mediaMode="video" onVideoReady={onVideoReady} />);
      expect(container.querySelector('video')).toBe(video);
      expect(video).toHaveAttribute('src', 'https://example.com/new.mp4');
      act(() => callback(0, {} as VideoFrameCallbackMetadata));
      expect(onVideoReady).not.toHaveBeenCalled();
      frames.deliver(video);
      expect(onVideoReady).toHaveBeenCalledTimes(1);
    });

    it.each(['resolve', 'reject'] as const)('ignores a stale play %s while the next activation waits for a frame', async (settlement) => {
      let resolve!: () => void;
      let reject!: (reason: Error) => void;
      play.mockImplementationOnce(() => new Promise<void>((ok, fail) => { resolve = ok; reject = fail; }));
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive shouldLoadVideo />);
      const video = container.querySelector('video')!;
      buffered(video);
      rerender(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} />);
      rerender(<BannerMedia {...props} isActive shouldLoadVideo />);
      await act(async () => { if (settlement === 'resolve') resolve(); else reject(new Error('old activation')); });
      expect(container.querySelector('video')).toBe(video);
      expect(container.querySelector('img')).toBeNull();
      expect(onVideoReady).not.toHaveBeenCalled();
      frames.deliver(video);
      expect(onVideoReady).toHaveBeenCalledTimes(1);
    });

    it.each(['throw', 'reject'] as const)('handles current play %s without rendering an MP4 as an image', async (failure) => {
      play.mockImplementation(() => {
        if (failure === 'throw') throw new Error('play failed');
        return Promise.reject(new Error('play failed'));
      });
      const onVideoReady = vi.fn();
      const { container } = render(<BannerMedia imageUrl={girl} mediaMode="video" onVideoReady={onVideoReady} />);
      await act(async () => { await Promise.resolve(); });
      expect(container.querySelector('video')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(onVideoReady).toHaveBeenCalledTimes(1); // Terminal failure releases carousel timing.
      expect(onVideoReady).toHaveBeenCalledWith(false, 'activation');
    });

    it('uses an available source image for a direct MP4 fallback', () => {
      const { container } = render(<BannerMedia imageUrl={girl} videoSourceImageUrl="https://example.com/girl.webp" mediaMode="video" />);
      fireEvent.error(container.querySelector('video')!);
      expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/girl.webp');
    });

    it.each([false, true])('keeps watchdog through pending playback; frame confirmed: %s', (confirmed) => {
      play.mockImplementation(() => new Promise<void>(() => {}));
      const onVideoReady = vi.fn();
      const { container } = render(<BannerMedia imageUrl="https://example.com/girl.webp" mediaMode="video" onVideoReady={onVideoReady} />);
      const video = container.querySelector('video')!;
      buffered(video);
      fireEvent.loadedData(video);
      fireEvent.playing(video);
      act(() => { vi.advanceTimersByTime(BANNER_VIDEO_STARTUP_WATCHDOG_MS - 1); });
      expect(container.querySelector('video')).toBe(video);
      expect(onVideoReady).not.toHaveBeenCalled();
      if (confirmed) frames.deliver(video);
      act(() => { vi.advanceTimersByTime(1); });
      expect(onVideoReady).toHaveBeenCalledTimes(1);
      if (confirmed) {
        expect(container.querySelector('video')).toBe(video);
        expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled();
      } else expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/girl.webp');
    });

    it.each([0, 3])('fallback requires fresh playing and completed restart at position %s', (position) => {
      frames.restore(); // Browser without requestVideoFrameCallback.
      const onVideoReady = vi.fn();
      const props = { imageUrl: girl, mediaMode: 'video', retainVideo: true, onVideoReady };
      const { container, rerender } = render(<BannerMedia {...props} isActive={false} shouldLoadVideo={false} shouldPreloadVideo />);
      const video = container.querySelector('video')!;
      buffered(video);
      video.currentTime = position;
      rerender(<BannerMedia {...props} isActive shouldLoadVideo />);
      fireEvent.loadedData(video);
      fireEvent.canPlay(video);
      expect(onVideoReady).not.toHaveBeenCalled();
      fireEvent.playing(video);
      if (position > 0) {
        expect(onVideoReady).not.toHaveBeenCalled();
        fireEvent.seeked(video);
      }
      expect(video.currentTime).toBe(0);
      expect(onVideoReady).toHaveBeenCalledTimes(1);
      expect(video).toHaveStyle({ opacity: '1' });
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: originalLoad,
  });
});
