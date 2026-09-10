import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// "@/..." resolves as in tsconfig. Environment defaults to node; component
// tests opt into jsdom with a `// @vitest-environment jsdom` pragma. Vitest 4
// transforms with oxc, which would follow tsconfig's `jsx: preserve` (Next)
// and leave JSX unparsed — so the automatic runtime is set here.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
  oxc: { jsx: { runtime: 'automatic' } },
});
