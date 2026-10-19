import { PassThrough, Writable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { authorize, phrase, preflight } = require('../scripts/data-reset/authorization.cjs');

// This IO seam is rejected by the adapter for every non-demo target.
export async function approveResetOperation(
  ports: object,
  manifest: { sha256: string },
  operation = 'reset',
  answer?: string
) {
  const evidence = await preflight(ports, manifest, manifest.sha256, operation);
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, done) {
        if (chunk.toString().includes('\n> '))
          process.nextTick(() => input.write(`${answer ?? phrase(evidence)}\n`));
        done();
      },
    }),
    { isTTY: true }
  );
  return authorize(ports, manifest, manifest.sha256, operation, { input, output });
}
