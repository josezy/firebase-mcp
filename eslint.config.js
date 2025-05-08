// eslint.config.js
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  // Base configuration for all files
  {
    ignores: ['node_modules/**', 'dist/**', '**/*.test.ts', '**/__tests__/**'],
  },
  // Apply TypeScript recommended configuration
  ...tseslint.configs.recommended,
  // Add Prettier plugin
  {
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'semi': 'error',
      'prefer-const': 'error',
    },
  },
  // Apply Prettier's rules last to override other formatting rules
  eslintConfigPrettier,
];
