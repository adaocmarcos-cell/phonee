import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — testes E2E, a11y e regressão visual.
 * - Em CI usa `bun run preview` na porta 4173 (build estável).
 * - Localmente assume dev server em http://localhost:8080 (Vite).
 */
const isCI = !!process.env.CI;
const PORT = isCI ? 4173 : 8080;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1800 } } },
    { name: "chromium-tablet",  use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "chromium-mobile",  use: { ...devices["Pixel 5"] } },
  ],
  webServer: isCI
    ? {
        command: "bun run build && bunx vite preview --port 4173 --strictPort",
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : {
        command: "echo 'using existing dev server'",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 5_000,
      },
});