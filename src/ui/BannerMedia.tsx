import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  DEFAULT_BANNER_FOCAL_POINT_PERCENT,
  deriveBannerVideoUrl,
  isBannerVideoUrl,
  normalizeBannerMediaMode,
  resolveBannerFocalPoint,
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
  /** Keep an admitted resource paused in the DOM within the carousel's video budget. */
  retainVideo?: boolean;
  /** Startup completed; false means terminal failure without a usable image fallback. */
  onVideoReady?: (hasVisibleMedia: boolean, failureKind?: BannerVideoFailureKind) => void;
  /** Invalidates the caller's readiness when playback restarts, including source/mode changes. */
  onVideoActivationStart?: () => void;
  /** Development trace: which carousel slot this element occupies. */
  videoRole?: BannerVideoRole;
  slideIndex?: number;
  slideId?: string;
  /** Development trace: how many hero videos are mounted with this one. */
  mountedVideoCount?: number;
  /**
   * This slide's mobile horizontal focal point (0–100).
   * Applied to every visible media element for this slide. Omit outside the hero.
   */
  mobileFocalPointX?: unknown;
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
export type BannerVideoFailureKind = 'resource' | 'activation';

const DEFAULT_MEDIA_CLASS =
  'absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none';

type HeroFocalStyle = React.CSSProperties & {
  '--hero-mobile-position-x': string;
  '--hero-mobile-position-y': string;
};

/** Desktop object-position stays in CSS. These variables are read only inside the mobile media query. */
function heroMobileFocalStyle(focalPointX: unknown): HeroFocalStyle {
  return {
    '--hero-mobile-position-x': `${resolveBannerFocalPoint(focalPointX)}%`,
    '--hero-mobile-position-y': `${DEFAULT_BANNER_FOCAL_POINT_PERCENT}%`,
  };
}

/** HAVE_CURRENT_DATA — enough to show a frame without waiting for canplaythrough. */
const HAVE_CURRENT_DATA = 2;
const NETWORK_NO_SOURCE = 3;

/**
 * Cold-start ceiling for one video slide. A discarded preload or a decoder that
 * never produces a frame must fall back instead of holding the carousel.
 * Longer than a single hero interval check in tests (5s) so a slow-but-healthy
 * file can still reach loadeddata before the image fallback.
 */
export const BANNER_VIDEO_STARTUP_WATCHDOG_MS = 8000;
export const BANNER_VIDEO_FRAME_FALLBACK_MS = 250;

