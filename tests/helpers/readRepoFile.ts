import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Read a workspace file by repo-relative path. Avoids `import.meta.url` + `file:` scheme issues in Vitest. */
export function readRepoFile(relativeFromRepoRoot: string): string {
  return readFileSync(resolve(process.cwd(), relativeFromRepoRoot), 'utf8');
}
