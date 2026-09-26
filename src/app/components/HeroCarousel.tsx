import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useLanguage, type Language } from '../../app/providers/LanguageContext';
import type { Theme } from '../../hooks/useTheme';
import { CustomHeroSlide } from '../../types';
import { FALLBACK_SLIDES } from '../../features/admin';
import {
  RESORT_SLIDE_RANDOM_IMAGE_KEY,
  RESORT_SLIDE_WALL_IMAGE_KEYS,
} from '@ski-academy/shared-domain';
import {
  heroBackgroundSrcSet,
  preloadHeroLcpImage,
  resolveHeroBackgroundUrl,
  resolveHeroOriginUrl,
} from '../../lib/mediaAssets';
import { normalizeBannerMediaMode } from '../../lib/bannerMedia';
import { BannerMedia, type BannerVideoRole } from '../../ui/BannerMedia';
import { logger } from '../../shared';
import {
  CONVERSION_GATE_COPY,
  ConversionGateHeroCopy,
  ConversionGateWhatsAppCta,
} from '../../features/landing';

interface HeroCarouselProps {
  data: {
    slides?: CustomHeroSlide[];
    /** When false, skip FALLBACK_SLIDES so the default hero does not flash before Firestore. */
    configReady?: boolean;
    language: Language;
    theme: Theme;
    slideIntervalSeconds?: number;
    slidesRandomOrder?: boolean;
    /** Авторизованный пользователь — другой текст CTA */
    isAuthenticated?: boolean;
    /** Formatted starting-price line. Falls back to the Growth placeholder. */
    startingPriceLine?: string;
  };
  actions: {
    onScrollToSection: (id: string) => void;
  };
}

