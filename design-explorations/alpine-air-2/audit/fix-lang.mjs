/**
 * Post-audit correction: the product has exactly TWO interface languages (en/ru).
 * Removes the incorrect three-way RU/KZ/EN selector from the concept renders.
 * Pure design-artifact edit — product source is untouched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const threeWay =
  /<div class="seg"[^>]*>\s*<div class="seg-item seg-item-on">RU<\/div>\s*<div class="seg-item">KZ<\/div>\s*<div class="seg-item">EN<\/div>\s*<\/div>/g;
const twoWay = `<div class="seg" title="Язык интерфейса: только RU и EN">
        <div class="seg-item">EN</div>
        <div class="seg-item seg-item-on">RU</div>
      </div>`;

const edits = [
  ['01-home.html'],
  ['03-cabinet.html'],
];

for (const [file] of edits) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before.replace(threeWay, twoWay);
  if (before !== after) {
    fs.writeFileSync(p, after);
    console.log('fixed language selector in', file);
  } else {
    console.log('no change needed in', file);
  }
}

// concept page: state the two-language rule explicitly
const cp = path.join(root, '00-concept.html');
if (fs.existsSync(cp)) {
  let c = fs.readFileSync(cp, 'utf8');
  if (!c.includes('Ровно два языка')) {
    c = c.replace(
      '<span class="chip chip-line">Концепт</span>',
      '<span class="chip chip-line">Концепт</span>\n      <span class="chip chip-accent">Интерфейс: RU / EN — ровно два языка</span>'
    );
    fs.writeFileSync(cp, c);
    console.log('annotated concept page with the two-language rule');
  }
}
