import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion, domAnimation } from 'framer-motion';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { CurrencyProvider } from '../../../src/app/providers/CurrencyContext';
import { InstructorCard } from '../../../src/features/profile/components/InstructorCard';
import { InstructorBlockAction } from '../../../src/features/booking-collaboration/components/InstructorBlockAction';
import type { Instructor } from '../../../src/types';
import '../../../src/index.css';

const params = new URLSearchParams(location.search);
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
localStorage.setItem('alpine_glide_lang', params.get('language') === 'ru' ? 'ru' : 'en');
const instructor: Instructor = {
  id: 'instructor_fixture',
  name: 'Elena',
  specialty: 'ski',
  rating: 4.9,
  reviewsCount: 24,
  languages: ['en', 'ru'],
  experienceYears: 8,
  bio: 'Ski instructor for adults and children.',
  avatarUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#7cacc0"/><circle cx="64" cy="45" r="23" fill="#e5af83"/><path d="M20 128V100a44 44 0 0 1 88 0v28" fill="#d87043"/></svg>')}`,
  pricePerHour: 10000,
  pricePerHourKZT: 10000,
  isAvailable: true,
};

export function Fixture() {
  const [blocked, setBlocked] = useState(params.get('blocked') === 'true');
  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <InstructorCard
        instructor={instructor}
        blocked={blocked}
        onBook={() => undefined}
        actions={
          <InstructorBlockAction
            access={{
              participantId: 'participant_fixture',
              instructorId: instructor.id,
              participantDisplayName: 'Student',
              instructorDisplayName: instructor.name,
              managerBlockStatus: blocked ? 'active' : undefined,
              authorizedActions: {
                canBlock: !blocked,
                canUnblock: blocked,
                canCreateRelationship: false,
                canRevokeRelationship: false,
              },
            }}
            onBlock={async () => setBlocked(true)}
            onUnblock={async () => setBlocked(false)}
          />
        }
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <LanguageProvider>
    <CurrencyProvider>
      <LazyMotion features={domAnimation}>
        <Fixture />
      </LazyMotion>
    </CurrencyProvider>
  </LanguageProvider>
);
