import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { HeroCarousel } from '../../src/app/components/HeroCarousel';
import { Navbar } from '../../src/app/components/Navbar';
import { FeaturePageShell } from '../../src/app/FeaturePageShell';
import { FALLBACK_SLIDES } from '../../src/app/config/fallbackHeroSlides';
import { CurrencyProvider } from '../../src/app/providers/CurrencyContext';
import { LanguageProvider, useLanguage } from '../../src/app/providers/LanguageContext';
import {
  ConditionsStrip,
  buildResortConditionsPresentation,
} from '../../src/features/resort-conditions';
import '../../src/index.css';

function Fixture() {
  const { language } = useLanguage();
  const route = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  );
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const params = new URLSearchParams(window.location.search);
  const video = params.has('video');
  // One slide excludes carousel crossfades from Header-only pixel comparisons.
  const fixtureSlides = params.has('appearance') ? FALLBACK_SLIDES.slice(0, 1) : FALLBACK_SLIDES;
  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)]">
        <Navbar
          userProfile={null}
          onOpenNotifications={() => {}}
          onSignOut={() => {}}
          onSignInClick={() => {}}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        />
        <FeaturePageShell
          isHomeRoute={route.pathname === '/'}
          isPaddedWorkspace={false}
          isAuthenticated={false}
          dbStatusWarning={
            new URLSearchParams(window.location.search).has('warning') ? 'Connection warning' : null
          }
          onDismissDbWarning={() => {}}
        >
          {route.pathname === '/' && (
            <>
              <HeroCarousel
                data={{
                  language,
                  theme,
                  slideIntervalSeconds: 3600,
                  slides: video
                    ? fixtureSlides.map((slide) => ({
                        ...slide,
                        backgroundImage: 'https://hero.fixture/background.webm',
                        backgroundMediaMode: 'video' as const,
                        mobileFocalPointX: 72,
                      }))
                    : fixtureSlides,
                }}
                actions={{
                  onScrollToSection: (id) => {
                    window.location.hash = id;
                  },
                }}
              />
              <div id="after-hero" className="conditions-sticky-scope shrink-0">
                <ConditionsStrip
                  presentation={buildResortConditionsPresentation(
                    { status: 'loading', data: null },
                    'celsius'
                  )}
                  onToggleUnit={() => {}}
                />
                <div style={{ height: 1200 }}>Journey</div>
              </div>
            </>
          )}
          <div style={{ height: 1400 }}>
            <button
              id="route-toggle"
              onClick={() => navigate(route.pathname === '/' ? '/other' : '/')}
            >
              Switch public page
            </button>
          </div>
        </FeaturePageShell>
      </div>
    </LazyMotion>
  );
}

createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <CurrencyProvider>
      <MemoryRouter>
        <Fixture />
      </MemoryRouter>
    </CurrencyProvider>
  </LanguageProvider>
);