const shuffleSlides = (items: CustomHeroSlide[]): CustomHeroSlide[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const HERO_CROSSFADE_MS = 1400;

const HERO_SCRIM = { light: '255, 255, 255', dark: '10, 10, 10' };

const resolveSlideBackgroundKey = (
  activeSlide: CustomHeroSlide | undefined,
  slideIndex: number
): string => {
  let bg = activeSlide?.backgroundImage || 'wall';
  if (bg === RESORT_SLIDE_RANDOM_IMAGE_KEY) {
    const slideId = activeSlide?.id || String(slideIndex);
    const hash = Array.from(slideId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    bg = RESORT_SLIDE_WALL_IMAGE_KEYS[hash % RESORT_SLIDE_WALL_IMAGE_KEYS.length];
  }
  return bg;
};

const buildScrimGradient = (theme: Theme, isMobile = false): string => {
  const scrim = HERO_SCRIM;
  if (theme === 'light') {
    return isMobile
      ? `linear-gradient(90deg, rgba(${scrim.light},0.95) 0%, rgba(${scrim.light},0.8) 35%, rgba(${scrim.light},0.2) 100%)`
      : `linear-gradient(90deg, rgba(${scrim.light},0.95) 0%, rgba(${scrim.light},0.8) 35%, rgba(${scrim.light},0) 100%)`;
  }
  return isMobile
    ? `linear-gradient(90deg, rgba(${scrim.dark},0.88) 0%, rgba(${scrim.dark},0.71) 25%, rgba(${scrim.dark},0.54) 50%, rgba(${scrim.dark},0.37) 75%, rgba(${scrim.dark},0.2) 100%)`
    : `linear-gradient(90deg, rgba(${scrim.dark},0.88) 0%, rgba(${scrim.dark},0.62) 28%, rgba(${scrim.dark},0.32) 52%, rgba(${scrim.dark},0.1) 72%, rgba(${scrim.dark},0) 100%)`;
};

const padSlideIndex = (n: number) => String(n).padStart(2, '0');

const slideUsesVideo = (
  slide: CustomHeroSlide | undefined,
  reduceMotion: boolean | null
): boolean =>
  normalizeBannerMediaMode(slide?.backgroundMediaMode) === 'video' && reduceMotion !== true;

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  data: {
    slides: rawSlides,
    configReady = true,
    language,
    theme,
    slideIntervalSeconds = 6,
    slidesRandomOrder = false,
    startingPriceLine = CONVERSION_GATE_COPY.startingPriceFallback,
  },
  actions: { onScrollToSection },
}) => {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [carousel, setCarousel] = useState<{ current: number; outgoing: number | null }>({
    current: 0,
    outgoing: null,
  });
  const currentSlide = carousel.current;
  const outgoingSlide = carousel.outgoing;
  const [readySlideIndex, setReadySlideIndex] = useState<number | null>(null);

  const setCurrentSlide = (update: number | ((prev: number) => number)) => {
    setCarousel((prev) => {
      const next = typeof update === 'function' ? update(prev.current) : update;
      if (next === prev.current) return prev;
      return { current: next, outgoing: prev.current };
    });
  };
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false
  );

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const slides = useMemo(() => {
    if (!configReady) return [];
    const source = rawSlides && rawSlides.length > 0 ? rawSlides : FALLBACK_SLIDES;
    const visible = source.filter((s) => !s.hidden);
    const base = visible.length > 0 ? visible : FALLBACK_SLIDES;
    if (slidesRandomOrder && base.length > 1) {
      return shuffleSlides(base);
    }
    return base;
  }, [rawSlides, slidesRandomOrder, configReady]);

  const slideInterval = slideIntervalSeconds || 6;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    const minSwipeDistance = 40;

    if (Math.abs(deltaX) > minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX < 0) {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      } else {
        setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
      }
    }

    setTouchStartX(null);
    setTouchStartY(null);
  };

  useEffect(() => {
    if (slides.length > 0 && currentSlide >= slides.length) {
      setCurrentSlide(0);
    }
  }, [slides.length, currentSlide]);

  useEffect(() => {
    if (outgoingSlide === null) return;
    const id = window.setTimeout(() => {
      setCarousel((prev) => (prev.outgoing === null ? prev : { ...prev, outgoing: null }));
    }, HERO_CROSSFADE_MS);
    return () => window.clearTimeout(id);
  }, [outgoingSlide, currentSlide]);

  const activeSlide = slides[currentSlide];
  const activeNeedsVideo = slideUsesVideo(activeSlide, shouldReduceMotion);
  const carouselHasVideo = slides.some((slide) => slideUsesVideo(slide, shouldReduceMotion));

  // Image-only carousels keep a continuous interval that does not reset on manual navigation.
  useEffect(() => {
    if (slides.length <= 1) return;
    if (carouselHasVideo) return;

    const interval = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, slideInterval * 1000);

    return () => window.clearInterval(interval);
  }, [slides.length, slideInterval, carouselHasVideo]);

  // Video slides start their duration only after the MP4 can play.
  useEffect(() => {
    if (slides.length <= 1) return;
    if (!carouselHasVideo) return;
    if (activeNeedsVideo && readySlideIndex !== currentSlide) return;

    const id = window.setTimeout(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, slideInterval * 1000);

    return () => window.clearTimeout(id);
  }, [
    slides.length,
    slideInterval,
    carouselHasVideo,
    activeNeedsVideo,
    readySlideIndex,
    currentSlide,
  ]);

  const crossfadeStyle = {
    transitionDuration: `${HERO_CROSSFADE_MS}ms`,
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  } as const;

  // Preload the first slide image only when that slide is not a healthy video.
  useLayoutEffect(() => {
    if (slides.length === 0) return;
    if (slideUsesVideo(slides[0], shouldReduceMotion)) {
      return preloadHeroLcpImage('');
    }
    const lcpKey = resolveSlideBackgroundKey(slides[0], 0);
    const lcpUrl = resolveHeroBackgroundUrl(lcpKey);
    return preloadHeroLcpImage(lcpUrl, heroBackgroundSrcSet(lcpKey));
  }, [slides, shouldReduceMotion]);

  // Warm the next image slide. Video successors are buffered by BannerMedia instead.
  useEffect(() => {
    if (slides.length <= 1) return;
    const nextIdx = (currentSlide + 1) % slides.length;
    const nextSlide = slides[nextIdx];
    if (slideUsesVideo(nextSlide, shouldReduceMotion)) return;
    const nextUrl = resolveHeroBackgroundUrl(resolveSlideBackgroundKey(nextSlide, nextIdx));
    const img = new Image();
    img.src = nextUrl;
  }, [slides, currentSlide, shouldReduceMotion]);

  const scrim = buildScrimGradient(theme, isMobile);
  const outgoingVideoRetained =
    outgoingSlide !== null && slideUsesVideo(slides[outgoingSlide], shouldReduceMotion);
  const nextVideoIndex = slides.length > 1 ? (currentSlide + 1) % slides.length : -1;
  const videoRoles = new Map<number, BannerVideoRole>();
  if (slideUsesVideo(slides[currentSlide], shouldReduceMotion)) {
    videoRoles.set(currentSlide, 'ACTIVE');
  }
  if (
    outgoingVideoRetained &&
    outgoingSlide !== null &&
    outgoingSlide !== currentSlide &&
    !videoRoles.has(outgoingSlide)
  ) {
    videoRoles.set(outgoingSlide, 'OUTGOING');
  }
  if (
    !outgoingVideoRetained &&
    nextVideoIndex >= 0 &&
    nextVideoIndex !== currentSlide &&
    slideUsesVideo(slides[nextVideoIndex], shouldReduceMotion) &&
    !videoRoles.has(nextVideoIndex)
  ) {
    videoRoles.set(nextVideoIndex, 'NEXT_PRELOAD');
  }

  const videoRoleKey = [...videoRoles.entries()]
    .map(([index, role]) => `${index}:${slides[index]?.id ?? ''}:${role}`)
    .join('|');

  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.MODE === 'test') return;
    logger.debug('[hero-video] mounted-count', {
      count: videoRoleKey ? videoRoleKey.split('|').length : 0,
      current: currentSlide,
      outgoing: outgoingSlide,
      roles: videoRoleKey,
    });
  }, [videoRoleKey, currentSlide, outgoingSlide]);

  return (
    <section
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="ui-hero hero-layout relative w-full min-h-[calc(100svh-4.25rem)] overflow-hidden touch-pan-y"
    >
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {slides.length === 0 ? (
          <div className="absolute inset-0 bg-[var(--bg)]">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: scrim }}
            />
          </div>
        ) : (
          slides.map((slide, idx) => {
            const isActive = idx === currentSlide;
            const videoRole = videoRoles.get(idx);
            const bgKey = resolveSlideBackgroundKey(slide, idx);
            const bgUrl = resolveHeroBackgroundUrl(bgKey);
            const bgOriginUrl = resolveHeroOriginUrl(bgKey);
            const srcSet = heroBackgroundSrcSet(bgKey);
            return (
              <div
                key={slide.id || `hero-bg-${idx}`}
                className={`absolute inset-0 will-change-[opacity] transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
                style={{
                  ...crossfadeStyle,
                  zIndex: isActive ? 2 : 1,
                }}
              >
                <BannerMedia
                  imageUrl={bgUrl}
                  videoSourceImageUrl={bgOriginUrl}
                  mediaMode={slide.backgroundMediaMode}
                  isActive={isActive}
                  shouldLoadVideo={videoRole === 'ACTIVE'}
                  shouldPreloadVideo={videoRole === 'NEXT_PRELOAD' || videoRole === 'OUTGOING'}
                  videoRole={videoRole}
                  slideIndex={idx}
                  slideId={slide.id}
                  mountedVideoCount={videoRoles.size}
                  onVideoReady={videoRole === 'ACTIVE' ? () => setReadySlideIndex(idx) : undefined}
                  className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
                  srcSet={srcSet}
                  sizes="100vw"
                  fetchpriority={idx === 0 ? 'high' : 'low'}
                  decoding={isActive ? 'sync' : 'async'}
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundImage: scrim }}
                />
              </div>
            );
          })
        )}
      </div>

      {slides.length > 0 && (
        <div className="hero-stage relative z-10 w-full min-h-[calc(100svh-4.25rem)]">
          <div className="hero-copy-shell w-full">
            <div className="hero-copy-shell-inner w-full max-w-7xl mx-auto px-6 md:px-10 lg:px-12">
              <div className="hero-copy-stack w-full max-w-2xl">
                <ConversionGateHeroCopy priceLine={startingPriceLine} />
                <div className="grid relative w-full [&>*]:col-start-1 [&>*]:row-start-1 min-w-0">
                  {slides.map((slide, idx) => {
                    const isActive = idx === currentSlide;
                    return (
                      <div
                        key={slide.id || `hero-copy-${idx}`}
                        aria-hidden={!isActive}
                        className={`col-start-1 row-start-1 will-change-[opacity] transition-opacity ${
                          isActive
                            ? 'relative opacity-100 z-[2]'
                            : 'absolute inset-0 opacity-0 z-[1] pointer-events-none'
                        }`}
                        style={crossfadeStyle}
                      >
                        <div className="hero-copy space-y-3">
                          <motion.span
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                            animate={
                              isActive
                                ? { opacity: 1, y: 0 }
                                : { opacity: 0, y: shouldReduceMotion ? 0 : 10 }
                            }
                            transition={{
                              duration: shouldReduceMotion ? 0 : 0.65,
                              delay: isActive && !shouldReduceMotion ? 0.12 : 0,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="hero-copy-eyebrow text-xs font-mono font-medium uppercase tracking-[0.1em] block"
                          >
                            {language === 'en' ? slide.line1En : slide.line1Ru}
                          </motion.span>
                          <motion.h2
                            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                            animate={
                              isActive
                                ? { opacity: 1, y: 0 }
                                : { opacity: 0, y: shouldReduceMotion ? 0 : 16 }
                            }
                            transition={{
                              duration: shouldReduceMotion ? 0 : 0.75,
                              delay: isActive && !shouldReduceMotion ? 0.26 : 0,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="hero-copy-title text-4xl md:text-5xl lg:text-6xl font-serif font-light leading-tight tracking-tight"
                          >
                            {language === 'en' ? slide.line2En : slide.line2Ru}
                          </motion.h2>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hero-actions-shell">
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.75,
                      delay: shouldReduceMotion ? 0 : 0.42,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="hero-actions"
                  >
                    <button
                      type="button"
                      onClick={() => onScrollToSection('coaches-grid')}
                      className="hero-primary-cta btn-primary-hero px-7 py-3.5 inline-flex items-center justify-center gap-2 group"
                    >
                      <span>{t('startYourJourney')}</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onScrollToSection('courses-grid')}
                      className="hero-secondary-cta inline-flex items-center gap-1.5 text-sm font-medium text-[var(--hero-ink)]/80 hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer group"
                    >
                      <span>{t('chooseCourse')}</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <ConversionGateWhatsAppCta
                      placement="hero"
                      className="hero-secondary-cta inline-flex items-center text-sm font-medium text-[var(--hero-ink)]/80 max-w-full break-words"
                    />
                  </motion.div>
                </div>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <div className="hero-pagination-shell md:hidden">
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
                className="hero-pagination font-mono text-xs font-medium tracking-[0.2em] text-[var(--hero-ink)]/70 flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer hover:text-[var(--hero-ink)] transition-colors"
                aria-label={`${t('goToSlide')} ${currentSlide + 1} / ${slides.length}`}
              >
                <span aria-hidden="true">{padSlideIndex(currentSlide + 1)}</span>
                <span className="w-8 h-px bg-[var(--hero-ink)]/20" aria-hidden="true" />
                <span className="text-[var(--hero-ink)]/40" aria-hidden="true">
                  {padSlideIndex(slides.length)}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
