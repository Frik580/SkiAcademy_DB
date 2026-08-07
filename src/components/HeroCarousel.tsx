import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useLanguage, type Language } from '../lib/LanguageContext';
import type { Theme } from './useTheme';
import type { DesignTheme } from '../lib/designTheme';
import { CustomHeroSlide } from '../types';
import { FALLBACK_SLIDES } from './admin/resortConfigDefaults';

interface HeroCarouselProps {
  data: {
    slides?: CustomHeroSlide[];
    language: Language;
    theme: Theme;
    designTheme?: DesignTheme;
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

const HERO_SCRIM: Record<DesignTheme, { light: string; dark: string }> = {
  classic: { light: '250, 250, 247', dark: '17, 17, 19' },
  lodge: { light: '246, 239, 226', dark: '26, 20, 13' },
  air: { light: '255, 255, 255', dark: '10, 10, 10' },
};

const resolveSlideBackground = (
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
  if (bg.startsWith('http://') || bg.startsWith('https://')) {
    return bg;
  }
  return `https://storage.yandexcloud.net/carve/${bg}.webp`;
};

const buildBackgroundImage = (
  bgUrl: string,
  theme: Theme,
  designTheme: DesignTheme = 'air'
): string => {
  const scrim = HERO_SCRIM[designTheme];
  if (designTheme === 'air') {
    return theme === 'light'
      ? `linear-gradient(105deg, rgba(${scrim.light},0.94) 0%, rgba(${scrim.light},0.78) 38%, rgba(${scrim.light},0.35) 62%, rgba(${scrim.light},0.05) 100%), url('${bgUrl}')`
      : `linear-gradient(105deg, rgba(${scrim.dark},0.88) 0%, rgba(${scrim.dark},0.5) 45%, rgba(${scrim.dark},0.12) 100%), url('${bgUrl}')`;
  }
  return theme === 'light'
    ? `linear-gradient(105deg, rgba(${scrim.light},0.98) 0%, rgba(${scrim.light},0.88) 32%, rgba(${scrim.light},0.55) 55%, rgba(${scrim.light},0.12) 100%), url('${bgUrl}')`
    : `linear-gradient(105deg, rgba(${scrim.dark},0.82) 0%, rgba(${scrim.dark},0.42) 42%, rgba(${scrim.dark},0.1) 100%), url('${bgUrl}')`;
};

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  data: {
    slides: rawSlides,
    language,
    theme,
    designTheme = 'air',
    slideIntervalSeconds = 6,
    slidesRandomOrder = false,
  },
  actions: { onScrollToSection },
}) => {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = useMemo(() => {
    const source = rawSlides && rawSlides.length > 0 ? rawSlides : FALLBACK_SLIDES;
    const visible = source.filter((s) => !s.hidden);
    const base = visible.length > 0 ? visible : FALLBACK_SLIDES;
    if (slidesRandomOrder && base.length > 1) {
      return shuffleSlides(base);
    }
    return base;
  }, [rawSlides, slidesRandomOrder]);

  const slideInterval = slideIntervalSeconds || 6;

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

  useEffect(() => {
    slides.forEach((slide, idx) => {
      const img = new Image();
      img.src = resolveSlideBackground(slide, idx);
    });
  }, [slides]);

  return (
    <section className="ui-hero relative w-full min-h-[calc(100svh-4.25rem)] overflow-hidden flex flex-col justify-end">
      {/* Layered background crossfade */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {slides.map((slide, idx) => {
          const isActive = idx === currentSlide;
          return (
            <div
              key={slide.id || `hero-bg-${idx}`}
              className={`absolute inset-0 bg-cover bg-center will-change-[opacity] transition-opacity ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                ...crossfadeStyle,
                zIndex: isActive ? 2 : 1,
                backgroundImage: buildBackgroundImage(
                  resolveSlideBackground(slide, idx),
                  theme,
                  designTheme
                ),
              }}
            />
          );
        })}
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-10 pb-2 md:pb-4 pt-16 md:pt-20 flex flex-col justify-end flex-1">
        <div className="flex flex-col gap-8 w-full max-w-2xl">
          <div className="grid [&>*]:col-start-1 [&>*]:row-start-1 min-w-0">
            {slides.map((slide, idx) => {
              const isActive = idx === currentSlide;
              return (
                <div
                  key={slide.id || `hero-copy-${idx}`}
                  aria-hidden={!isActive}
                  className={`col-start-1 row-start-1 space-y-4 will-change-[opacity] transition-opacity ${
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
                    className="hero-copy-eyebrow text-[9px] font-mono uppercase tracking-widest block"
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
                    className="hero-copy-title text-3xl md:text-4xl lg:text-5xl font-serif font-light leading-[1.05] tracking-tight"
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
                    className="hero-copy-body text-xs font-mono max-w-lg tracking-wider leading-relaxed"
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
            className="flex flex-col items-start gap-3 pt-1"
          >
            <button
              onClick={() => onScrollToSection('coaches-grid')}
              className="btn-primary-hero px-5 py-3 inline-flex items-center justify-center gap-2"
            >
              <span>{t('startYourJourney')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onScrollToSection('courses-grid')}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--ink)]/80 hover:text-[var(--ink)] transition-colors bg-transparent border-0 p-0 cursor-pointer group"
            >
              <span>{t('chooseCourse')}</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </motion.div>
        </div>
        <div
          className="flex justify-center gap-2 mt-8 md:mt-10"
          role="tablist"
          aria-label={t('goToSlide')}
        >
          {slides.map((_, idx) => (
            <button
              key={idx}
              role="tab"
              aria-selected={currentSlide === idx}
              onClick={() => setCurrentSlide(idx)}
              className={`h-1 transition-[width,background-color] duration-500 ease-in-out cursor-pointer rounded-full ${
                currentSlide === idx
                  ? 'w-8 bg-[var(--accent)]'
                  : 'w-2 bg-[var(--ink)]/30 hover:bg-[var(--ink)]/60'
              }`}
              aria-label={`${t('goToSlide')} ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
