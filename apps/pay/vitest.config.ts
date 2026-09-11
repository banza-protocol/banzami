import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Resolve the "@/..." path alias (matching tsconfig). Environment is node; the
// tests here cover the page logic, not rendering.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  oxc: { jsx: { runtime: 'automatic' } },
});
