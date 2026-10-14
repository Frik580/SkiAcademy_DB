import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { ParticipantLevelPanel } from '../../../src/features/participant-progress/ParticipantLevelPanel';
import { DEFAULT_SKILL_CONFIG } from '../../../src/domain/achievements';
import '../../../src/index.css';
const params = new URLSearchParams(location.search);
localStorage.setItem('alpine_glide_lang', params.get('language') === 'en' ? 'en' : 'ru');
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
const config = {
  ...DEFAULT_SKILL_CONFIG,
  items: [1, 2, 3].map((stage) => ({
    ...DEFAULT_SKILL_CONFIG.items[0],
    id: `s${stage}`,
    levelTarget: stage,
    maxPoints: 100,
  })),
};
// Isolated presentation fixture; canonical server behavior is tested separately.
function Fixture() {
  const [level, setLevel] = useState(1);
  return (
    <LanguageProvider>
      <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)] p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          <div data-testid="instructor">
            <ParticipantLevelPanel
              progress={{ level, skillScores: { s1: 80 } }}
              config={config}
              role="instructor"
              onOperation={(op) => {
                if (op.action === 'confirm') setLevel(2);
              }}
            />
          </div>
          <div data-testid="assigned">
            <ParticipantLevelPanel
              progress={{
                level: 3,
                skillScores: {},
                levelState: {
                  levelRevision: 1 as never,
                  assignedThroughLevel: 2,
                  method: 'admin_assignment',
                  qualifications: [],
                },
              }}
              config={config}
            />
          </div>
          <div data-testid="admin">
            <ParticipantLevelPanel
              progress={{ level: 1, skillScores: {} }}
              config={config}
              role="admin"
              onOperation={() => undefined}
            />
          </div>
        </div>
      </main>
    </LanguageProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
