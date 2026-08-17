import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const assetSize = async (file) => {
  const source = await readFile(`dist/${file}`);
  return { raw: source.byteLength, gzip: gzipSync(source).byteLength };
};

const collectStaticAssets = (entryKey, seen = new Set()) => {
  if (seen.has(entryKey)) return seen;
  seen.add(entryKey);
  for (const dependency of manifest[entryKey]?.imports ?? []) {
    collectStaticAssets(dependency, seen);
  }
  return seen;
};

const totalForEntry = async (entryKey, includeImports = true) => {
  const entryKeys = includeImports ? collectStaticAssets(entryKey) : new Set([entryKey]);
  const files = [...entryKeys].map((key) => manifest[key].file);
  const sizes = await Promise.all(files.map(assetSize));
  return sizes.reduce(
    (total, size) => ({ raw: total.raw + size.raw, gzip: total.gzip + size.gzip }),
    { raw: 0, gzip: 0 }
  );
};

const initialEntry = Object.entries(manifest).find(([, chunk]) => chunk.isEntry)?.[0];
if (!initialEntry) throw new Error('No Vite entry was found in dist/.vite/manifest.json');

const initial = await totalForEntry(initialEntry);
console.log(`Initial payload: ${formatBytes(initial.raw)} raw / ${formatBytes(initial.gzip)} gzip`);

const routeEntries = Object.entries(manifest)
  .filter(([, chunk]) => chunk.isDynamicEntry)
  .filter(([, chunk]) => /RouteContainer-/.test(chunk.file));

for (const [routeEntry, chunk] of routeEntries.sort(([a], [b]) => a.localeCompare(b))) {
  const total = await totalForEntry(routeEntry, false);
  console.log(
    `Deferred ${chunk.file.replace(/^assets\//, '').replace(/-[A-Za-z0-9_]+\.js$/, '')}: ` +
      `${formatBytes(total.raw)} raw / ${formatBytes(total.gzip)} gzip`
  );
}

await stat('dist/index.html');
