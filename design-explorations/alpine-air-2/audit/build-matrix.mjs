/**
 * Builds FUNCTIONAL_PRESERVATION_MATRIX.md from the machine-readable code-audit dumps.
 * Pure build step — no product code is touched.
 * Run: node build-matrix.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => (fs.existsSync(path.join(here, f)) ? JSON.parse(fs.readFileSync(path.join(here, f), 'utf8')) : []);

const pubStu = load('code-public-student.json');
const admin = load('code-admin.json');
const domain = load('code-domain-mechanics.json');

/** keyword -> Alpine Air 2.0 destination */
const RULES = [
  [/sign.?in|log ?in|auth|register|sign ?up|password|recover/i, 'PUBLIC / Auth (auth modal + recovery)'],
  [/language|theme/i, 'SHARED / Top bar (language + theme)'],
  [/navbar|menu|footer|navigation/i, 'PUBLIC / Nav + Footer · SHARED top bar'],
  [/hero|carousel|slider|banner|landing|home page/i, 'PUBLIC / Home'],
  [/instructor (list|directory|discovery|card)|coach (list|directory)/i, 'PUBLIC / Instructors discovery'],
  [/instructor profile|coach profile|public profile/i, 'PUBLIC / Instructor profile'],
  [/review|rating|отзыв/i, 'PUBLIC + STUDENT / Reviews surface'],
  [/course (list|catalog|card)|enroll/i, 'PUBLIC / Courses catalog + course detail'],
  [/guest (booking|reservation)|public booking|book lesson|slot/i, 'PUBLIC / Booking (guest reservation)'],
  [/wallet|balance|top.?up|payment|refund/i, 'STUDENT / Wallet · INSTRUCTOR / Finance · ADMIN / Finance'],
  [/participant|dependent|avatar|switcher/i, 'STUDENT / Participant switcher (persistent)'],
  [/lesson (booking|list|history)|my lessons|upcoming|past lesson/i, 'STUDENT / Lessons'],
  [/cancel|reschedul|rebook|move|transfer/i, 'SHARED / Booking actions (row + detail)'],
  [/progress|path|mastery|level|xp/i, 'STUDENT / Progress & Path'],
  [/skill/i, 'STUDENT / Skills (radar + exercises)'],
  [/certificate/i, 'STUDENT / Certificates'],
  [/achievement|badge|medal/i, 'STUDENT / Achievements'],
  [/video|archive/i, 'STUDENT / Video archive'],
  [/season|stat/i, 'STUDENT / Season stats'],
  [/profile|personal info|settings|privacy/i, 'STUDENT / Profile & Settings'],
  [/feedback|note/i, 'INSTRUCTOR / Lesson detail (feedback)'],
  [/attendance|посещаем/i, 'INSTRUCTOR / Attendance · ADMIN / Attendance'],
  [/today|dashboard|daily|checklist|route/i, 'INSTRUCTOR / Today'],
  [/schedule|planner|board|timetable|availability/i, 'INSTRUCTOR / Schedule · ADMIN / Planner'],
  [/finance|movement|cash|monetary|ledger|statement/i, 'ADMIN / Finance · INSTRUCTOR / Finance'],
  [/issue|attention|complaint|inbox|escalation/i, 'ADMIN / Issues & Attention center'],
  [/people|client database|persona/i, 'ADMIN / People — Clients & Participants'],
  [/instructor (admin|directory management)|coach (admin|management)|roster/i, 'ADMIN / People — Instructors'],
  [/role|permission|access/i, 'ADMIN / People — Roles'],
  [/resort|weather|slider|content/i, 'ADMIN / Product — Resort & Content'],
  [/test(ing)? session|error log|danger|reset|clear|seed/i, 'ADMIN / System'],
  [/starter credit|rating matrix|notification retention/i, 'ADMIN / System / Product settings'],
  [/login|logout|session/i, 'SHARED / Session'],
  [/chat|message|thread/i, 'SHARED / Lesson chat'],
  [/counter|metric|overview stat/i, 'ADMIN / Operations — metrics strip · INSTRUCTOR / KPI strip'],
  [/pagination|load more|cursor|page size/i, 'SHARED / Table + list pagination'],
  [/detail pane|master.?detail|detail panel/i, 'SHARED / Table row → detail pane'],
  [/change request/i, 'ADMIN / Issues — change requests'],
  [/search/i, 'ROLE / Table search field (compact)'],
  [/create .*course|provisioning|add course|course db/i, 'ADMIN / Product — Courses'],
  [/reason|must provide|required text/i, 'SHARED / Confirmation dialog (reason capture)'],
];

