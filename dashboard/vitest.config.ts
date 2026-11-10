import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Fixed timezone so date/time helpers behave the same on every machine.
// Inherited by Vitest's worker processes.
process.env.TZ = 'America/Chicago'

export default defineConfig({
  // Leave absolute asset URLs like <img src="/nav-logo.png"> alone. They're
  // served from public/ in the browser and have no module to import in tests.
  plugins: [vue({ template: { transformAssetUrls: { includeAbsolute: false } } })],
  // Point env loading at tests/ (which has no .env files) so the real
  // dashboard/.env — prod Supabase credentials — is never read by tests.
  envDir: fileURLToPath(new URL('./tests', import.meta.url)),
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    env: {
      // Not a real host. MSW intercepts every request to it, and anything
      // unmocked fails the test (see tests/setup.ts).
      VITE_SUPABASE_URL: 'http://supabase.test',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    // Tests that reload modules create a fresh Supabase client each time;
    // GoTrue's "multiple instances" warning is expected noise there.
    onConsoleLog: log => !log.includes('Multiple GoTrueClient instances'),
    restoreMocks: true,
    unstubGlobals: true,
  },
})
