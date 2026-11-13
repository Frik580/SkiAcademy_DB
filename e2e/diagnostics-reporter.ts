import type {
  Reporter,
  TestCase,
  TestResult,
  FullResult,
  TestStep,
} from '@playwright/test/reporter';
import { diagnose } from '../scripts/e2eDiagnostics.mjs';

export default class DiagnosticsReporter implements Reporter {
  onBegin() {
    diagnose('tests:begin');
  }
  onTestBegin(test: TestCase, result: TestResult) {
    diagnose('test:begin', {
      test: test.titlePath(),
      file: test.location.file,
      retry: result.retry,
      worker: result.workerIndex,
    });
  }
  onStepBegin(test: TestCase, result: TestResult, step: TestStep) {
    if (step.category === 'hook')
      diagnose('hook:begin', { test: test.title, hook: step.title, retry: result.retry });
  }
  onTestEnd(test: TestCase, result: TestResult) {
    diagnose('test:end', {
      test: test.titlePath(),
      retry: result.retry,
      status: result.status,
      durationMs: result.duration,
    });
  }
  onEnd(result: FullResult) {
    diagnose('tests:end', { status: result.status });
  }
  onExit() {
    diagnose('playwright-reporter:exit');
  }
}
