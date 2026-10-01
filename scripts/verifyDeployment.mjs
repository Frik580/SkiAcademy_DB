import { spawnSync } from 'node:child_process';
import { systemCaAlreadyEnabled } from './deploymentProvenance.mjs';
import {
  parseVerifyArgv,
  printVerificationLines,
  runVerification,
} from './deploymentVerification.mjs';

if (!systemCaAlreadyEnabled(process.execArgv, process.env)) {
  const probe = spawnSync(process.execPath, ['--use-system-ca', '-e', 'process.exit(0)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (probe.status === 0) {
    const child = spawnSync(
      process.execPath,
      ['--use-system-ca', ...process.execArgv, process.argv[1], ...process.argv.slice(2)],
      { stdio: 'inherit', windowsHide: true }
    );
    process.exit(child.status === null ? 1 : child.status);
  }
}

const parsed = parseVerifyArgv(process.argv);
if (parsed.error) {
  console.error(parsed.error);
  process.exit(2);
}

const result = await runVerification({
  argvMode: parsed.mode,
  environment: parsed.environment,
  target: parsed.target,
  onlyFunctionNames: parsed.onlyFunctionNames,
});

printVerificationLines(result.lines ?? []);
if (result.error) {
  console.error(result.error);
}
process.exit(result.exitCode ?? 1);
