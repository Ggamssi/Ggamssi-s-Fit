import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('./node_modules/.cache/playwright', import.meta.url))

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    env: { VITE_SUPABASE_URL: 'https://auth-disabled-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_auth_disabled_test' },
    reuseExistingServer: false,
  },
})
