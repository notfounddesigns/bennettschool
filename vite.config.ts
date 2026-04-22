import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        timeclock: 'timeclock.html',
      },
      external: (id) => id.includes('full-sync') || id.includes('hours-export'),
    },
  },
});
