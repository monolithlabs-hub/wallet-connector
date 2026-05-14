import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'pnpm-lock.yaml',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['packages/*/tsconfig.json'],
          noWarnOnMultipleProjects: true,
        },
        node: true,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
      // TASK-701 security audit — ban `Math.random` outright. Anywhere we
      // need randomness (keypairs, nonces, IDs) we must use a CSPRNG
      // (`crypto.getRandomValues`, `crypto.randomUUID`, or `nacl.randomBytes`,
      // which delegates to the platform CSPRNG). Tests opt out below.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            'Math.random is not cryptographically secure. Use crypto.getRandomValues, crypto.randomUUID, or nacl.randomBytes for any value tied to security (keypairs, nonces, session ids, IVs).',
        },
      ],
    },
  },

  {
    files: ['packages/react/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.flat?.recommended?.rules,
      ...reactPlugin.configs.flat?.['jsx-runtime']?.rules,
      ...reactHooks.configs.recommended?.rules,
    },
  },

  {
    files: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Tests may need Math.random for shuffling fixtures, picking sample
      // indexes, etc. — the security-sensitive guarantee is about
      // production code only.
      'no-restricted-syntax': 'off',
    },
  },

  prettier,
)
