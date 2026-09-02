import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/crossword_by_date': 'http://127.0.0.1:5001',
      '/random_crossword': 'http://127.0.0.1:5001'
    }
  },
  build: {
    target: 'es2022'
  }
});
