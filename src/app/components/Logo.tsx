import React from 'react';
import logoW from '../../assets/images/logo_w.webp';
import sW from '../../assets/images/s_logo_w.webp';
import logoB from '../../assets/images/logo_b.webp';
import sB from '../../assets/images/s_logo_b.webp';

interface LogoProps {
  theme: 'light' | 'dark';
  alt?: string;
  className?: string;
}

/**
 * Renders the active theme logo eagerly; inactive pair loads lazily so
 * theme switch still works without competing with LCP on first paint.
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
      <span
        className={`inline-flex items-center gap-3 transition-opacity duration-150 ${
          isLight ? 'opacity-80' : 'opacity-0 absolute pointer-events-none'
        }`}
      >
        <img
          src={sW}
          alt=""
          loading={isLight ? 'eager' : 'lazy'}
          decoding="async"
          fetchpriority="low"
          referrerPolicy="no-referrer"
          className="max-h-9 w-auto object-contain"
        />

        <img
          src={logoW}
          alt={alt}
          loading={isLight ? 'eager' : 'lazy'}
          decoding="async"
          fetchpriority="low"
          referrerPolicy="no-referrer"
          className="max-h-8 w-auto object-contain"
        />
      </span>

      <span
        className={`inline-flex items-center gap-3 transition-opacity duration-150 ${
          !isLight ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
        }`}
      >
        <img
          src={sB}
          alt=""
          loading={!isLight ? 'eager' : 'lazy'}
          decoding="async"
          fetchpriority="low"
          referrerPolicy="no-referrer"
          className="max-h-9 w-auto object-contain"
        />

        <img
          src={logoB}
          alt={alt}
          loading={!isLight ? 'eager' : 'lazy'}
          decoding="async"
          fetchpriority="low"
          referrerPolicy="no-referrer"
          className="max-h-8 w-auto object-contain"
        />
      </span>
    </span>
  );
};
