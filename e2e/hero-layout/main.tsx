import React from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { HeroCarousel } from '../../src/app/components/HeroCarousel';
import { Logo } from '../../src/app/components/Logo';
import { LanguageProvider, useLanguage } from '../../src/app/providers/LanguageContext';
import '../../src/index.css';

function Fixture() {
  const { language } = useLanguage();
  return (
    <LazyMotion features={domAnimation}>
      <header style={{ height: '4.25rem' }}>
        <Logo theme="light" />
      </header>
      <HeroCarousel
        data={{ language, theme: 'light', slideIntervalSeconds: 3600 }}
        actions={{
          onScrollToSection: (id) => {
            window.location.hash = id;
          },
        }}
      />
      <div id="after-hero">After hero</div>
    </LazyMotion>
  );
}

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <Fixture />
  </LanguageProvider>
);
