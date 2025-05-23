import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [], // We can add setup files later if needed
    include: ['src/crossword/static/tests/**/*.test.js'], // Path to your test files
    deps: {
      inline: ['vue'] // Ensure Vue is processed by Vite
    },
    server: {
        deps: {
            inline: ['vue']
        }
    },
    coverage: {
        provider: 'v8', // or 'istanbul'
        reporter: ['text', 'json', 'html'],
    }
  },
}); 