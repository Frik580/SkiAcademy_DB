import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Calendar,
  CheckCircle2,
  ArrowDown,
  TrendingUp,
} from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import confetti from 'canvas-confetti';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduleFirstLesson: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onScheduleFirstLesson,
}) => {
  const { t, language } = useLanguage();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 6;

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep < totalSteps) {
          setCurrentStep((prev) => prev + 1);
        } else {
          handleFinalAction();
        }
      } else if (e.key === 'ArrowLeft' && currentStep > 1) {
        setCurrentStep((prev) => prev - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleFinalAction = () => {
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }
    onClose();
    onScheduleFirstLesson();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative bg-[var(--bg)] border border-[var(--border)] max-w-2xl w-full text-[var(--ink)] overflow-hidden shadow-2xl flex flex-col my-auto max-h-[92vh] sm:max-h-[88vh]">
        {/* Top Progress Line */}
        <div className="w-full bg-black/10 dark:bg-white/10 h-1 relative">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-amber-500"
            initial={{ width: '0%' }}
            animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

        {/* Header Bar */}
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between bg-black/5 dark:bg-white/5 shrink-0">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[var(--ink-dim)]">
            <span className="inline-block w-2 h-2 bg-cyan-400 rounded-none animate-pulse" />
            <span>
              {t('onboardingStepPrefix')} {currentStep} {t('onboardingStepOf')} {totalSteps}
            </span>
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)] hover:text-[var(--ink)] border border-[var(--border)]/60 hover:border-[var(--border)] bg-transparent transition cursor-pointer"
            title={t('onboardingSkip')}
          >
            <span>{t('onboardingSkip')}</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Slides */}
        <div className="p-5 sm:p-8 flex-1 overflow-y-auto flex flex-col justify-center min-h-[360px]">
          <AnimatePresence mode="wait">
            {/* SCREEN 1: WELCOME */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center space-y-6 my-auto"
              >
                {/* Large Crystal Visual Badge */}
                <div className="relative flex items-center justify-center p-6 sm:p-8 border border-cyan-500/40 bg-gradient-to-tr from-cyan-500/10 via-blue-500/10 to-purple-500/10 shadow-xl shadow-cyan-500/10 group">
                  <div className="absolute inset-0 bg-cyan-400/10 blur-xl rounded-full pointer-events-none animate-pulse" />
                  <span className="text-6xl sm:text-7xl filter drop-shadow-[0_0_15px_rgba(6,182,212,0.6)] transform group-hover:scale-110 transition duration-300">
                    💎
                  </span>
                </div>

                <div className="space-y-3 max-w-lg">
                  <div className="inline-flex items-center gap-2 px-3 py-1 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-mono text-[10px] uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" />
                    <span>{t('onboardingS1Badge')}</span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-serif font-light text-[var(--ink)] tracking-tight">
                    {t('onboardingS1Title')}
                  </h2>

                  <p className="text-xs sm:text-sm font-mono text-[var(--ink-dim)] leading-relaxed pt-1">
                    {t('onboardingS1Desc')}
                  </p>
                </div>
              </motion.div>
            )}

            {/* SCREEN 2: YOUR PATH */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center space-y-6 my-auto"
              >
                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl sm:text-2xl font-serif font-light text-[var(--ink)]">
                    {t('onboardingS2Title')}
                  </h2>
                  <p className="text-xs font-mono text-[var(--ink-dim)] leading-relaxed">
                    {t('onboardingS2Desc')}
                  </p>
                </div>

                {/* Animated Progression Steps */}
                <div className="w-full max-w-md bg-black/5 dark:bg-black/40 border border-[var(--border)] p-4 sm:p-5 space-y-2 text-left">
                  <div className="flex items-center gap-3 p-2.5 border border-cyan-500/50 bg-cyan-500/10">
                    <span className="text-2xl">💎</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs uppercase font-bold text-cyan-400">
                          Beginner
                        </span>
                        <span className="text-[10px] font-mono text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5">
                          {language === 'ru' ? 'Старт' : 'Start'}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)]">
                        {language === 'ru'
                          ? 'Первый поворот, контроль и уверенность'
                          : 'First turns, stance & control'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-center text-cyan-400/60 py-0.5">
                    <ArrowDown className="w-4 h-4 animate-bounce" />
                  </div>

                  <div className="flex items-center gap-3 p-2.5 border border-[var(--border)] bg-black/10 dark:bg-white/5 opacity-90">
                    <span className="text-2xl">⚡</span>
                    <div className="flex-1">
                      <span className="font-mono text-xs uppercase font-bold text-[var(--ink)]">
                        Carve
                      </span>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)]">
                        {language === 'ru'
                          ? 'Резаный поворот на параллельных лыжах / доске'
                          : 'Clean carved arcs on parallel edges'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-center text-[var(--ink-dim)]/40 py-0.5">
                    <ArrowDown className="w-4 h-4" />
                  </div>

                  <div className="flex items-center gap-3 p-2.5 border border-[var(--border)] bg-black/10 dark:bg-white/5 opacity-75">
                    <span className="text-2xl">🏔️</span>
                    <div className="flex-1">
                      <span className="font-mono text-xs uppercase font-bold text-[var(--ink)]">
                        Performance
                      </span>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)]">
                        {language === 'ru'
                          ? 'Высокая скорость, крутые склоны и динамика'
                          : 'High speed, steep slopes & dynamics'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-center text-[var(--ink-dim)]/40 py-0.5">
                    <ArrowDown className="w-4 h-4" />
                  </div>

                  <div className="flex items-center gap-3 p-2.5 border border-amber-500/40 bg-amber-500/5">
                    <span className="text-2xl">👑</span>
                    <div className="flex-1">
                      <span className="font-mono text-xs uppercase font-bold text-amber-400">
                        Expert
                      </span>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)]">
                        {language === 'ru'
                          ? 'Абсолютная свобода на любом рельефе и во фрирайде'
                          : 'Absolute mastery on all terrains & freeride'}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] font-mono text-[var(--ink-dim)] italic">
                  {t('onboardingS2PathNote')}
                </p>
              </motion.div>
            )}

            {/* SCREEN 3: ACHIEVEMENTS */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center space-y-6 my-auto"
              >
                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl sm:text-2xl font-serif font-light text-[var(--ink)]">
                    {t('onboardingS3Title')}
                  </h2>
                  <p className="text-xs font-mono text-[var(--ink-dim)] leading-relaxed">
                    {t('onboardingS3Desc')}
                  </p>
                </div>

                {/* 2x2 Badges Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                  <div className="p-3.5 border border-[var(--border)] bg-black/5 dark:bg-black/30 flex items-start gap-3 text-left hover:border-cyan-500/50 transition">
                    <div className="p-2 border border-amber-500/30 bg-amber-500/10 text-2xl shrink-0">
                      🏅
                    </div>
                    <div>
                      <h4 className="font-mono text-xs uppercase font-bold text-[var(--ink)]">
                        {t('onboardingBadge1')}
                      </h4>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)] mt-0.5">
                        {t('onboardingBadge1Desc')}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 border border-[var(--border)] bg-black/5 dark:bg-black/30 flex items-start gap-3 text-left hover:border-cyan-500/50 transition">
                    <div className="p-2 border border-blue-500/30 bg-blue-500/10 text-2xl shrink-0">
                      🏔️
                    </div>
                    <div>
                      <h4 className="font-mono text-xs uppercase font-bold text-[var(--ink)]">
                        {t('onboardingBadge2')}
                      </h4>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)] mt-0.5">
                        {t('onboardingBadge2Desc')}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 border border-[var(--border)] bg-black/5 dark:bg-black/30 flex items-start gap-3 text-left hover:border-cyan-500/50 transition">
                    <div className="p-2 border border-purple-500/30 bg-purple-500/10 text-2xl shrink-0">
                      ⭐
                    </div>
                    <div>
                      <h4 className="font-mono text-xs uppercase font-bold text-[var(--ink)]">
                        {t('onboardingBadge3')}
                      </h4>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)] mt-0.5">
                        {t('onboardingBadge3Desc')}
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 border border-[var(--border)] bg-black/5 dark:bg-black/30 flex items-start gap-3 text-left hover:border-cyan-500/50 transition">
                    <div className="p-2 border border-emerald-500/30 bg-emerald-500/10 text-2xl shrink-0">
                      💎
                    </div>
                    <div>
                      <h4 className="font-mono text-xs uppercase font-bold text-[var(--ink)]">
                        {t('onboardingBadge4')}
                      </h4>
                      <p className="text-[11px] font-mono text-[var(--ink-dim)] mt-0.5">
                        {t('onboardingBadge4Desc')}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SCREEN 4: PROGRESS PREVIEW */}
            {currentStep === 4 && (
              <motion.div
                key="step-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center space-y-6 my-auto"
              >
                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl sm:text-2xl font-serif font-light text-[var(--ink)]">
                    {t('onboardingS4Title')}
                  </h2>
                  <p className="text-xs font-mono text-[var(--ink-dim)] leading-relaxed">
                    {t('onboardingS4Desc')}
                  </p>
                </div>

                {/* Progress Card Replica */}
                <div className="w-full max-w-lg border border-[var(--border)] bg-black/5 dark:bg-black/40 p-4 sm:p-5 text-left space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-cyan-400" />
                      <span className="font-mono text-xs uppercase font-bold text-[var(--ink)]">
                        {t('onboardingS4Level')}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-cyan-400">0% XP</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-mono text-[var(--ink-dim)]">
                      <span>{t('onboardingS4Goal')}</span>
                      <span>{t('onboardingS4XPNeeded')}</span>
                    </div>
                    <div className="w-full bg-black/20 dark:bg-white/10 h-2 rounded-none overflow-hidden border border-[var(--border)]/40">
                      <div className="bg-cyan-400 h-full w-[5%]" />
                    </div>
                  </div>

                  {/* Checklist Items Preview */}
                  <div className="space-y-2 pt-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                      {language === 'ru' ? 'Персональные критерии уровня:' : 'Level skill criteria:'}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-mono text-[var(--ink)]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>
                          {language === 'ru'
                            ? 'Правильная стойка и скольжение'
                            : 'Proper stance & smooth gliding'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-[var(--ink-dim)]">
                        <div className="w-3.5 h-3.5 border border-[var(--border)] shrink-0" />
                        <span>
                          {language === 'ru'
                            ? 'Поворот с переносом веса тела'
                            : 'Turn execution with weight shift'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-mono text-[var(--ink-dim)]">
                        <div className="w-3.5 h-3.5 border border-[var(--border)] shrink-0" />
                        <span>
                          {language === 'ru'
                            ? 'Безопасное торможение соскальзыванием'
                            : 'Safe side-slip stopping control'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SCREEN 5: SCHEDULE */}
            {currentStep === 5 && (
              <motion.div
                key="step-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center space-y-6 my-auto"
              >
                <div className="space-y-2 max-w-md">
                  <h2 className="text-xl sm:text-2xl font-serif font-light text-[var(--ink)]">
                    {t('onboardingS5Title')}
                  </h2>
                  <p className="text-xs font-mono text-[var(--ink-dim)] leading-relaxed">
                    {t('onboardingS5Desc')}
                  </p>
                </div>

                {/* Schedule Slots Preview */}
                <div className="w-full max-w-md border border-[var(--border)] bg-black/5 dark:bg-black/40 p-4 space-y-2 text-left">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 mb-3">
                    <div className="flex items-center gap-2 font-mono text-xs uppercase font-bold text-[var(--ink)]">
                      <Calendar className="w-4 h-4 text-cyan-400" />
                      <span>
                        {language === 'ru'
                          ? 'Интерактивный календарь занятий'
                          : 'Interactive Session Calendar'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 border border-[var(--border)] bg-black/10 dark:bg-white/5 flex items-center justify-between">
                    <div className="font-mono text-xs">
                      <span className="text-[var(--ink)] font-bold">09:00 — 11:00</span>
                      <span className="text-[var(--ink-dim)] ml-2">
                        {language === 'ru' ? 'Утренняя тренировка' : 'Morning Coaching'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10">
                      🟢 {language === 'ru' ? '5 мест' : '5 spots'}
                    </span>
                  </div>

                  <div className="p-2.5 border border-[var(--border)] bg-black/10 dark:bg-white/5 flex items-center justify-between">
                    <div className="font-mono text-xs">
                      <span className="text-[var(--ink)] font-bold">11:30 — 13:30</span>
                      <span className="text-[var(--ink-dim)] ml-2">
                        {language === 'ru' ? 'Техника карвинга' : 'Carving Technique'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-mono text-amber-400 border border-amber-500/30 bg-amber-500/10">
                      🟠 {language === 'ru' ? '1 место' : '1 spot'}
                    </span>
                  </div>

                  <div className="p-2.5 border border-[var(--border)] bg-black/10 dark:bg-white/5 flex items-center justify-between opacity-80">
                    <div className="font-mono text-xs">
                      <span className="text-[var(--ink)] font-bold">14:00 — 16:00</span>
                      <span className="text-[var(--ink-dim)] ml-2">
                        {language === 'ru' ? 'Персональный гид' : 'Personal Guide'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-mono text-cyan-400 border border-cyan-500/30 bg-cyan-500/10">
                      🟢 {language === 'ru' ? 'Доступно' : 'Available'}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* SCREEN 6: FINAL ACTION */}
            {currentStep === 6 && (
              <motion.div
                key="step-6"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center text-center space-y-6 my-auto"
              >
                <div className="p-5 border border-cyan-500/40 bg-gradient-to-tr from-cyan-500/10 to-amber-500/10 relative shadow-xl">
                  <span className="text-5xl">🏔️</span>
                </div>

                <div className="space-y-3 max-w-md">
                  <h2 className="text-2xl sm:text-3xl font-serif font-light text-[var(--ink)]">
                    {t('onboardingS6Title')}
                  </h2>
                  <p className="text-xs sm:text-sm font-mono text-[var(--ink-dim)] leading-relaxed">
                    {t('onboardingS6Desc')}
                  </p>
                </div>

                {/* Primary & Secondary Call to Actions */}
                <div className="w-full max-w-sm space-y-2.5 pt-2">
                  <button
                    onClick={handleFinalAction}
                    className="btn-primary w-full py-3 text-xs uppercase font-mono tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                  >
                    <span>{t('onboardingS6PrimaryBtn')}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      onClose();
                      const el = document.getElementById('coaches-grid');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="btn-secondary w-full py-2.5 text-xs uppercase font-mono tracking-wider"
                  >
                    {t('onboardingS6SecondaryBtn')}
                  </button>

                  <button
                    onClick={onClose}
                    className="text-[11px] font-mono uppercase tracking-wider text-[var(--ink-dim)] hover:text-[var(--ink)] underline pt-1 transition"
                  >
                    {t('onboardingS6CabinetBtn')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-[var(--border)] bg-black/5 dark:bg-white/5 flex items-center justify-between shrink-0">
          <div>
            {currentStep > 1 ? (
              <button
                onClick={handleBack}
                className="btn-secondary px-3.5 py-1.5 text-xs uppercase font-mono tracking-wider flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{t('onboardingBack')}</span>
              </button>
            ) : (
              <div />
            )}
          </div>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStep(idx + 1)}
                className={`h-1.5 transition-all duration-200 cursor-pointer ${
                  currentStep === idx + 1
                    ? 'w-6 bg-cyan-400'
                    : 'w-1.5 bg-[var(--border)] hover:bg-[var(--ink-dim)]'
                }`}
                aria-label={`Go to step ${idx + 1}`}
              />
            ))}
          </div>

          <div>
            {currentStep < totalSteps ? (
              <button
                onClick={handleNext}
                className="btn-primary px-4 py-1.5 text-xs uppercase font-mono tracking-wider flex items-center gap-1"
              >
                <span>{t('onboardingNext')}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleFinalAction}
                className="btn-primary px-4 py-1.5 text-xs uppercase font-mono tracking-wider"
              >
                {language === 'ru' ? 'Начать 🚀' : 'Start 🚀'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
