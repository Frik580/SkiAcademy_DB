import React from 'react';
import logoLight from '../assets/images/cropped1.png';
import logoDark from '../assets/images/cropped2.png';

interface LogoProps {
  theme: 'light' | 'dark';
  alt?: string;
  className?: string;
}

/**
 * Dual-rendered optimized Logo component.
 * Preloads both light and dark logo images into browser cache/DOM
 * so theme switching happens instantly with zero load latency or flickering.
 */
export const Logo: React.FC<LogoProps> = ({
  theme,
  alt = 'Carve Academy Logo',
  className = 'h-8 sm:h-9 md:h-10',
}) => {
  const isLight = theme === 'light';

  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <img
        src={logoLight}
        alt={alt}
        loading="eager"
        referrerPolicy="no-referrer"
        className={`max-h-full w-auto object-contain transition-opacity duration-150 ${
          isLight ? 'opacity-100 relative z-10' : 'opacity-0 absolute inset-0 pointer-events-none'
        }`}
      />
      <img
        src={logoDark}
        alt={alt}
        loading="eager"
        referrerPolicy="no-referrer"
        className={`max-h-full w-auto object-contain transition-opacity duration-150 ${
          !isLight ? 'opacity-100 relative z-10' : 'opacity-0 absolute inset-0 pointer-events-none'
        }`}
      />
    </span>
  );
};
