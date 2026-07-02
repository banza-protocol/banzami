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
  esbuild: { jsx: 'automatic' },
});
