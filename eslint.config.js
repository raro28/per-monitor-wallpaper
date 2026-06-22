import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', '.test-build/', 'node_modules/'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // GJS ambient globals used by the runtime modules.
        log: 'readonly',
        logError: 'readonly',
        globalThis: 'readonly',
        TextDecoder: 'readonly',
      },
    },
  },
);
