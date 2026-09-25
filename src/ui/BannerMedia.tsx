import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  deriveBannerVideoUrl,
  normalizeBannerMediaMode,
  type BannerMediaMode,
} from '../lib/bannerMedia';
import { logger } from '../shared';

export interface BannerMediaProps {
  imageUrl: string;
  /** Unproxied image URL used to derive `.mp4` (defaults to `imageUrl`). */
  videoSourceImageUrl?: string;
  mediaMode?: BannerMediaMode | unknown;
  /**
   * Mount the video for active playback.
   * Defaults to true so a standalone video banner still loads.
   * Carousel callers should pass `shouldLoadVideo` / `shouldPreloadVideo` explicitly.
   */
  loadVideo?: boolean;
  /** When set, overrides playback vs preload. Defaults to the load flag. */
  isActive?: boolean;
  /** Active slide: mount the video and play it. */
  shouldLoadVideo?: boolean;
  /** Next or outgoing slide: mount and buffer the video without playing it. */
  shouldPreloadVideo?: boolean;
  /** Active video can play, or the active video fell back to an image. */
  onVideoReady?: () => void;
  /** Development trace: which carousel slot this element occupies. */
  videoRole?: BannerVideoRole;
  slideIndex?: number;
  slideId?: string;
  /** Development trace: how many hero videos are mounted with this one. */
  mountedVideoCount?: number;
  /** Applied to the image or video element (background fill). */
  className?: string;
  srcSet?: string;
  sizes?: string;
  fetchpriority?: 'high' | 'low' | 'auto';
  decoding?: 'sync' | 'async' | 'auto';
  loading?: 'eager' | 'lazy';
  draggable?: boolean;
}

export type BannerVideoRole = 'ACTIVE' | 'NEXT_PRELOAD' | 'OUTGOING';

const DEFAULT_MEDIA_CLASS =
  'absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none';

/** HAVE_CURRENT_DATA — enough to show a frame without waiting for canplaythrough. */
const HAVE_CURRENT_DATA = 2;
const NETWORK_IDLE = 1;
const NETWORK_LOADING = 2;
const NETWORK_NO_SOURCE = 3;

/**
 * Cold-start ceiling for one video slide. A discarded preload or a decoder that
 * never produces a frame must fall back instead of holding the carousel.
 * Longer than a single hero interval check in tests (5s) so a slow-but-healthy
 * file can still reach loadeddata before the image fallback.
 */
export const BANNER_VIDEO_STARTUP_WATCHDOG_MS = 8000;

const HERO_VIDEO_DEBUG = import.meta.env.DEV && import.meta.env.MODE !== 'test';

/**
 * Safari can keep a detached element's decoder alive after React removes the node.
 * Release only once the element is actually leaving the tree, never during the crossfade.
 */
function releaseVideoElement(video: HTMLVideoElement) {
  try {
    video.pause();
  } catch {
    // The element may already be detached.
  }
  video.removeAttribute('src');
  try {
    video.load();
  } catch {
    // load() on a detached node is best-effort.
  }
}

