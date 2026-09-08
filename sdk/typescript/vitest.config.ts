import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // webhooks.ts imports its crypto through the "#node-crypto" subpath, so a
      // browser bundler can substitute a stub for the Node built-in. That map
      // lives in package.json and resolves to dist/, which is correct for a
      // consumer and wrong here: these tests run against src/, and in CI there
      // is no dist/ to resolve to —
      //
      //   Cannot find module '#node-crypto' imported from src/webhooks.ts
      //
      // It passed locally only because a previous build had left dist/ behind.
      // Point the source tests at the source module.
      '#node-crypto': fileURLToPath(new URL('./src/internal/node-crypto.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
