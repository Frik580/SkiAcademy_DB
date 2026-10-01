// One-shot assembler for the ADMIN capability list.
// Reads the per-domain audit reports, extracts their JSON capability blocks,
// appends the finance + authorization block, and writes code-admin.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'D:/SkiAcademy_DB/design-explorations/alpine-air-2/audit';
const sources = [
  '_tmp-schedule.md',
  '_tmp-training-issues.md',
  '_tmp-people.md',
  '_tmp-product-system.md',
];

function extractJsonBlock(markdown) {
  const start = markdown.indexOf('```json');
  if (start === -1) return [];
  const from = start + '```json'.length;
  const end = markdown.indexOf('```', from);
  const body = markdown.slice(from, end);
  const first = body.indexOf('[');
  const last = body.lastIndexOf(']');
  return JSON.parse(body.slice(first, last + 1));
}

const REQUIRED = [
  'id',
  'tab',
  'screen',
  'capability',
  'entryPoint',
  'userAction',
  'states',
  'commandOrReadModel',
  'currentResult',
  'destructive',
  'sourceFiles',
];

const TAB_ALIASES = {
  shared: 'system',
  'shared (cross-tab)': 'system',
  authorization: 'system',
};

function normalizeTab(value) {
  const raw = String(value).trim();
  if (Object.prototype.hasOwnProperty.call(TAB_ALIASES, raw)) return TAB_ALIASES[raw];
  if (raw.startsWith('people')) return 'people';
  if (raw.startsWith('finance')) return 'finance';
  if (raw.startsWith('product')) return 'product';
  if (raw.startsWith('system')) return 'system';
  if (raw.startsWith('ops') || raw.startsWith('operations')) return 'operations';
  return raw;
}

function normalize(entry) {
  const out = {};
  for (const key of REQUIRED) {
    let value = entry[key];
    if (value === undefined || value === null) value = '';
    if (key === 'tab') value = normalizeTab(value);
    if (key === 'destructive') value = Boolean(value);
    if (key === 'states' && !Array.isArray(value)) value = [String(value)];
    if (key === 'sourceFiles' && !Array.isArray(value)) value = [String(value)];
    out[key] = value;
  }
  return out;
}

const all = [];
const seen = new Set();
for (const file of sources) {
  const markdown = readFileSync(join(dir, file), 'utf8');
  for (const entry of extractJsonBlock(markdown)) {
    const id = String(entry.id);
    if (seen.has(id)) continue;
    seen.add(id);
    all.push(normalize(entry));
  }
}

const extra = JSON.parse(readFileSync(join(dir, '_tmp-finance-authz.json'), 'utf8'));
for (const entry of extra) {
  if (seen.has(entry.id)) continue;
  seen.add(entry.id);
  all.push(normalize(entry));
}

writeFileSync(join(dir, 'code-admin.json'), `${JSON.stringify(all, null, 2)}\n`, 'utf8');

const byTab = {};
for (const entry of all) {
  byTab[entry.tab] = (byTab[entry.tab] ?? 0) + 1;
}
process.stdout.write(`total=${all.length}\n${JSON.stringify(byTab, null, 2)}\n`);