export const BannerMedia: React.FC<BannerMediaProps> = ({
  imageUrl,
  videoSourceImageUrl,
  mediaMode,
  loadVideo = true,
  isActive: isActiveProp,
  shouldLoadVideo: shouldLoadVideoProp,
  shouldPreloadVideo = false,
  onVideoReady,
  videoRole,
  slideIndex,
  slideId,
  mountedVideoCount,
  className = DEFAULT_MEDIA_CLASS,
  srcSet,
  sizes,
  fetchpriority,
  decoding,
  loading,
  draggable = false,
}) => {
  const shouldReduceMotion = useReducedMotion() === true;
  const mode = normalizeBannerMediaMode(mediaMode);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoRevealed, setVideoRevealed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sawPreloadRef = useRef(false);
  const onVideoReadyRef = useRef(onVideoReady);
  onVideoReadyRef.current = onVideoReady;

  const shouldLoadVideo = shouldLoadVideoProp ?? loadVideo;
  const isActive = isActiveProp ?? shouldLoadVideo;

  const derivationBase = videoSourceImageUrl || imageUrl;
  const videoUrl = deriveBannerVideoUrl(derivationBase);
  const preferVideo = mode === 'video' && !shouldReduceMotion && Boolean(videoUrl);
  const mountVideo = preferVideo && !videoFailed && (shouldLoadVideo || shouldPreloadVideo);
  const showImage = !preferVideo || videoFailed;
  if (mountVideo && !isActive) {
    sawPreloadRef.current = true;
  }
  const traceRef = useRef<
    (event: string, video?: HTMLVideoElement | null, extra?: Record<string, unknown>) => void
  >(() => {});
  traceRef.current = (event, video, extra) => {
    if (!HERO_VIDEO_DEBUG) return;
    logger.debug('[hero-video]', event, {
      slideIndex,
      slideId,
      videoUrl,
      role: videoRole ?? (isActive ? 'ACTIVE' : shouldPreloadVideo ? 'PRELOAD' : 'IDLE'),
      mountedVideoCount,
      readyState: video?.readyState,
      networkState: video?.networkState,
      ...extra,
    });
  };

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      videoRef.current = node;
      traceRef.current('mount', node);
      return;
    }
    const previous = videoRef.current;
    if (!previous) return;
    videoRef.current = null;
    traceRef.current('unmount', previous);
    releaseVideoElement(previous);
  }, []);

  useEffect(() => {
    setVideoFailed(false);
    setVideoRevealed(false);
  }, [imageUrl, videoSourceImageUrl, mode, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!mountVideo || !video) return;

    if (!isActive) {
      try {
        video.pause();
      } catch {
        // Ignore pause on a not-yet-loaded element.
      }
      traceRef.current('pause', video);
      return;
    }

    video.muted = true;
    video.playsInline = true;

    let cancelled = false;
    let failed = false;
    let playbackRequested = false;
    let watchdogId = 0;

    const markReady = () => {
      window.clearTimeout(watchdogId);
      setVideoRevealed(true);
      onVideoReadyRef.current?.();
    };

    const failStartup = (reason: 'watchdog' | 'play-reject' | 'play-throw' | 'media-error') => {
      if (cancelled || failed) return;
      failed = true;
      window.clearTimeout(watchdogId);
      const mediaError = video.error;
      traceRef.current('startup-failure', video, {
        reason,
        failureClass: mediaError ? 'VIDEO_FILE_FAILURE' : 'RESOURCE_LIFECYCLE_FAILURE',
        mediaErrorCode: mediaError?.code ?? null,
      });
      setVideoFailed(true);
    };

    const beginPlayback = () => {
      if (cancelled || failed || playbackRequested) return;
      playbackRequested = true;
      window.clearTimeout(watchdogId);
      video.muted = true;
      video.playsInline = true;
      try {
        video.currentTime = 0;
      } catch {
        // Seek can throw before the element has metadata.
      }
      markReady();
      traceRef.current('play', video);
      let pending: Promise<void> | undefined;
      try {
        pending = video.play();
      } catch {
        failStartup('play-throw');
        return;
      }
      if (pending && typeof pending.then === 'function') {
        pending.then(
          () => undefined,
          () => {
            failStartup('play-reject');
          }
        );
      }
    };

    const armWatchdog = () => {
      watchdogId = window.setTimeout(() => failStartup('watchdog'), BANNER_VIDEO_STARTUP_WATCHDOG_MS);
    };

    if (video.readyState >= HAVE_CURRENT_DATA) {
      beginPlayback();
    } else {
      // A previous preload is not proof the frame is still buffered. Safari drops
      // inactive video data and leaves readyState at 0/1 with no MediaError.
      // A brand-new active element (network empty, never preloaded) keeps the
      // browser's own src load. A preloaded element that is still not ready is reloaded.
      const preloadDiscarded =
        video.networkState !== NETWORK_LOADING &&
        (sawPreloadRef.current ||
          video.networkState === NETWORK_IDLE ||
          video.networkState === NETWORK_NO_SOURCE);
      if (preloadDiscarded) {
        traceRef.current('load', video);
        try {
          video.load();
        } catch {
          // load() can throw if the element was detached mid-transition.
        }
      }
      armWatchdog();
      video.addEventListener('loadeddata', beginPlayback);
      video.addEventListener('canplay', beginPlayback);
    }

    const onMediaError = () => failStartup('media-error');
    video.addEventListener('error', onMediaError);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdogId);
      video.removeEventListener('loadeddata', beginPlayback);
      video.removeEventListener('canplay', beginPlayback);
      video.removeEventListener('error', onMediaError);
    };
  }, [isActive, mountVideo, videoUrl]);

  useEffect(() => {
    if (!isActive || !videoFailed || !preferVideo) return;
    onVideoReadyRef.current?.();
  }, [isActive, videoFailed, preferVideo]);

  const revealBufferedFrame = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    traceRef.current(event.type, video);
    if (video.readyState >= HAVE_CURRENT_DATA) {
      setVideoRevealed(true);
    }
  };

  return (
    <>
      {showImage ? (
        <img
          src={imageUrl}
          srcSet={srcSet}
          sizes={sizes}
          alt=""
          aria-hidden="true"
          fetchpriority={fetchpriority}
          decoding={decoding}
          loading={loading}
          draggable={draggable}
          className={className}
        />
      ) : null}
      {mountVideo ? (
        <video
          ref={attachVideo}
          className={className}
          style={{
            opacity: videoRevealed ? 1 : 0,
            transition: 'opacity 160ms linear',
          }}
          aria-hidden="true"
          data-video-role={videoRole}
          autoPlay={isActive}
          muted
          loop
          playsInline
          controls={false}
          preload="auto"
          src={videoUrl}
          onLoadedMetadata={(event) => traceRef.current('loadedmetadata', event.currentTarget)}
          onLoadedData={revealBufferedFrame}
          onCanPlay={revealBufferedFrame}
          onError={(event) => {
            const video = event.currentTarget;
            traceRef.current('error', video, {
              failureClass: video.error ? 'VIDEO_FILE_FAILURE' : 'RESOURCE_LIFECYCLE_FAILURE',
              mediaErrorCode: video.error?.code ?? null,
            });
            setVideoFailed(true);
          }}
          tabIndex={-1}
        />
      ) : null}
    </>
  );
};
