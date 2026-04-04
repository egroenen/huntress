import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
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
