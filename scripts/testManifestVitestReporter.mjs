import { JsonReporter } from 'vitest/reporters';

// Parameterized tests may intentionally share a title. Preserve Vitest's own
// deterministic project/module/test-order identity instead of treating names as IDs.
export default class ManifestJsonReporter extends JsonReporter {
  constructor() {
    super({});
  }
  async onTestRunEnd(modules) {
    for (const module of modules) {
      for (const test of module.children.allTests()) test.meta().carveTestId = test.id;
    }
    await super.onTestRunEnd(modules);
  }
}
