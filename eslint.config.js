import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/dev-dist/**',
      'apps/api/prisma/migrations/**',
      'apps/api/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Бүх TypeScript файлд нийтлэг дүрэм
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      // CSV/BOM (U+FEFF) нь template literal дотор зориуд ордог
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
    },
  },

  // Node-д зориулсан скриптүүд (.mjs)
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Хуваалцсан багц — орчноос хамаарахгүй, зөвхөн стандарт JS API
  {
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'shared багц браузераас хамаарах ёсгүй.' },
        { name: 'document', message: 'shared багц браузераас хамаарах ёсгүй.' },
        { name: 'process', message: 'shared багц Node-оос хамаарах ёсгүй.' },
      ],
    },
  },

  // API — Node орчин
  {
    files: ['apps/api/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // Web — браузер орчин + React
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Context provider-ууд нь компонент + hook хоёуланг нь экспортлодог нь
  // зориудынх — fast-refresh-ийн анхааруулга энд хамаарахгүй.
  {
    files: [
      'apps/web/src/App.tsx',
      'apps/web/src/i18n/index.tsx',
      'apps/web/src/components/ui/toast.tsx',
      'apps/web/src/lib/auth.tsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },

  // Тест файлууд
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Тохиргооны файлууд
  {
    files: ['**/*.config.{js,ts,mjs,cjs}', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },

  prettier,
);
