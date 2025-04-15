import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a compatibility layer for ESLint 8.x configurations
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  // Ignore patterns (replaces .eslintignore)
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.git/**',
      '**/*.js',
      '!eslint.config.js'
    ]
  },
  // Use the compatibility layer to convert ESLint 8.x configurations
  ...compat.config({
    extends: [
      'plugin:@typescript-eslint/recommended',
      'plugin:prettier/recommended',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // Custom rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off', // Temporarily disabled
      '@typescript-eslint/no-unused-vars': ['off', { 'argsIgnorePattern': '^_' }], // Temporarily disabled
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'prettier/prettier': 'warn',
    },
    overrides: [
      {
        // Disable some rules for test files
        files: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
        rules: {
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/no-unused-vars': 'off'
        }
      }
    ],
  }),
];
