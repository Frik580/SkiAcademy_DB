import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX } from './constants';
import { measureSkillsBlockHeights } from './journeyUtils';

/** ЛК (desktop): fillViewport, пока блок навыков (с margin) ≥150px; иначе — как на лендинге. */
export function useCabinetJourneyLayout(fillViewport: boolean, remeasureKey: string) {
  const sectionRef = useRef<HTMLElement>(null);
  const [effectiveFillViewport, setEffectiveFillViewport] = useState(fillViewport);
  const lastWidthRef = useRef(typeof window === 'undefined' ? 0 : window.innerWidth);

  useEffect(() => {
    if (!fillViewport) {
      setEffectiveFillViewport(false);
    }
  }, [fillViewport]);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!effectiveFillViewport || !section) return;

    let lastWidth = window.innerWidth;

    const lock = () => {
      const navbar = document.querySelector('.ui-navbar');
      const navbarPx =
        navbar instanceof HTMLElement
          ? navbar.offsetHeight
          : parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue('--app-navbar-height')
            ) || 0;
      const height = Math.max(0, Math.round(window.innerHeight - navbarPx));
      section.style.height = `${height}px`;
      section.style.minHeight = `${height}px`;
      section.style.maxHeight = `${height}px`;
    };

    lock();

    const onOrientation = () => requestAnimationFrame(lock);
    const onResize = () => {
      const width = window.innerWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      lock();
    };

    window.addEventListener('orientationchange', onOrientation);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('orientationchange', onOrientation);
      window.removeEventListener('resize', onResize);
      section.style.removeProperty('height');
      section.style.removeProperty('min-height');
      section.style.removeProperty('max-height');
    };
  }, [effectiveFillViewport]);

  useLayoutEffect(() => {
    if (!fillViewport) return;

    const evaluate = () => {
      const section = sectionRef.current;
      if (!section) return;

      const scrollEls = section.querySelectorAll('[data-journey-skills-scroll]');
      if (scrollEls.length === 0) return;

      let hasVisibleSkills = false;
      let shouldFill = true;

      scrollEls.forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        const article = el.closest('article');
        if (article instanceof HTMLElement && article.classList.contains('invisible')) return;

        hasVisibleSkills = true;
        const { allocated, content } = measureSkillsBlockHeights(el);
        const isClipped = content > allocated + 2;
        const isTooSmall = allocated < CABINET_JOURNEY_MIN_SKILLS_BLOCK_PX;
        if (isClipped || isTooSmall) {
          shouldFill = false;
        }
      });

      if (!hasVisibleSkills) {
        setEffectiveFillViewport(false);
        return;
      }

      setEffectiveFillViewport(shouldFill);
    };

    evaluate();
    const raf = requestAnimationFrame(evaluate);
    const retry = window.setTimeout(evaluate, 150);

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(evaluate) : null;
    if (sectionRef.current) ro?.observe(sectionRef.current);

    const onViewportChange = () => {
      lastWidthRef.current = window.innerWidth;
      requestAnimationFrame(evaluate);
    };

    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(retry);
      ro?.disconnect();
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, [fillViewport, remeasureKey]);

  return { sectionRef, effectiveFillViewport };
}
