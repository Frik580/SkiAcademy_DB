import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { DEFAULT_SKILL_CONFIG } from '../../../src/domain/achievements';
import { YourJourneySection } from '../../../src/features/journey';
import type { UserProfile } from '../../../src/types';
import '../../../src/index.css';

const params = new URLSearchParams(location.search);
localStorage.setItem('theme', params.get('theme') === 'dark' ? 'dark' : 'light');
localStorage.setItem('alpine_glide_lang', params.get('language') === 'en' ? 'en' : 'ru');
const level = Number(params.get('level') || 1);
const config = {
  ...DEFAULT_SKILL_CONFIG,
  items: [1, 2, 3].map((stage) => ({
    ...DEFAULT_SKILL_CONFIG.items[0],
    id: `stage_${stage}`,
    levelTarget: stage as 1 | 2 | 3,
    maxPoints: 100,
  })),
};
const userProfile = {
  uid: 'geometry-fixture',
  displayName: 'Journey Student',
  level,
  skillScores: { stage_1: level > 1 ? 100 : 25, stage_2: level > 2 ? 100 : 0 },
} as UserProfile;

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <LanguageProvider>
      <YourJourneySection
        appearance={params.get('appearance') === 'default' ? 'default' : 'cabinet'}
        userProfile={userProfile}
        skillConfig={config}
        markerParticipant={{ displayName: userProfile.displayName! }}
        animateSequence={false}
      />
    </LanguageProvider>
  </MemoryRouter>
);
