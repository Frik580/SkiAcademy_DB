import React, { useEffect, useRef } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  duration?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  className,
  duration = 0.8,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.6 });
  const shouldReduceMotion = useReducedMotion();
  const motionValue = useMotionValue(shouldReduceMotion ? value : 0);
  const roundedValue = useTransform(motionValue, (current) => Math.round(current).toString());

  useEffect(() => {
    if (!isInView) return;

    if (shouldReduceMotion) {
      motionValue.set(value);
      return;
    }

    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });

    return () => controls.stop();
  }, [duration, isInView, motionValue, shouldReduceMotion, value]);

  return (
    <motion.span ref={ref} className={className}>
      {roundedValue}
    </motion.span>
  );
};
