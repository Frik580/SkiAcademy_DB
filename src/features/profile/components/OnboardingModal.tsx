import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useLanguage } from '../../../lib/LanguageContext';
import confetti from 'canvas-confetti';
import { BodyScrollLock } from '../../../components/ui/BodyScrollLock';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduleFirstLesson: () => void;
}

const SCREEN_URL = 'https://storage.yandexcloud.net/carve/images/screen.png';
const IMG = { w: 1542, h: 6206 };

/** Dark-theme crystals only — screen.png is a dark UI capture (`w/`, not `b/`) */
const getLevelSrc = (level: number) => `https://storage.yandexcloud.net/carve/level/w/${level}.png`;

/** Camera focal points on the full screenshot (image px + zoom) */
const SCENES = {
  // Wide hero plan (mountains at top of screen.png)
  hero: { fx: 771, fy: 420, scale: 1.05 },
  // Badge center on screen.png ≈ (443, 1496)
  level: { fx: 460, fy: 1496, scale: 1.8 },
  progressStart: { fx: 1100, fy: 2280, scale: 1.78 },
  progressEnd: { fx: 1100, fy: 3050, scale: 1.78 },
  calendarStart: { fx: 1050, fy: 3480, scale: 1.58 },
  calendarEnd: { fx: 1050, fy: 4180, scale: 1.58 },
} as const;

/** Screen 1 timing: hold hero → fly to badge → start crystal morph */
const S1_HERO_HOLD_MS = 700;
const S1_FLY_MS = 1700;
const S1_BADGE_CYCLE_MS = 1700;

type Camera = (typeof SCENES)[keyof typeof SCENES];

/**
 * Overlay anchors measured on screen.png.
 * Bars sit in the Progress column only (not over the score column).
 */
/**
 * Square badge slot matching ProfileSettings `w-40 h-40` + object-contain.
 * Measured on screen.png around the Level 1 crystal.
 */
const LEVEL_BADGE = { x: 388, y: 1436, w: 210, h: 210 };
const PROGRESS_RING = { x: 1360, y: 2188, w: 90, h: 90 };
const BAR_TRACK = { x: 1368, w: 90, h: 8 };

/** Exact bar-row centers + fill % from the screenshot */
const BAR_ROWS = [
  { y: 2494, pct: 100, done: true },
  { y: 2542, pct: 100, done: true },
  { y: 2585, pct: 75, done: false },
  { y: 2633, pct: 71, done: false },
  { y: 2681, pct: 100, done: true },
  { y: 2729, pct: 80, done: false },
  { y: 2777, pct: 100, done: true },
  { y: 2829, pct: 57, done: false },
  { y: 2877, pct: 100, done: true },
  { y: 2925, pct: 100, done: true },
  { y: 2968, pct: 75, done: false },
  { y: 3016, pct: 90, done: false },
  { y: 3077, pct: 75, done: false },
  { y: 3129, pct: 100, done: true },
  { y: 3177, pct: 90, done: false },
] as const;

const RING_TARGET = 84;
const RING_CIRC = 2 * Math.PI * 40;

