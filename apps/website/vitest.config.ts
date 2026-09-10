import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Resolve the "@/..." path alias (matching tsconfig) so component/unit tests can
// import app modules. Environment defaults to node; component tests opt into
// jsdom via a per-file `// @vitest-environment jsdom` pragma.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  // Automatic JSX runtime (matches Next) so component tests need no React import.
  // Vitest 4 transforms with oxc; tsconfig says `jsx: preserve` for Next, which
  // oxc would otherwise follow and leave JSX unparsed.
  oxc: { jsx: { runtime: 'automatic' } },
});
