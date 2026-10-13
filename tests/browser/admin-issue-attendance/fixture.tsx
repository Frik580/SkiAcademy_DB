import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { AdminIssueAttendancePanel } from '../../../src/features/admin/issues/AdminIssueAttendancePanel';
import '../../../src/index.css';

const params = new URLSearchParams(location.search);
localStorage.setItem('alpine_glide_lang', params.get('language') === 'en' ? 'en' : 'ru');
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');

// Presentation-only fixture. It never executes a canonical command.
export function Fixture() {
  const [pending, setPending] = useState(false);
  return (
    <LanguageProvider>
      <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--ink)]">
        <aside className="mx-auto max-w-lg border border-[var(--border)] p-4">
          <AdminIssueAttendancePanel
            input={{
              lessonTime: '14.10.2026, 10:00',
              participants: [
                { id: 'alex', displayName: 'Александр Константинопольский', status: undefined },
                { id: 'maria', displayName: 'Мария', status: undefined },
                { id: 'dmitry', displayName: 'Дмитрий', status: 'present' },
                { id: 'anna', displayName: 'Анна', status: 'absent' },
              ],
              missingCount: 2,
            }}
            pending={pending}
            onSubmit={() => setPending(true)}
          />
        </aside>
      </main>
    </LanguageProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
