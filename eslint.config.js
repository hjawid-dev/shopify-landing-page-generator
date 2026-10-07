import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['out/'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  // The page script runs in the customer's browser, as a classic script.
  { files: ['src/page.client.js'], languageOptions: { sourceType: 'script', globals: globals.browser } },
];
