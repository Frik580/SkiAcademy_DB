import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

const featureBoundaryPlugin = {
  rules: {
    'no-broad-component-context': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow broad feature contexts in presentational components.',
        },
        schema: [],
        messages: {
          broadContext:
            'Import a focused *Input contract from the feature contracts module instead of {{name}}.',
        },
      },
      create(context) {
        const sourceFilename = context.filename.replaceAll('\\', '/');
        const isStudentComponent = sourceFilename.includes(
          '/src/features/student-cabinet/components/student/'
        );

        return {
          ImportDeclaration(node) {
            if (!isStudentComponent || !node.source.value.endsWith('/StudentCabinetHome')) return;

            for (const specifier of node.specifiers) {
              if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported.name === 'StudentCabinetContext'
              ) {
                context.report({
                  node: specifier,
                  messageId: 'broadContext',
                  data: { name: 'StudentCabinetContext' },
                });
              }
            }
          },
        };
      },
    },
    'no-direct-language-hook-in-child': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require feature translation hooks in presentational child components.',
        },
        schema: [],
        messages: {
          directLanguageHook:
            'Use the feature translation hook instead of importing useLanguage() directly in a child component.',
        },
      },
      create(context) {
        const sourceFilename = context.filename.replaceAll('\\', '/');
        const isScopedComponent =
          sourceFilename.includes('/src/features/student-cabinet/components/student/') ||
          sourceFilename.includes('/src/features/admin/components/schedule/');
        const legacyFiles = new Set([
          'BookingCallCoachButton.tsx',
          'BookInstructorPickerModal.tsx',
          'HistoryLessonCard.tsx',
          'StudentBookNextFab.tsx',
          'StudentCabinetUI.tsx',
          'StudentCoachPanel.tsx',
          'StudentHistoryList.tsx',
          'StudentHistoryPanel.tsx',
          'StudentHomeBottomSections.tsx',
          'StudentNeedsAttention.tsx',
          'StudentNextStepCard.tsx',
          'StudentProfilePersonalSection.tsx',
          'StudentProfilePreferencesSection.tsx',
          'StudentTodayTasksBlock.tsx',
          'StudentWalletHistoryList.tsx',
          'ScheduleSlotActionModal.tsx',
          'ActiveSlotCreateForm.tsx',
          'ActiveSlotDetails.tsx',
          'ActiveSlotMoveForm.tsx',
        ]);
        const filename = sourceFilename.split('/').at(-1);

        return {
          ImportDeclaration(node) {
            if (
              !isScopedComponent ||
              legacyFiles.has(filename) ||
              (filename?.startsWith('use') && filename.endsWith('Translations.ts')) ||
              node.source.value !== '../../../../app/providers/LanguageContext'
            )
              return;

            for (const specifier of node.specifiers) {
              if (
                specifier.type === 'ImportSpecifier' &&
                specifier.imported.name === 'useLanguage'
              ) {
                context.report({ node: specifier, messageId: 'directLanguageHook' });
              }
            }
          },
        };
      },
    },
    'no-feature-component-internals': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow imports into another feature module’s component internals.',
        },
        schema: [],
        messages: {
          featureComponentInternal:
            'Import {{feature}} capabilities from its public API (features/{{feature}}).',
        },
      },
      create(context) {
        const sourceFilename = context.filename.replaceAll('\\', '/');
        const sourceFeature = sourceFilename.match(/\/src\/features\/([^/]+)\//)?.[1];

        const checkImport = (node, source) => {
          if (typeof source.value !== 'string') return;

          const targetFeature = source.value.match(
            /(?:^|\/)features\/([^/]+)\/components(?:\/|$)/
          )?.[1];
          if (!targetFeature || targetFeature === sourceFeature) return;

          context.report({
            node,
            messageId: 'featureComponentInternal',
            data: { feature: targetFeature },
          });
        };

        return {
          ImportDeclaration(node) {
            checkImport(node, node.source);
          },
          ImportExpression(node) {
            checkImport(node, node.source);
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'packages/*/dist',
      'functions/lib',
      'functions/shared-domain',
      'node_modules',
      '.firebase',
      '.cursor/**',
      '.codex/**',
      'coverage',
      'scripts/*.mjs',
      'e2e/**',
      'playwright.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactPlugin.configs.flat.recommended,
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['functions/scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, 'warn'])
      ),
      'prettier/prettier': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off', // TypeScript handles static prop type checking
      // React 18 DOM does not recognize fetchPriority; lowercase fetchpriority is the valid HTML attribute.
      'react/no-unknown-property': ['error', { ignore: ['fetchpriority'] }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Legacy UI still has explicit any usages; new feature and app code is stricter below.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*/**'],
              message: 'Import feature capabilities from its public API (features/<domain>).',
            },
            {
              group: ['**/features/shell/**'],
              message: 'Import shell capabilities from features/shell public API.',
            },
            {
              group: ['**/domain/*/*'],
              message: 'Import domain capabilities from their public API (domain/<domain>).',
            },
            {
              group: ['**/infrastructure/*/*'],
              message:
                'Import infrastructure capabilities from their public API (infrastructure/<provider>).',
            },
          ],
        },
      ],
    },
  },
  {
    // Route containers are application composition roots: they resolve state and actions
    // before handing narrow props to feature UI. Direct imports avoid Rollup barrel cycles.
    files: ['src/app/routes/*RouteContainer.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domain/*/*'],
              message: 'Import domain capabilities from their public API (domain/<domain>).',
            },
            {
              group: ['**/infrastructure/*/*'],
              message:
                'Import infrastructure capabilities from their public API (infrastructure/<provider>).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/bookings/**/*.{ts,tsx}', 'src/features/courses/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/features/{admin,auth,chat,notifications,profile,settings,shell,wallet}/**',
              ],
              message: 'Import other feature capabilities from their public API.',
            },
            {
              group: ['**/domain/*/*'],
              message: 'Import domain capabilities from their public API (domain/<domain>).',
            },
            {
              group: ['**/infrastructure/*/*'],
              message:
                'Import infrastructure capabilities from their public API (infrastructure/<provider>).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/student-cabinet/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/domain/*/*'],
              message: 'Import domain capabilities from their public API (domain/<domain>).',
            },
            {
              group: ['**/infrastructure/*/*'],
              message:
                'Import infrastructure capabilities from their public API (infrastructure/<provider>).',
            },
            {
              group: ['**/features/profile/components/**'],
              message: 'Import profile capabilities from features/profile public API.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/features/admin/**/*.{ts,tsx}',
      'src/features/profile/**/*.{ts,tsx}',
      'src/features/notifications/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/features/{auth,bookings,chat,courses,notifications,settings,shell,wallet}/**',
                '**/features/student-cabinet/components/**',
              ],
              message: 'Import other feature capabilities from their public API.',
            },
            {
              group: ['**/domain/*/*'],
              message: 'Import domain capabilities from their public API (domain/<domain>).',
            },
            {
              group: ['**/infrastructure/*/*'],
              message:
                'Import infrastructure capabilities from their public API (infrastructure/<provider>).',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/features/auth/**/*.{ts,tsx}',
      'src/features/chat/**/*.{ts,tsx}',
      'src/features/settings/**/*.{ts,tsx}',
      'src/features/wallet/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/features/{admin,bookings,chat,courses,errors,notifications,profile,settings,shell,wallet}/**',
              ],
              message: 'Import other feature capabilities from their public API.',
            },
            {
              group: ['**/domain/*/*'],
              message: 'Import domain capabilities from their public API (domain/<domain>).',
            },
            {
              group: ['**/infrastructure/*/*'],
              message:
                'Import infrastructure capabilities from their public API (infrastructure/<provider>).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/shell/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/features/{admin,auth,bookings,chat,courses,errors,notifications,profile,settings,wallet}/**',
              ],
              message: 'Import feature capabilities from their public API.',
            },
            {
              group: ['**/domain/*/*'],
              message: 'Import domain capabilities from their public API (domain/<domain>).',
            },
            {
              group: ['**/infrastructure/*/*'],
              message:
                'Import infrastructure capabilities from their public API (infrastructure/<provider>).',
            },
          ],
        },
      ],
    },
  },
  {
    // Migrated UI retains legacy warnings while feature services and app code stay strict.
    files: ['src/features/**/components/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // These components sit behind feature contracts; do not let broad domain models leak back in.
    files: [
      'src/features/admin/components/schedule/{ScheduleBookingCell,ScheduleTimetableCells}.tsx',
      'src/features/student-cabinet/components/student/{SkillRadarChart,StudentTodayProgressBlock,StudentTodaySessionBlocks}.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../../../../types',
              importNames: ['Booking', 'UserProfile', 'Course'],
              message:
                'Use the feature contracts module or a prepared view model in presentational components.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'feature-boundaries': featureBoundaryPlugin,
    },
    rules: {
      'feature-boundaries/no-broad-component-context': 'error',
      'feature-boundaries/no-direct-language-hook-in-child': 'error',
      'feature-boundaries/no-feature-component-internals': 'error',
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**'],
              message:
                'Shared UI must stay feature-agnostic; pass data and callbacks through props instead.',
            },
          ],
        },
      ],
    },
  },
  prettier
);
