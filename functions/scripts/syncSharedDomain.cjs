const fs = require('node:fs');
const path = require('node:path');

const functionsRoot = path.resolve(__dirname, '..');
const sourceDirectory = path.resolve(functionsRoot, '..', 'packages', 'shared-domain', 'dist');
const packageDirectory = path.join(functionsRoot, 'shared-domain');
const targetDirectory = path.join(packageDirectory, 'dist');

if (!fs.existsSync(sourceDirectory)) {
  throw new Error(`Shared-domain build output is missing: ${sourceDirectory}`);
}

fs.mkdirSync(packageDirectory, { recursive: true });
fs.cpSync(sourceDirectory, targetDirectory, { recursive: true, force: true });
fs.writeFileSync(
  path.join(packageDirectory, 'package.json'),
  `${JSON.stringify(
    {
      name: '@ski-academy/shared-domain',
      version: '0.1.0',
      private: true,
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      exports: {
        '.': { types: './dist/index.d.ts', require: './dist/index.js' },
        './entities': { types: './dist/entities.d.ts', require: './dist/entities.js' },
      },
      dependencies: { zod: '^4.4.3' },
    },
    null,
    2
  )}\n`
);
