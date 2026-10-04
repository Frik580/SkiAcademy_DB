// @vitest-environment node
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('../../', import.meta.url)) });
const boundaryRules = new Set([
  'no-restricted-imports',
  'feature-boundaries/no-feature-component-internals',
]);

async function violations(filePath: string, importPath: string) {
  const [result] = await eslint.lintText(`import { capability } from '${importPath}';\n`, {
    filePath,
  });
  return result.messages.filter((message) => boundaryRules.has(message.ruleId ?? ''));
}

describe('official startup feature public subpaths', () => {
  it.each([
    ['src/app/components/Navbar.tsx', '../../features/student-cabinet/navbar'],
    ['src/app/AppBootstrap.tsx', '../features/profile/runtime'],
    ['src/app/AppShell.tsx', '../features/auth/session'],
    ['src/app/routes/HomeRouteContainer.tsx', '../../features/profile/instructors'],
  ])('allows the public API %s → %s', async (filePath, importPath) => {
    expect(await violations(filePath, importPath)).toEqual([]);
  });

  it.each([
    '../../features/student-cabinet/useNavbarParticipantSwitcher',
    '../../features/student-cabinet/components/CabinetParticipantAvatarSwitcher',
    '../../features/student-cabinet/components/student/StudentCabinetShell',
    '../../features/student-cabinet/navbar/internal',
    '../../features/profile/profileStore',
    '../../features/profile/runtime/internal',
    '../../features/auth/authStore',
    '../../features/auth/session/internal',
  ])('continues to reject internal app import %s', async (importPath) => {
    const errors = await violations('src/app/components/Navbar.tsx', importPath);
    expect(errors.map((error) => error.ruleId)).toContain('no-restricted-imports');
  });

  it('keeps the component boundary rule enabled for route composition', async () => {
    const errors = await violations(
      'src/app/routes/HomeRouteContainer.tsx',
      '../../features/profile/components/InstructorCard'
    );
    expect(errors.map((error) => error.ruleId)).toContain(
      'feature-boundaries/no-feature-component-internals'
    );
  });
});