function cameraToStyle(cam: Camera, vw: number, vh: number) {
  const displayWidth = vw * cam.scale;
  const displayHeight = IMG.h * (displayWidth / IMG.w);
  const fxd = cam.fx * (displayWidth / IMG.w);
  const fyd = cam.fy * (displayHeight / IMG.h);
  return {
    width: displayWidth,
    height: displayHeight,
    x: vw / 2 - fxd,
    y: vh / 2 - fyd,
  };
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onScheduleFirstLesson,
}) => {
  const { t, language } = useLanguage();
  const [currentStep, setCurrentStep] = useState(1);
  const [activeLevel, setActiveLevel] = useState(1);
  const [camera, setCamera] = useState<Camera>(SCENES.hero);
  const [playBadgeAnim, setPlayBadgeAnim] = useState(false);
  const [playProgressAnim, setPlayProgressAnim] = useState(false);
  const [camDuration, setCamDuration] = useState(1.15);
  const [viewport, setViewport] = useState({ w: 560, h: 360 });
  const stageRef = useRef<HTMLDivElement>(null);
  const totalSteps = 3;

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setViewport({ w: r.width, h: r.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setActiveLevel(1);
      setCamera(SCENES.hero);
      setPlayBadgeAnim(false);
      setPlayProgressAnim(false);
      setCamDuration(0);
    }
  }, [isOpen]);

  // Screen 1: cycle crystals only after camera lands on the badge
  useEffect(() => {
    if (!isOpen || currentStep !== 1 || !playBadgeAnim) return;
    setActiveLevel(1);
    const id = window.setInterval(() => {
      setActiveLevel((prev) => (prev >= 4 ? 1 : prev + 1));
    }, S1_BADGE_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [isOpen, currentStep, playBadgeAnim]);

  // Camera choreography per step
  useEffect(() => {
    if (!isOpen) return;
    const timers: number[] = [];

    if (currentStep === 1) {
      setPlayProgressAnim(false);
      setPlayBadgeAnim(false);
      setActiveLevel(1);
      // 1) Wide hero plan
      setCamDuration(0);
      setCamera(SCENES.hero);
      // 2) Fly down onto the level badge
      timers.push(
        window.setTimeout(() => {
          setCamDuration(S1_FLY_MS / 1000);
          setCamera(SCENES.level);
        }, S1_HERO_HOLD_MS),
        // 3) Start badge morph after the fly finishes
        window.setTimeout(
          () => {
            setPlayBadgeAnim(true);
          },
          S1_HERO_HOLD_MS + S1_FLY_MS + 80
        )
      );
    } else if (currentStep === 2) {
      setPlayBadgeAnim(false);
      setPlayProgressAnim(false);
      setCamDuration(1.15);
      setCamera(SCENES.progressStart);
      // After fly-in: fill ring/bars, then scroll once down the progress block
      timers.push(
        window.setTimeout(() => setPlayProgressAnim(true), 900),
        window.setTimeout(() => setCamera(SCENES.progressEnd), 1700)
      );
    } else if (currentStep === 3) {
      setPlayBadgeAnim(false);
      setPlayProgressAnim(false);
      setCamDuration(1.15);
      setCamera(SCENES.calendarStart);
      timers.push(window.setTimeout(() => setCamera(SCENES.calendarEnd), 1100));
    }

    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [currentStep, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep < totalSteps) setCurrentStep((p) => p + 1);
        else handleFinalAction();
      } else if (e.key === 'ArrowLeft' && currentStep > 1) {
        setCurrentStep((p) => p - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < totalSteps) setCurrentStep((p) => p + 1);
  };
  const handleBack = () => {
    if (currentStep > 1) setCurrentStep((p) => p - 1);
  };
  const handleFinalAction = () => {
    try {
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } catch {
      // ignore
    }
    onClose();
    onScheduleFirstLesson();
  };

  const camStyle = cameraToStyle(camera, viewport.w, viewport.h);
  const pct = (x: number, axis: 'w' | 'h') => `${(x / IMG[axis]) * 100}%`;

  return (
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-hidden">
      <BodyScrollLock />
      <div className="ui-modal relative max-w-3xl w-full text-[var(--ink)] overflow-hidden shadow-2xl flex flex-col h-[min(760px,80vh)] max-h-[80vh] rounded-2xl bg-[var(--card-bg)] border border-[var(--border)]">
        <div className="w-full bg-black/10 dark:bg-white/10 h-1 relative">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-amber-500"
            initial={{ width: '0%' }}
            animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

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

        {/* Browser stage fills the whole modal body */}
        <div ref={stageRef} className="relative flex-1 min-h-0 bg-[var(--card-bg)] overflow-y-auto">
          <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-black/55 border-b border-white/10 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-rose-400/80" />
            <span className="w-2 h-2 rounded-full bg-amber-400/80" />
            <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
            <span className="ml-2 text-[9px] font-mono uppercase tracking-wider text-white/45 truncate">
              {currentStep === 1 &&
                (playBadgeAnim
                  ? language === 'ru'
                    ? 'Личный кабинет → Уровень'
                    : 'Personal Cabinet → Level'
                  : language === 'ru'
                    ? 'Hero → Уровень'
                    : 'Hero → Level')}
              {currentStep === 2 &&
                (language === 'ru'
                  ? 'Личный кабинет → Прогресс текущего уровня'
                  : 'Personal Cabinet → Current Level Progress')}
              {currentStep === 3 &&
                (language === 'ru'
                  ? 'Личный кабинет → Календарь тренировок'
                  : 'Personal Cabinet → Training Calendar')}
            </span>
          </div>

          <motion.div
            className="absolute top-0 left-0 will-change-transform"
            animate={{
              x: camStyle.x,
              y: camStyle.y,
              width: camStyle.width,
              height: camStyle.height,
            }}
            transition={{
              duration: camDuration,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <img
              src={SCREEN_URL}
              alt="Carve Academy cabinet"
              className="absolute inset-0 w-full h-full select-none pointer-events-none"
              draggable={false}
            />

            {/* Screen 1: morph badges only after camera lands on the crystal */}
            {currentStep === 1 && playBadgeAnim && (
              <div
                className="absolute"
                style={{
                  left: pct(LEVEL_BADGE.x, 'w'),
                  top: pct(LEVEL_BADGE.y, 'h'),
                  width: pct(LEVEL_BADGE.w, 'w'),
                  height: pct(LEVEL_BADGE.h, 'h'),
                }}
              >
                <div className="absolute inset-0 bg-[var(--card-bg)]" />
                <AnimatePresence mode="wait">
                  <motion.img
                    key={`badge-${activeLevel}`}
                    src={getLevelSrc(activeLevel)}
                    alt={`Level ${activeLevel}`}
                    className="absolute inset-0 w-full h-full object-contain"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.06 }}
                    transition={{ duration: 0.38, ease: [0.34, 1.4, 0.64, 1] }}
                    referrerPolicy="no-referrer"
                  />
                </AnimatePresence>
              </div>
            )}

            {/* Screen 2: animated ring + per-row bars over Progress column */}
            {currentStep === 2 && (
              <>
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    left: pct(PROGRESS_RING.x, 'w'),
                    top: pct(PROGRESS_RING.y, 'h'),
                    width: pct(PROGRESS_RING.w, 'w'),
                    height: pct(PROGRESS_RING.h, 'h'),
                  }}
                >
                  <div className="absolute inset-0 rounded-full bg-[#0d1520]" />
                  <svg viewBox="0 0 100 100" className="relative w-full h-full -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="rgba(148,163,184,0.25)"
                      strokeWidth="9"
                    />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRC}
                      initial={{ strokeDashoffset: RING_CIRC }}
                      animate={{
                        strokeDashoffset: playProgressAnim
                          ? RING_CIRC - (RING_CIRC * RING_TARGET) / 100
                          : RING_CIRC,
                      }}
                      transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-serif font-bold text-[#38bdf8] text-[clamp(10px,1.5vw,16px)]">
                      {playProgressAnim ? <CountUp to={RING_TARGET} duration={1100} /> : 0}%
                    </span>
                  </div>
                </div>

                {BAR_ROWS.map((bar, idx) => (
                  <div
                    key={idx}
                    className="absolute overflow-hidden rounded-full bg-slate-800"
                    style={{
                      left: pct(BAR_TRACK.x, 'w'),
                      top: pct(bar.y - BAR_TRACK.h / 2, 'h'),
                      width: pct(BAR_TRACK.w, 'w'),
                      height: pct(BAR_TRACK.h, 'h'),
                    }}
                  >
                    <motion.div
                      className={`h-full rounded-full ${
                        bar.done ? 'bg-emerald-400' : 'bg-sky-400'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: playProgressAnim ? `${bar.pct}%` : 0 }}
                      transition={{
                        duration: 0.65,
                        delay: playProgressAnim ? 0.12 + idx * 0.04 : 0,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  </div>
                ))}
              </>
            )}
          </motion.div>

          {/* Screen copy + CTA inside the browser frame */}
          <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
            <div className="bg-gradient-to-t from-black/85 via-black/55 to-transparent pt-16 pb-4 px-4 sm:px-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`copy-${currentStep}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="text-center space-y-1.5 max-w-lg mx-auto"
                >
                  <h2 className="text-lg sm:text-xl font-serif font-light text-white">
                    {currentStep === 1 && t('onboardingS1Title')}
                    {currentStep === 2 && t('onboardingS2Title')}
                    {currentStep === 3 && t('onboardingS3Title')}
                  </h2>
                  <p className="text-[11px] sm:text-xs font-mono text-white/70 leading-relaxed">
                    {currentStep === 1 && t('onboardingS1Desc')}
                    {currentStep === 2 && t('onboardingS2Desc')}
                    {currentStep === 3 && t('onboardingS3Desc')}
                  </p>
                </motion.div>
              </AnimatePresence>

              {currentStep === 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="w-full max-w-sm mx-auto mt-3 pointer-events-auto"
                >
                  <button
                    onClick={handleFinalAction}
                    className="btn-primary w-full py-2.5 text-xs uppercase font-mono tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                  >
                    <span>{t('onboardingS3PrimaryBtn')}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onClose}
                    className="mt-2 text-[11px] font-mono uppercase tracking-wider text-white/55 hover:text-white underline transition w-full"
                  >
                    {t('onboardingS3LaterBtn')}
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        <div className="relative p-4 border-t border-[var(--border)] bg-black/5 dark:bg-white/5 flex items-center justify-between shrink-0">
          <div className="w-[8.5rem] flex items-center justify-start">
            {currentStep > 1 ? (
              <button
                onClick={handleBack}
                className="btn-secondary px-3.5 py-1.5 text-xs uppercase font-mono tracking-wider inline-flex items-center justify-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                <span>{t('onboardingBack')}</span>
              </button>
            ) : (
              <span
                className="invisible btn-secondary px-3.5 py-1.5 text-xs uppercase font-mono tracking-wider inline-flex items-center justify-center gap-1"
                aria-hidden
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                <span>{t('onboardingBack')}</span>
              </span>
            )}
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5">
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

          <div className="w-[8.5rem] flex items-center justify-end">
            {currentStep < totalSteps ? (
              <button
                onClick={handleNext}
                className="btn-primary px-4 py-1.5 text-xs uppercase font-mono tracking-wider inline-flex items-center justify-center gap-1"
              >
                <span>{t('onboardingNext')}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : (
              <button
                onClick={handleFinalAction}
                className="btn-primary px-4 py-1.5 text-xs uppercase font-mono tracking-wider inline-flex items-center justify-center"
              >
                {language === 'ru' ? 'Записаться' : 'Book now'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CountUp: React.FC<{ to: number; duration: number }> = ({ to, duration }) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, duration]);
  return <>{value}</>;
};
