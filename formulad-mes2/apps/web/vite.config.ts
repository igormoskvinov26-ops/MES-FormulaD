import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(process.env.VITE_BUILD_HASH ?? 'dev'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react()],
  server: {
    port: 5173,
    // Vite проксирует /api на локальный .NET API (dev-режим, только loopback).
    proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
