import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useLanguage, type Language } from '../../app/providers/LanguageContext';
import type { Theme } from '../../hooks/useTheme';
import { CustomHeroSlide } from '../../types';
import { FALLBACK_SLIDES } from '../../features/admin';
import {
  heroBackgroundSrcSet,
  preloadHeroLcpImage,
  resolveHeroBackgroundUrl,
} from '../../lib/mediaAssets';

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

const HERO_CROSSFADE_MS = 1400;

const HERO_SCRIM = { light: '255, 255, 255', dark: '10, 10, 10' };

const resolveSlideBackgroundKey = (
  activeSlide: CustomHeroSlide | undefined,
  slideIndex: number
): string => {
  let bg = activeSlide?.backgroundImage || 'wall';
  if (bg === 'random') {
    const walls = ['wall', 'wall2', 'wall3', 'wall4', 'wall5', 'wall6', 'wall7'];
    const slideId = activeSlide?.id || String(slideIndex);
    const hash = Array.from(slideId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    bg = walls[hash % walls.length];
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

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  data: {
    slides: rawSlides,
    configReady = true,
    language,
    theme,
    slideIntervalSeconds = 6,
    slidesRandomOrder = false,
  },
  actions: { onScrollToSection },
}) => {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [currentSlide, setCurrentSlide] = useState(0);
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
    if (currentSlide >= slides.length) {
      setCurrentSlide(0);
    }
  }, [slides.length, currentSlide]);

  useEffect(() => {
    if (slides.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, slideInterval * 1000);

    return () => clearInterval(interval);
  }, [slides.length, slideInterval]);

  const crossfadeStyle = {
    transitionDuration: `${HERO_CROSSFADE_MS}ms`,
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  } as const;

  // Preload the actual first slide (may not be wall when order is random / custom).
  useLayoutEffect(() => {
    if (slides.length === 0) return;
    const lcpKey = resolveSlideBackgroundKey(slides[0], 0);
    const lcpUrl = resolveHeroBackgroundUrl(lcpKey);
    return preloadHeroLcpImage(lcpUrl, heroBackgroundSrcSet(lcpKey));
  }, [slides]);

  // Warm only the next slide — avoid competing with LCP for every background.
  useEffect(() => {
    if (slides.length <= 1) return;
    const nextIdx = (currentSlide + 1) % slides.length;
    const nextUrl = resolveHeroBackgroundUrl(resolveSlideBackgroundKey(slides[nextIdx], nextIdx));
    const img = new Image();
    img.src = nextUrl;
  }, [slides, currentSlide]);

  const scrim = buildScrimGradient(theme, isMobile);

  return (
    <section
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="ui-hero relative w-full min-h-[calc(100svh-4.25rem)] overflow-hidden flex flex-col justify-end touch-pan-y"
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
            const bgKey = resolveSlideBackgroundKey(slide, idx);
            const bgUrl = resolveHeroBackgroundUrl(bgKey);
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
                <img
                  src={bgUrl}
                  srcSet={srcSet}
                  sizes="100vw"
                  alt=""
                  fetchPriority={idx === 0 ? 'high' : 'low'}
                  decoding={isActive ? 'sync' : 'async'}
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
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
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-10 lg:px-12 pb-16 md:pb-16 pt-16 md:pt-20 flex flex-col justify-end flex-1">
          <div className="flex flex-col gap-3 lg:gap-4 w-full max-w-2xl pb-8 md:pb-0">
            <div className="grid [&>*]:col-start-1 [&>*]:row-start-1 min-w-0">
              {slides.map((slide, idx) => {
                const isActive = idx === currentSlide;
                return (
                  <div
                    key={slide.id || `hero-copy-${idx}`}
                    aria-hidden={!isActive}
                    className={`col-start-1 row-start-1 space-y-3 will-change-[opacity] transition-opacity ${
                      isActive ? 'opacity-100 z-[2]' : 'opacity-0 z-[1] pointer-events-none'
                    }`}
                    style={crossfadeStyle}
                  >
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
                    <motion.p
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                      animate={
                        isActive
                          ? { opacity: 1, y: 0 }
                          : { opacity: 0, y: shouldReduceMotion ? 0 : 12 }
                      }
                      transition={{
                        duration: shouldReduceMotion ? 0 : 0.7,
                        delay: isActive && !shouldReduceMotion ? 0.42 : 0,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="hero-copy-body text-sm tracking-wide leading-relaxed max-w-lg"
                    >
                      {language === 'en' ? slide.line3En : slide.line3Ru}
                    </motion.p>
                  </div>
                );
              })}
            </div>

            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: shouldReduceMotion ? 0 : 0.75,
                delay: shouldReduceMotion ? 0 : 0.58,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex flex-col items-start gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6"
            >
              <button
                onClick={() => onScrollToSection('coaches-grid')}
                className="btn-primary-hero px-7 py-3.5 inline-flex items-center justify-center gap-2 group"
              >
                <span>{t('startYourJourney')}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={() => onScrollToSection('courses-grid')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--hero-ink)]/80 hover:text-[var(--accent)] transition-colors bg-transparent border-0 p-0 cursor-pointer group pl-7 sm:pl-0"
              >
                <span>{t('chooseCourse')}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              {slides.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
                  className="hidden md:flex ml-2 md:ml-4 font-mono text-xs font-medium tracking-[0.2em] text-[var(--hero-ink)]/70 items-center gap-2 bg-transparent border-0 p-0 cursor-pointer hover:text-[var(--hero-ink)] transition-colors"
                  aria-label={`${t('goToSlide')} ${currentSlide + 1} / ${slides.length}`}
                >
                  <span aria-hidden="true">{padSlideIndex(currentSlide + 1)}</span>
                  <span
                    className="w-8 h-px bg-[var(--hero-ink)]/20"
                    aria-hidden="true"
                  />
                  <span className="text-[var(--hero-ink)]/40" aria-hidden="true">
                    {padSlideIndex(slides.length)}
                  </span>
                </button>
              )}
            </motion.div>
          </div>

          {slides.length > 1 && (
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev + 1) % slides.length)}
              className="md:hidden absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-xs font-medium tracking-[0.2em] text-[var(--hero-ink)]/70 flex items-center gap-2 bg-transparent border-0 p-0 cursor-pointer hover:text-[var(--hero-ink)] transition-colors"
              aria-label={`${t('goToSlide')} ${currentSlide + 1} / ${slides.length}`}
            >
              <span aria-hidden="true">{padSlideIndex(currentSlide + 1)}</span>
              <span className="w-8 h-px bg-[var(--hero-ink)]/20" aria-hidden="true" />
              <span className="text-[var(--hero-ink)]/40" aria-hidden="true">
                {padSlideIndex(slides.length)}
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
};
