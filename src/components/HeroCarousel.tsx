import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
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

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  data: { slides, currentSlide, language, theme },
  actions: { onSelectSlide, onScrollToSection }
}) => {
  const { t } = useLanguage();

  return (
    <section
      className="relative p-8 md:p-10 border-b border-[var(--border)] overflow-hidden flex flex-col justify-end min-h-[340px] bg-transparent"
    >
    {/* Background crossfader */}
    <AnimatePresence mode="popLayout">
      {(() => {
        const activeSlide = slides[currentSlide] || slides[0];
        let bg = activeSlide?.backgroundImage || 'wall';
        if (bg === 'random') {
          const walls = ['wall', 'wall2', 'wall3', 'wall4', 'wall5', 'wall6', 'wall7'];
          const slideId = activeSlide?.id || String(currentSlide);
          const hash = Array.from(slideId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
          bg = walls[hash % walls.length];
        }
        const bgUrl = bg.startsWith('http://') || bg.startsWith('https://')
          ? bg
          : `https://storage.yandexcloud.net/carve/${bg}.webp`;
        return (
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.0 }}
            className="absolute inset-0 bg-cover bg-center z-0"
            style={{
              backgroundImage: theme === 'light'
                ? `linear-gradient(to right, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.5) 100%), url('${bgUrl}')`
                : `linear-gradient(to right, rgba(15, 15, 18, 0.9) 0%, rgba(15, 15, 18, 0.4) 100%), url('${bgUrl}')`
            }}
          />
        );
      })()}
    </AnimatePresence>

    {/* Active Slide Content */}
    <div className="relative z-10 space-y-3 flex flex-col justify-end h-full">
      <AnimatePresence mode="wait">
        {(() => {
          const activeSlide = slides[currentSlide] || slides[0];
          if (!activeSlide) return null;
          return (
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex flex-col md:flex-row md:items-end justify-between gap-6"
            >
              {/* Text content on the left */}
              <div className="space-y-3 flex-1 min-w-0">
                <span className={`text-[9px] font-mono uppercase tracking-widest block ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                  {language === 'en' ? activeSlide.line1En : activeSlide.line1Ru}
                </span>
                <h2 className={`text-2xl md:text-3xl lg:text-4xl font-serif font-light leading-[1.1] tracking-tight max-w-xl ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  {language === 'en' ? activeSlide.line2En : activeSlide.line2Ru}
                </h2>
                <p className={`text-xs font-mono max-w-lg tracking-wider leading-relaxed pt-1 ${theme === 'light' ? 'text-slate-700' : 'text-slate-400'}`}>
                  {language === 'en' ? activeSlide.line3En : activeSlide.line3Ru}
                </p>
              </div>

              {/* Action Buttons on the right border */}
              <div className="flex flex-col gap-2.5 shrink-0 w-full md:w-auto md:min-w-[240px] self-start md:self-end z-20">
                <button
                  onClick={() => onScrollToSection('coaches-grid')}
                  className="w-full px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-mono text-[10px] uppercase tracking-widest transition-all duration-300 shadow-lg shadow-blue-500/20 active:translate-y-[1px] cursor-pointer inline-flex items-center justify-center gap-2 font-bold border border-blue-600 hover:border-blue-700 rounded-none"
                >
                  <span>{t('bookFirstLesson')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onScrollToSection('courses-grid')}
                  className={`w-full px-5 py-3 font-mono text-[10px] uppercase tracking-widest transition-all duration-300 active:translate-y-[1px] cursor-pointer inline-flex items-center justify-center gap-2 border rounded-none ${
                    theme === 'light'
                      ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 hover:border-slate-300 text-slate-800'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 text-white'
                  }`}
                >
                  <span>{t('chooseCourse')}</span>
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Elegant dots indicators */}
      <div className="flex gap-2 pt-4">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => onSelectSlide(idx)}
            className={`h-1 transition-all duration-300 rounded-none cursor-pointer ${
              currentSlide === idx
                ? 'w-8 bg-[var(--ink)]'
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
