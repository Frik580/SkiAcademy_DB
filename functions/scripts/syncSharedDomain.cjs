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
const manifestPath = path.join(packageDirectory, 'package.json');
const manifest = `${JSON.stringify(
  {
    name: '@ski-academy/shared-domain',
    version: '0.1.0',
    private: true,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.js',
        default: './dist/index.js',
      },
      './entities': {
        types: './dist/entities.d.ts',
        import: './dist/entities.js',
        require: './dist/entities.js',
        default: './dist/entities.js',
      },
      './testing': {
        types: './dist/testing/index.d.ts',
        import: './dist/testing/index.js',
        require: './dist/testing/index.js',
        default: './dist/testing/index.js',
      },
    },
    dependencies: { zod: '^4.6.6' },
  },
  null,
  2
)}\n`;
// Preserve checkout bytes (including CRLF) when only line endings differ.
const existing = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
if (existing?.replace(/\r\n/g, '\n') !== manifest) {
  fs.writeFileSync(manifestPath, manifest);
}
