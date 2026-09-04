import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ADR 0007 (RS-P0-1): every production build swaps the local continuity
// bridge for a route-free stub, so the deployable graph cannot contain legacy
// provider routes. Only the dev server (mode "development", used with the
// local Flask bridge) keeps the real adapter through the same entry.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // ADR 0002: the nested WebLLM engine worker code-splits its bundle, which
  // requires ES module worker output instead of the IIFE default.
  worker: {
    format: 'es'
  },
  resolve: mode !== 'development'
    ? { alias: [{ find: './nytApi', replacement: path.resolve(import.meta.dirname, 'src/nytApi.releaseStub.ts') }] }
    : undefined,
  server: {
    proxy: {
      '/crossword_by_date': 'http://127.0.0.1:5001',
      '/random_crossword': 'http://127.0.0.1:5001'
    }
  },
  build: {
    target: 'es2022',
    // Emit the exact build manifest so the service worker can precache every
    // hashed artifact of the promoted build (ADR 0006).
    manifest: true
  }
}));