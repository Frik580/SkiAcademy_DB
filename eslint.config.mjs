import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'functions/lib',
      'node_modules',
      '.firebase',
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
              group: ['**/features/{admin,auth,chat,notifications,profile,settings,shell,wallet}/**'],
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
    files: ['src/features/admin/**/*.{ts,tsx}', 'src/features/profile/**/*.{ts,tsx}', 'src/features/notifications/**/*.{ts,tsx}'],
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
    files: ['src/features/auth/**/*.{ts,tsx}', 'src/features/chat/**/*.{ts,tsx}', 'src/features/settings/**/*.{ts,tsx}', 'src/features/wallet/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/{admin,bookings,chat,courses,errors,notifications,profile,settings,shell,wallet}/**'],
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
              group: ['**/features/{admin,auth,bookings,chat,courses,errors,notifications,profile,settings,wallet}/**'],
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
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**'],
              message: 'Shared UI must stay feature-agnostic; pass data and callbacks through props instead.',
            },
          ],
        },
      ],
    },
  },
  prettier
);
