import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Live network checks; run with `npm run test:live` (GitHub Actions does this daily).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['live/**/*.test.ts'], environment: 'node', sequence: { concurrent: false }, fileParallelism: false },
});
