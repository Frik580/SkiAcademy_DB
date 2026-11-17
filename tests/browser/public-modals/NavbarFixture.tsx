import { useState } from 'react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { Navbar } from '../../../src/app/components/Navbar';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { CurrencyProvider } from '../../../src/app/providers/CurrencyContext';
import { AuthModal } from '../../../src/features/auth/components/AuthModal';
import { NotificationProvider } from '../../../src/features/notifications';
import type { UserProfile } from '../../../src/types';

function Navigation() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  );
  // Presentation fixture only: no authenticated session or protected route access.
  const [profile, setProfile] = useState<UserProfile | null>(
    new URLSearchParams(location.search).has('profile')
      ? ({ uid: 'fixture', role: 'admin', displayName: 'Fixture Admin' } as UserProfile)
      : null
  );
  return (
    <>
      <Navbar
        userProfile={profile}
        onOpenNotifications={() => setAuth(true)}
        onSignOut={() => setProfile(null)}
        theme={theme}
        onToggleTheme={() => {
          const next = theme === 'light' ? 'dark' : 'light';
          document.documentElement.classList.toggle('dark', next === 'dark');
          setTheme(next);
        }}
        onSignInClick={() => setAuth(true)}
      />
      <main style={{ minHeight: 2400, padding: 24 }}>
        <button onClick={() => navigate('/?next=1#section')}>Navigate</button>
        <button onClick={() => setAuth(true)}>Independent modal</button>
      </main>
      <AuthModal isOpen={auth} onClose={() => setAuth(false)} />
    </>
  );
}

export function NavbarFixture() {
  document.documentElement.classList.toggle('dark', localStorage.getItem('theme') === 'dark');
  return (
    <LazyMotion features={domAnimation}>
      <LanguageProvider>
        <CurrencyProvider>
          <MemoryRouter>
            <NotificationProvider>
              <Navigation />
            </NotificationProvider>
          </MemoryRouter>
        </CurrencyProvider>
      </LanguageProvider>
    </LazyMotion>
  );
}