const HERO_VIDEO_DEBUG = import.meta.env.DEV && import.meta.env.MODE !== 'test';
const videoElementIds = new WeakMap<HTMLVideoElement, number>();
let nextVideoElementId = 1;

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
  retainVideo = false,
  onVideoReady,
  onVideoActivationStart,
  videoRole,
  slideIndex,
  slideId,
  mountedVideoCount,
  mobileFocalPointX,
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
  const failureKindRef = useRef<BannerVideoFailureKind | null>(null);
  const [videoRevealed, setVideoRevealed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activationSequence = useRef(0);
  const [retainedVideoUrl, setRetainedVideoUrl] = useState<string | null>(null);
  const onVideoReadyRef = useRef(onVideoReady);
  onVideoReadyRef.current = onVideoReady;
  const onVideoActivationStartRef = useRef(onVideoActivationStart);
  onVideoActivationStartRef.current = onVideoActivationStart;

  const shouldLoadVideo = shouldLoadVideoProp ?? loadVideo;
  const isActive = isActiveProp ?? shouldLoadVideo;

  const derivationBase = videoSourceImageUrl || imageUrl;
  const videoUrl = deriveBannerVideoUrl(derivationBase);
  const preferVideo = mode === 'video' && !shouldReduceMotion && Boolean(videoUrl);
  const requestedVideo = shouldLoadVideo || shouldPreloadVideo;
  const mountVideo = preferVideo && !videoFailed &&
    (requestedVideo || (retainVideo && retainedVideoUrl === videoUrl));
  if (HERO_VIDEO_DEBUG && videoUrl.includes('girl.mp4')) {
    logger.debug('[girl-video]', 'render-state', { timestamp: new Date().toISOString(),
      videoFailed, preferVideo, requestedVideo, retainVideo, retainedVideoUrl, videoUrl,
      mountVideo, shouldLoadVideo, shouldPreloadVideo, isActive, failureKind: failureKindRef.current });
  }
  const fallbackImageUrl = !isBannerVideoUrl(imageUrl) ? imageUrl
    : videoSourceImageUrl && !isBannerVideoUrl(videoSourceImageUrl) ? videoSourceImageUrl : undefined;
  const showImage = (!preferVideo || videoFailed) && Boolean(fallbackImageUrl);
  useEffect(() => {
    if (retainVideo && mountVideo) setRetainedVideoUrl(videoUrl);
    else if (!retainVideo || !preferVideo) setRetainedVideoUrl(null);
  }, [retainVideo, mountVideo, preferVideo, videoUrl]);
  const traceRef = useRef<
    (event: string, video?: HTMLVideoElement | null, extra?: Record<string, unknown>) => void
  >(() => {});
  traceRef.current = (event, video, extra) => {
    if (!HERO_VIDEO_DEBUG) return;
    const hero = video?.closest<HTMLElement>('.ui-hero');
    logger.debug('[hero-video]', event, {
      timestamp: new Date().toISOString(),
      slideIndex,
      slideId,
      videoUrl,
      elementId: video ? videoElementIds.get(video) : undefined,
      activationId: activationSequence.current,
      role: videoRole ?? (isActive ? 'ACTIVE' : shouldPreloadVideo ? 'PRELOAD' : 'IDLE'),
      mountedVideoCount,
      readyState: video?.readyState,
      networkState: video?.networkState,
      currentTime: video?.currentTime,
      paused: video?.paused,
      seeking: video?.seeking,
      error: video?.error?.code ?? null,
      videoRevealed,
      currentSlide: hero?.dataset.desiredSlide,
      outgoingSlide: hero?.dataset.outgoingSlide,
      presentedSlide: hero?.dataset.presentedSlide,
      layerOpacity: video?.parentElement ? getComputedStyle(video.parentElement).opacity : undefined,
      src: video?.getAttribute('src'),
      currentSrc: video?.currentSrc,
      ...extra,
    });
  };

  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      if (!videoElementIds.has(node)) videoElementIds.set(node, nextVideoElementId++);
      if (HERO_VIDEO_DEBUG) node.dataset.heroElementId = String(videoElementIds.get(node));
      videoRef.current = node;
      traceRef.current('mount', node);
      traceRef.current('video-mount', node);
      return;
    }
    const previous = videoRef.current;
    if (!previous) return;
    videoRef.current = null;
    traceRef.current('unmount', previous);
    releaseVideoElement(previous);
  }, []);

  useLayoutEffect(() => {
    if (HERO_VIDEO_DEBUG && videoUrl.includes('girl.mp4')) {
      logger.debug('[girl-video]', 'failure-reset', { timestamp: new Date().toISOString(), reason: 'source-or-mode-change' });
    }
    failureKindRef.current = null;
    setVideoFailed(false);
    setVideoRevealed(false);
  }, [imageUrl, videoSourceImageUrl, mode, videoUrl]);

  useLayoutEffect(() => {
    if ((!isActive && (!shouldPreloadVideo || videoRole === 'OUTGOING')) ||
      failureKindRef.current === 'resource') return;
    if (failureKindRef.current !== null) {
      traceRef.current('failure-reset', videoRef.current, { reason: 'new-admission' });
      if (HERO_VIDEO_DEBUG && videoUrl.includes('girl.mp4')) {
        logger.debug('[girl-video]', 'failure-reset', { timestamp: new Date().toISOString(), reason: 'new-admission' });
      }
    }
    // Reset only on an admission edge, never as a reaction to this activation failing.
    failureKindRef.current = null;
    setVideoFailed(false);
  }, [isActive, shouldPreloadVideo, videoRole, videoUrl]);

  const markVideoFailed = useCallback((reason: string, video: HTMLVideoElement) => {
    const code = video.error?.code;
    failureKindRef.current = code === 3 || code === 4 ? 'resource' : 'activation';
    traceRef.current('video-failure', video, { reason, failureKind: failureKindRef.current });
    if (HERO_VIDEO_DEBUG && video.getAttribute('src')?.includes('girl.mp4')) {
      logger.debug('[girl-video]', 'video-failed', { timestamp: new Date().toISOString(), reason,
        activationId: activationSequence.current, currentTime: video.currentTime, readyState: video.readyState,
        networkState: video.networkState, error: code ?? null, failureKind: failureKindRef.current });
    }
    setVideoFailed(true);
  }, []);

  useLayoutEffect(() => {
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
    const activationId = ++activationSequence.current;
    let ready = false;
    const trace = (event: string, extra?: Record<string, unknown>) =>
      traceRef.current(event, video, { activationId, videoRevealed: ready, ...extra });
    setVideoRevealed(false);
    onVideoActivationStartRef.current?.();
    trace('activation-start', { videoRevealed: false });

    let cancelled = false;
    let failed = false;
    let restarted = false;
    let seekConfirmed = false;
    let playingObserved = false;
    let frameCallbackId: number | undefined;
    let frameRequestSequence = 0;
    let watchdogId = 0;
    let fallbackId: number | undefined;
    const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function';
    const isCurrent = () => !cancelled && !failed && activationSequence.current === activationId;

    const cancelFrame = () => {
      frameRequestSequence++;
      if (frameCallbackId !== undefined) video.cancelVideoFrameCallback?.(frameCallbackId);
      frameCallbackId = undefined;
    };

    const markReady = () => {
      if (!isCurrent() || ready) return;
      ready = true;
      window.clearTimeout(watchdogId);
      window.clearTimeout(fallbackId);
      cancelFrame();
      trace('frame-ready');
      setVideoRevealed(true);
      trace('activation-ready', { videoRevealed: true });
      onVideoReadyRef.current?.(true);
    };

    const failStartup = (reason: 'watchdog' | 'play-reject' | 'play-throw' | 'media-error') => {
      if (!isCurrent()) return;
      failed = true;
      window.clearTimeout(watchdogId);
      window.clearTimeout(fallbackId);
      cancelFrame();
      const mediaError = video.error;
      trace(reason === 'watchdog' ? 'watchdog' : 'startup-failure', {
        reason,
        failureClass: mediaError ? 'VIDEO_FILE_FAILURE' : 'RESOURCE_LIFECYCLE_FAILURE',
        mediaErrorCode: mediaError?.code ?? null,
      });
      trace('fallback-enter', { imageUrl: fallbackImageUrl ?? null });
      markVideoFailed(reason, video);
    };

    const restart = () => {
      if (!isCurrent() || restarted) return;
      try {
        // At HAVE_NOTHING this sets the default start position; no seeked is required.
        seekConfirmed = video.currentTime === 0 || video.readyState === 0;
        trace('seek-request', { target: 0 });
        video.currentTime = 0;
        restarted = true;
      } catch {
        // Retry on metadata/data events if the browser cannot seek yet.
      }
    };

    const frameEligible = () => restarted && seekConfirmed && !video.seeking &&
      video.readyState >= HAVE_CURRENT_DATA;
    const confirmFallback = () => {
      // A fresh playing event is required: cached readyState alone is never readiness.
      if (!isCurrent() || ready || !playingObserved || !frameEligible()) return;
      if (!hasFrameCallback) { trace('fallback-ready'); markReady(); }
      else if (fallbackId === undefined) {
        // Retained hidden layers must not depend indefinitely on compositor callbacks.
        fallbackId = window.setTimeout(() => {
          fallbackId = undefined;
          if (!isCurrent() || ready || video.paused || !frameEligible()) return;
          trace('frame-fallback');
          trace('fallback-ready');
          markReady();
        }, BANNER_VIDEO_FRAME_FALLBACK_MS);
      }
    };
    const requestFrame = () => {
      if (!hasFrameCallback || !isCurrent() || ready || frameCallbackId !== undefined) return;
      const requestSequence = ++frameRequestSequence;
      trace('frame-request');
      frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
        if (!isCurrent() || requestSequence !== frameRequestSequence) return;
        frameCallbackId = undefined;
        trace('video-frame', { mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames });
        if (frameEligible()) markReady();
        else requestFrame();
      });
    };
    const onData = () => {
      restart();
      confirmFallback();
    };
    const onSeeking = () => {
      if (!isCurrent()) return;
      seekConfirmed = false;
      window.clearTimeout(fallbackId);
      fallbackId = undefined;
      trace('seeking');
    };
    const onSeeked = () => {
      if (!isCurrent() || !restarted || video.seeking) return;
      seekConfirmed = true;
      trace('seeked');
      // Discard a callback registered before seek completion, even if already queued.
      cancelFrame();
      requestFrame();
      confirmFallback();
    };
    const onPlaying = () => {
      if (!isCurrent()) return;
      playingObserved = true;
      trace('playing');
      onData();
    };
    const onMediaError = () => failStartup('media-error');

    video.addEventListener('loadedmetadata', onData);
    video.addEventListener('loadeddata', onData);
    video.addEventListener('canplay', onData);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onMediaError);
    watchdogId = window.setTimeout(() => failStartup('watchdog'), BANNER_VIDEO_STARTUP_WATCHDOG_MS);

    // Only an unusable source can reset loading. Paused/discarded buffers keep their resource.
    if (video.readyState < HAVE_CURRENT_DATA && video.networkState === NETWORK_NO_SOURCE) {
      trace('load');
      try {
        video.load();
      } catch {
        // load() on a detached node is best-effort.
      }
    }
    requestFrame();
    restart();
    trace('play-request');
    try {
      video.play()?.then(() => {
        if (!isCurrent()) return;
        trace('play-resolve');
        confirmFallback();
      }, (error: unknown) => {
        if (!isCurrent()) return;
        trace('play-reject', { error: String(error) });
        failStartup('play-reject');
      });
    } catch (error) {
      trace('play-reject', { error: String(error) });
      failStartup('play-throw');
    }

    return () => {
      cancelled = true;
      trace('activation-cancel');
      window.clearTimeout(watchdogId);
      window.clearTimeout(fallbackId);
      cancelFrame();
      video.removeEventListener('loadedmetadata', onData);
      video.removeEventListener('loadeddata', onData);
      video.removeEventListener('canplay', onData);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onMediaError);
    };
  }, [isActive, mountVideo, videoUrl, fallbackImageUrl, markVideoFailed]);

  useEffect(() => {
    if (!isActive || !videoFailed || !preferVideo || failureKindRef.current === null) return;
    onVideoReadyRef.current?.(Boolean(fallbackImageUrl), failureKindRef.current);
  }, [isActive, videoFailed, preferVideo, fallbackImageUrl]);

  const focalStyle =
    mobileFocalPointX === undefined ? undefined : heroMobileFocalStyle(mobileFocalPointX);

  return (
    <>
      {showImage ? (
        <img
          src={fallbackImageUrl}
          srcSet={fallbackImageUrl === imageUrl ? srcSet : undefined}
          sizes={sizes}
          alt=""
          aria-hidden="true"
          fetchpriority={fetchpriority}
          decoding={decoding}
          loading={loading}
          draggable={draggable}
          className={className}
          style={focalStyle}
        />
      ) : null}
      {mountVideo ? (
        <video
          ref={attachVideo}
          className={className}
          style={{
            ...focalStyle,
            opacity: videoRevealed ? 1 : 0,
            transition: 'opacity 160ms linear',
          }}
          aria-hidden="true"
          data-video-role={videoRole}
          autoPlay={isActive}
          muted
          playsInline
          controls={false}
          preload="auto"
          src={videoUrl}
          onLoadedMetadata={(event) => traceRef.current('loadedmetadata', event.currentTarget)}
          onLoadedData={(event) => traceRef.current('loadeddata', event.currentTarget)}
          onCanPlay={(event) => traceRef.current('canplay', event.currentTarget)}
          onEnded={(event) => traceRef.current('ended', event.currentTarget, {
            duration: event.currentTarget.duration,
          })}
          onError={(event) => {
            const video = event.currentTarget;
            traceRef.current('error', video, {
              failureClass: video.error ? 'VIDEO_FILE_FAILURE' : 'RESOURCE_LIFECYCLE_FAILURE',
              mediaErrorCode: video.error?.code ?? null,
            });
            if (!isActive) traceRef.current('fallback-enter', video, { imageUrl: fallbackImageUrl ?? null });
            if (!isActive) markVideoFailed('media-error', video);
          }}
          tabIndex={-1}
        />
      ) : null}
    </>
  );
};
