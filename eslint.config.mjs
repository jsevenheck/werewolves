import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // Prettier integration (must be last)
  prettier,

  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/dist-lib/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/test-results/**',
      '**/game-export/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
      '**/*.config.cjs',
      '**/*.cjs',
    ],
  },

  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Server files - Node.js environment
  {
    files: ['server/**/*.ts', 'standalone-server/**/*.ts', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off', // Allow require() in CommonJS
      'no-unsafe-finally': 'warn', // Downgrade to warning
    },
  },

  // Vue files - Browser environment
  {
    files: ['**/*.vue', 'ui-vue/**/*.ts', 'standalone-web/**/*.ts'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        localStorage: 'readonly',
      },
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      'vue/attributes-order': 'warn', // Downgrade to warning
      'no-unsafe-finally': 'warn', // Downgrade to warning (legitimate pattern in some cases)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Test files - relaxed rules
  {
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts', '**/e2e/**'],
    languageOptions: {
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
