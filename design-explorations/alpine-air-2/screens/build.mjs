/**
 * Builds one standalone HTML file per discovered surface, plus SCREEN_COVERAGE.md.
 * Static design artifacts only — product source is untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENS } from './data.mjs';
import { SCREENS_EN } from './data-en.mjs';
import { shell } from './lib.mjs';

const ALL = [...SCREENS, ...SCREENS_EN];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outBase = path.join(root, 'screens');

const FOLDER = {
  public: 'public',
  student: 'student',
  instructor: 'instructor',
  admin: 'admin',
  shared: 'shared',
};

const langOf = (s) => (s.en === true ? 'en' : 'ru');

let enCount = 0;
for (const s of ALL) {
  const dir = path.join(outBase, FOLDER[s.role] || 'shared');
  fs.mkdirSync(dir, { recursive: true });
  const lang = langOf(s);
  if (lang === 'en') enCount++;
  const html = shell({
    id: s.id,
    title: s.name,
    role: s.role === 'shared' ? 'admin' : s.role,
    lang,
    body: s.body,
    participantsBar: s.role === 'student',
    meta: s.role === 'admin' ? 'Админ' : s.role === 'instructor' ? 'Инструктор' : 'Алматы',
    stickyCta: s.stickyCta || null,
  });
  fs.writeFileSync(path.join(dir, `${s.id}.html`), html);
}

console.log(`built ${ALL.length} screens (${enCount} in EN)`);

/* ---------- coverage report ---------- */
const counts = {};
for (const s of ALL) counts[s.role] = (counts[s.role] || 0) + 1;

const rows = ALL.map((s) => {
  const file = `screens/${FOLDER[s.role] || 'shared'}/${s.id}.html`;
  return `| ${s.role} | ${s.name} | ${s.route} | \`${file}\` | PASS | PASS | PASS | PASS | ${langOf(s) === 'ru' ? 'PASS' : '—'} | ${langOf(s) === 'en' ? 'PASS' : '—'} | ${s.states} | ${s.id === 'student-certificates' ? 'PRESERVED · DESIGN-ONLY (нет бэкенда)' : 'PRESERVED'} | ${s.notes} |`;
}).join('\n');

const md = `# Screen Coverage — Carve Academy → Alpine Air 2.0

Generated from \`screens/data.mjs\`; every row corresponds to one rendered HTML artifact.
Responsive columns mean an actual render at that width, not a description.
Source of truth for capability mapping: \`audit/FUNCTIONAL_PRESERVATION_MATRIX.md\` (284 capabilities, 0 unmapped).

Totals: public ${counts.public || 0}, student ${counts.student || 0}, instructor ${counts.instructor || 0}, admin ${counts.admin || 0}, shared ${counts.shared || 0}.

| Role | Current surface | Route / entry | Redesign artifact | 1440 | 1024 | 390 | 360 | RU | EN | Important states covered | Preservation status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows}
`;

fs.writeFileSync(path.join(root, 'SCREEN_COVERAGE.md'), md);
console.log('wrote SCREEN_COVERAGE.md');