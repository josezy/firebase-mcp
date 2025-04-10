module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    // Add custom rules here
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
};
