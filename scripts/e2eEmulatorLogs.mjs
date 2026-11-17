import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';
import { diagnose } from './e2eDiagnostics.mjs';

const MAX_LOG_BYTES = 8 * 1024 * 1024;
const MAX_LINE_CHARS = 64 * 1024;
const LIMIT_MARKER = '[emulator log size limit reached; remaining output omitted]\n';
const SENSITIVE =
  /password|passwd|secret|token|credential|authorization|cookie|api[_-]?key|private[_ -]?key|oobCode|bearer\s/i;

function lineWriter(path, secretValues) {
  let bytes = 0;
  let disabled = false;
  let pending = '';
  let droppingLine = false;
  let privateKey = false;
  const decoder = new StringDecoder('utf8');
  const failed = (error) => {
    disabled = true;
    // Never include raw error messages or output in diagnostic events.
    diagnose('emulator-log:write-failed', { code: error.code });
  };
  try {
    writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    failed(error);
  }
  const append = (line) => {
    if (disabled) return;
    line = stripVTControlCharacters(line);
    const startsKey = /-----BEGIN .*PRIVATE KEY-----/.test(line);
    const endsKey = /-----END .*PRIVATE KEY-----/.test(line);
    const sensitive =
      privateKey ||
      startsKey ||
      SENSITIVE.test(line) ||
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/.test(line) ||
      secretValues.some((value) => line.includes(value));
    privateKey = (privateKey || startsKey) && !endsKey;
    const safe = sensitive ? '[redacted sensitive emulator output]\n' : `${line}\n`;
    try {
      const size = Buffer.byteLength(safe);
      if (bytes + size + Buffer.byteLength(LIMIT_MARKER) > MAX_LOG_BYTES) {
        appendFileSync(path, LIMIT_MARKER);
        disabled = true;
        diagnose('emulator-log:truncated', {
          stream: path.endsWith('.stdout.log') ? 'stdout' : 'stderr',
        });
        return;
      }
      appendFileSync(path, safe);
      bytes += size;
    } catch (error) {
      failed(error);
    }
  };
  const consume = (text) => {
    if (disabled) return;
    // Buffer complete lines so secrets split across chunks remain detectable.
    if (droppingLine || pending.length + text.length > MAX_LINE_CHARS) {
      pending = '';
      droppingLine = true;
    } else {
      pending += text;
    }
  };
  const pushText = (text) => {
    if (disabled) return;
    let offset = 0;
    for (;;) {
      const end = text.indexOf('\n', offset);
      consume(text.slice(offset, end < 0 ? undefined : end));
      if (end < 0) return;
      if (droppingLine) {
        // An oversized line may contain a multi-line key; stop file capture
        // conservatively instead of recording its remaining fragments.
        append('[oversized emulator output line omitted; capture stopped]');
        disabled = true;
        return;
      }
      append(pending.replace(/\r$/, ''));
      pending = '';
      offset = end + 1;
    }
  };
  return {
    write: (chunk) => pushText(decoder.write(chunk)),
    finish: () => {
      pushText(decoder.end());
      if (droppingLine) append('[oversized emulator output line omitted]');
      else if (pending) append(pending);
      disabled = true;
    },
  };
}

export function captureEmulatorLogs(child, directory, env) {
  try {
    mkdirSync(directory, { recursive: true });
  } catch (error) {
    diagnose('emulator-log:directory-failed', { code: error.code });
  }
  const secretValues = Object.entries(env)
    .filter(([key, value]) => SENSITIVE.test(key) && value)
    .flatMap(([, value]) => [
      value,
      JSON.stringify(value).slice(1, -1),
      ...value.replaceAll('\\r\\n', '\n').replaceAll('\\n', '\n').split(/\r?\n/),
    ])
    .filter(Boolean);
  console.log(
    `Emulator logs: ${join(directory, `emulator-${child.pid}.*.log`)} (8 MiB per stream; sensitive lines redacted)`
  );
  const writers = ['stdout', 'stderr'].map((stream) => {
    const writer = lineWriter(join(directory, `emulator-${child.pid}.${stream}.log`), secretValues);
    child[stream].pipe(process[stream], { end: false });
    child[stream].on('data', writer.write);
    return writer;
  });
  return () => writers.forEach((writer) => writer.finish());
}
