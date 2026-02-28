import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },

  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  }
]