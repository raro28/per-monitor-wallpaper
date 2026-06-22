import gjs from 'eslint-plugin-gjs';

export default [
  gjs.configs.recommended,
  { files: ['src/**/*.ts'], languageOptions: { ecmaVersion: 2022, sourceType: 'module' } },
  { ignores: ['dist/', '.test-build/', 'node_modules/'] },
];
