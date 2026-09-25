import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANNER_VIDEO_STARTUP_WATCHDOG_MS, BannerMedia } from '../../src/ui/BannerMedia';

const useReducedMotion = vi.fn(() => false);
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

vi.mock('motion/react', () => ({
  useReducedMotion: () => useReducedMotion(),
}));

const originalLoad = HTMLMediaElement.prototype.load;

describe('BannerMedia', () => {
  beforeEach(() => {
    useReducedMotion.mockReturnValue(false);
    play.mockClear();
    play.mockImplementation(() => Promise.resolve());
    pause.mockClear();
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

  it('reloads a discarded preload and plays once a frame arrives', () => {
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

    expect(load).toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
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
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: originalLoad,
  });
});
