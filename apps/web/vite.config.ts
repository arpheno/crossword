import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // ADR 0002: the nested WebLLM engine worker code-splits its bundle, which
  // requires ES module worker output instead of the IIFE default.
  worker: {
    format: 'es'
  },
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
});