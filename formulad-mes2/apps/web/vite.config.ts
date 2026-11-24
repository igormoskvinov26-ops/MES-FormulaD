import { execSync } from 'child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const commit = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'dev'; }
})();

export default defineConfig({
  define: { __COMMIT__: JSON.stringify(commit) },
  plugins: [react()],
  build: { outDir: '../../src/FormulaD.Mes.Api/wwwroot', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts', 'src/main.tsx'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { lines: 80, statements: 80, branches: 78, functions: 58 },
    },
  },
});