function destination(row) {
  const hay = [row.capability, row.screen, row.entryPoint, row.currentResult].join(' ');
  for (const [re, dest] of RULES) if (re.test(hay)) return dest;
  return 'UNMAPPED';
}

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim().slice(0, 300);
}

const rows = [];

for (const r of pubStu) {
  rows.push({
    id: r.id,
    role: (r.role || '').toUpperCase(),
    area: r.route || r.screen || '—',
    capability: r.capability,
    entry: r.entryPoint,
    action: r.userAction,
    states: (r.states || []).join('; '),
    cmd: r.commandOrReadModel,
    result: r.currentResult,
    keep: 'MUST PRESERVE',
    dest: destination(r),
    risk: r.destructive ? 'destructive/irreversible path' : '',
    files: (r.sourceFiles || []).join(', '),
  });
}

for (const r of admin) {
  rows.push({
    id: r.id,
    role: 'ADMIN',
    area: `${r.tab || '—'} / ${r.screen || '—'}`,
    capability: r.capability,
    entry: r.entryPoint,
    action: r.userAction,
    states: (r.states || []).join('; '),
    cmd: r.commandOrReadModel,
    result: r.currentResult,
    keep: 'MUST PRESERVE',
    dest: destination({ ...r, capability: `${r.capability} ${r.screen}` }),
    risk: r.destructive ? 'DESTRUCTIVE — confirmation required' : '',
    files: (r.sourceFiles || []).join(', '),
  });
}

const unmapped = rows.filter((r) => r.dest === 'UNMAPPED');

const head = `# Functional Preservation Matrix — Carve Academy

Generated from the repository audit dumps in this folder
(\`code-public-student.json\`, \`code-admin.json\`, \`code-domain-mechanics.json\`)
plus the live staging audit (\`staging/\`).

Rules for this deliverable:

- Every discovered capability is listed. Nothing is dropped.
- \`MUST PRESERVE\` is the default; a capability is only ever downgraded when the
  product owner explicitly approves removal (none are, at this stage).
- \`Proposed location\` is where the capability lives in the Alpine Air 2.0 redesign.
- Rows marked \`UNMAPPED\` are a redesign defect and must be resolved before the
  redesign can be called complete.

Totals: **${rows.length}** capabilities
(${pubStu.length} public/student + ${admin.length} admin + ${domain.length} domain mechanics recorded separately in
\`code-domain-mechanics.json\`).
Rows still unmapped: **${unmapped.length}**.
`;

const header = `| ID | Role | Area / screen | Capability | Entry point | User action | States | Command / read model | Current result | Keep? | Alpine Air 2.0 destination | Risk | Source files |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
`;

const body = rows
  .map(
    (r) =>
      `| ${esc(r.id)} | ${esc(r.role)} | ${esc(r.area)} | ${esc(r.capability)} | ${esc(r.entry)} | ${esc(r.action)} | ${esc(r.states)} | ${esc(r.cmd)} | ${esc(r.result)} | ${r.keep} | ${esc(r.dest)} | ${esc(r.risk)} | ${esc(r.files)} |`
  )
  .join('\n');

const unmappedSection =
  unmapped.length === 0
    ? '_No unmapped capabilities._'
    : `## Unmapped (must be resolved)\n\n` +
      unmapped.map((r) => `- \`${r.id}\` (${r.role}) — ${r.capability} · ${r.area}`).join('\n');

fs.writeFileSync(
  path.join(here, 'FUNCTIONAL_PRESERVATION_MATRIX.md'),
  `${head}\n${header}\n${body}\n\n${unmappedSection}\n`
);

console.log(`matrix rows: ${rows.length}, unmapped: ${unmapped.length}`);
console.log(
  'unmapped ids:',
  unmapped.slice(0, 40).map((r) => `${r.id}:${(r.capability || '').slice(0, 40)}`).join(' | ')
);
