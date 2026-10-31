import { resolve } from 'node:path';
// Machine-readable Node test results, alongside the built-in human-readable reporter.
export default async function* reporter(source) {
  const tests = [];
  let failed = 0;
  for await (const { type, data } of source) {
    if (type === 'test:fail') failed++;
    if ((type === 'test:pass' || type === 'test:fail') && data.details?.type === 'test') {
      // Node emits a passing file-wrapper test for a module with no tests.
      if (data.file && resolve(data.name) === resolve(data.file)) continue;
      tests.push({
        file: data.file,
        title: `${data.line}:${data.column} ${data.name}`,
        status: data.skip
          ? 'skipped'
          : data.todo
            ? 'todo'
            : type === 'test:pass'
              ? 'passed'
              : 'failed',
      });
    }
  }
  yield JSON.stringify({ tests, failed });
}
