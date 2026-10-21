import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/generated/**', '**/next-env.d.ts', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{js,mjs}'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly', Buffer: 'readonly', AbortSignal: 'readonly' } } },
  { files: ['**/*.{ts,tsx}'], rules: { '@typescript-eslint/consistent-type-imports': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  prettier,
);
