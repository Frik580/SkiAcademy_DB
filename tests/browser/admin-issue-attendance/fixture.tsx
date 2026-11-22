import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LanguageProvider } from '../../../src/app/providers/LanguageContext';
import { AdminIssueAttendancePanel } from '../../../src/features/admin/issues/AdminIssueAttendancePanel';
import { AdminIssueCenter } from '../../../src/features/admin/issues/AdminIssueCenter';
import { AdminCollapsibleSection } from '../../../src/features/admin/components/settings/AdminCollapsibleSection';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/index.css';

const params = new URLSearchParams(location.search);
localStorage.setItem('alpine_glide_lang', params.get('language') === 'en' ? 'en' : 'ru');
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');

// Presentation-only fixture. It never executes a canonical command.
export function Fixture() {
  const [pending, setPending] = useState(false);
  return (
    <LanguageProvider>
      {params.get('kind') === 'center' ? (
        <MemoryRouter>
          <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--ink)]">
            <div
              className="space-y-6 animate-fade-in"
              style={{ paddingTop: 700, paddingBottom: 1000 }}
            >
              <AdminCollapsibleSection id="admin_issue_inbox" title="Attention center" defaultOpen>
                <AdminIssueCenter adminAccountId="admin_browser_fixture_01" />
              </AdminCollapsibleSection>
            </div>
          </main>
        </MemoryRouter>
      ) : (
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
      )}
    </LanguageProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
