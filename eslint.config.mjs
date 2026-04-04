import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: currentDirectory,
});

export default defineConfig([
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
  }),
  globalIgnores([
    '.codex',
    '.sfdx/**',
    '.next/**',
    'dist/**',
    'coverage/**',
    'node_modules/**',
    'next-env.d.ts',
  ]),
]);
