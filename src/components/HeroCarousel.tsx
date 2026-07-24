import React, { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { useLanguage, type Language } from '../lib/LanguageContext';
import type { Theme } from './useTheme';
import { CustomHeroSlide } from '../types';

interface HeroCarouselProps {
  data: {
    slides: CustomHeroSlide[];
    currentSlide: number;
    language: Language;
    theme: Theme;
  };
  actions: {
    onSelectSlide: (index: number) => void;
    onScrollToSection: (id: string) => void;
  };
}

const HERO_CROSSFADE_MS = 1400;

const resolveSlideBackground = (activeSlide: CustomHeroSlide | undefined, slideIndex: number): string => {
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

const buildBackgroundImage = (bgUrl: string, theme: Theme): string =>
  theme === 'light'
    ? `linear-gradient(105deg, rgba(250,250,247,0.98) 0%, rgba(250,250,247,0.88) 32%, rgba(250,250,247,0.55) 55%, rgba(250,250,247,0.12) 100%), url('${bgUrl}')`
    : `linear-gradient(105deg, rgba(17,17,19,0.82) 0%, rgba(17,17,19,0.42) 42%, rgba(17,17,19,0.1) 100%), url('${bgUrl}')`;

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  data: { slides, currentSlide, language, theme },
  actions: { onSelectSlide, onScrollToSection }
}) => {
  const { t } = useLanguage();
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
    <section className="relative w-full min-h-[calc(100svh-4.25rem)] border-b border-[var(--border)] overflow-hidden flex flex-col justify-end">
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
                backgroundImage: buildBackgroundImage(resolveSlideBackground(slide, idx), theme),
              }}
            />
          );
        })}
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-10 pb-10 md:pb-12 pt-16 md:pt-20 flex flex-col justify-end flex-1">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 w-full">
          <div className="flex flex-col gap-5 flex-1 min-w-0 max-w-2xl">
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
                    <span className="hero-copy-eyebrow text-[9px] font-mono uppercase tracking-widest block">
                      {language === 'en' ? slide.line1En : slide.line1Ru}
                    </span>
                    <h2 className="hero-copy-title text-3xl md:text-4xl lg:text-5xl font-serif font-light leading-[1.05] tracking-tight">
                      {language === 'en' ? slide.line2En : slide.line2Ru}
                    </h2>
                    <p className="hero-copy-body text-xs font-mono max-w-lg tracking-wider leading-relaxed">
                      {language === 'en' ? slide.line3En : slide.line3Ru}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2" role="tablist" aria-label={t('goToSlide')}>
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  role="tab"
                  aria-selected={currentSlide === idx}
                  onClick={() => onSelectSlide(idx)}
                  className={`h-1 transition-[width,background-color] duration-500 ease-in-out rounded-none cursor-pointer ${
                    currentSlide === idx
                      ? 'w-8 bg-[var(--accent)]'
                      : 'w-2 bg-[var(--ink)]/30 hover:bg-[var(--ink)]/60'
                  }`}
                  aria-label={`${t('goToSlide')} ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 shrink-0 w-full md:w-auto md:min-w-[240px] self-start md:self-end">
            <button
              onClick={() => onScrollToSection('coaches-grid')}
              className="btn-primary w-full px-5 py-3 inline-flex items-center justify-center gap-2"
            >
              <span>{t('bookFirstLesson')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onScrollToSection('courses-grid')}
              className="btn-secondary-hero w-full px-5 py-3 inline-flex items-center justify-center gap-2"
            >
              <span>{t('chooseCourse')}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
