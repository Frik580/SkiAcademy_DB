import React from 'react';
// import logoLight from '../assets/images/logo6.png';
// import logoDark from '../assets/images/logo4.png';
import logoW from '../../assets/images/logo_w.png';
import sW from '../../assets/images/s_logo_w.png';
import logoB from '../../assets/images/logo_b.png';
import sB from '../../assets/images/s_logo_b.png';

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
    <span
      className={`relative inline-flex gap-3 items-center justify-center shrink-0 ${className}`}
    >
      {/* LIGHT THEME */}
      <span
        className={`inline-flex items-center gap-3 transition-opacity duration-150 ${
          isLight ? 'opacity-80' : 'opacity-0 absolute pointer-events-none'
        }`}
      >
        <img
          src={sW}
          alt=""
          loading="eager"
          referrerPolicy="no-referrer"
          className="max-h-9 w-auto object-contain"
        />

        <img
          src={logoW}
          alt={alt}
          loading="eager"
          referrerPolicy="no-referrer"
          className="max-h-8 w-auto object-contain"
        />
      </span>

      {/* DARK THEME */}
      <span
        className={`inline-flex items-center gap-3 transition-opacity duration-150 ${
          !isLight ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
        }`}
      >
        <img
          src={sB}
          alt=""
          loading="eager"
          referrerPolicy="no-referrer"
          className="max-h-9 w-auto object-contain"
        />

        <img
          src={logoB}
          alt={alt}
          loading="eager"
          referrerPolicy="no-referrer"
          className="max-h-8 w-auto object-contain"
        />
      </span>
    </span>
  );
};
