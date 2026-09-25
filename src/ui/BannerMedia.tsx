import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import {
  deriveBannerVideoUrl,
  normalizeBannerMediaMode,
  type BannerMediaMode,
} from '../lib/bannerMedia';

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
  /** Applied to the image or video element (background fill). */
  className?: string;
  srcSet?: string;
  sizes?: string;
  fetchpriority?: 'high' | 'low' | 'auto';
  decoding?: 'sync' | 'async' | 'auto';
  loading?: 'eager' | 'lazy';
  draggable?: boolean;
}

const DEFAULT_MEDIA_CLASS =
  'absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none';

/** HAVE_CURRENT_DATA — enough to show a frame without waiting for canplaythrough. */
const HAVE_CURRENT_DATA = 2;

export const BannerMedia: React.FC<BannerMediaProps> = ({
  imageUrl,
  videoSourceImageUrl,
  mediaMode,
  loadVideo = true,
  isActive: isActiveProp,
  shouldLoadVideo: shouldLoadVideoProp,
  shouldPreloadVideo = false,
  onVideoReady,
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const onVideoReadyRef = useRef(onVideoReady);
  onVideoReadyRef.current = onVideoReady;

  const shouldLoadVideo = shouldLoadVideoProp ?? loadVideo;
  const isActive = isActiveProp ?? shouldLoadVideo;

  const derivationBase = videoSourceImageUrl || imageUrl;
  const videoUrl = deriveBannerVideoUrl(derivationBase);
  const preferVideo = mode === 'video' && !shouldReduceMotion && Boolean(videoUrl);
  const mountVideo = preferVideo && !videoFailed && (shouldLoadVideo || shouldPreloadVideo);
  const showImage = !preferVideo || videoFailed;

  useEffect(() => {
    setVideoFailed(false);
    setVideoRevealed(false);
  }, [imageUrl, videoSourceImageUrl, mode, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!mountVideo || !video) return;

    if (!isActive) {
      video.pause?.();
      return;
    }

    let started = false;
    const startPlayback = () => {
      if (started) return;
      started = true;
      video.muted = true;
      try {
        video.currentTime = 0;
      } catch {
        // Seek can throw before the element has metadata.
      }
      try {
        const pending = video.play?.();
        if (pending && typeof pending.catch === 'function') {
          pending.catch(() => {
            // Autoplay can reject without a gesture; the element stays muted.
          });
        }
      } catch {
        // Some environments throw instead of returning a promise.
      }
      setVideoRevealed(true);
      onVideoReadyRef.current?.();
    };

    if (video.readyState >= HAVE_CURRENT_DATA) {
      startPlayback();
      return;
    }

    video.addEventListener('loadeddata', startPlayback);
    video.addEventListener('canplay', startPlayback);
    return () => {
      video.removeEventListener('loadeddata', startPlayback);
      video.removeEventListener('canplay', startPlayback);
    };
  }, [isActive, mountVideo, videoUrl]);

  useEffect(() => {
    if (!isActive || !videoFailed || !preferVideo) return;
    onVideoReadyRef.current?.();
  }, [isActive, videoFailed, preferVideo]);

  const revealBufferedFrame = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (event.currentTarget.readyState >= HAVE_CURRENT_DATA) {
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
          ref={videoRef}
          className={className}
          style={{
            opacity: videoRevealed ? 1 : 0,
            transition: 'opacity 160ms linear',
          }}
          aria-hidden="true"
          autoPlay={isActive}
          muted
          loop
          playsInline
          controls={false}
          preload="auto"
          src={videoUrl}
          onLoadedData={revealBufferedFrame}
          onCanPlay={revealBufferedFrame}
          onError={() => setVideoFailed(true)}
          tabIndex={-1}
        />
      ) : null}
    </>
  );
};
