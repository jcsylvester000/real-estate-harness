import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

/** One production server on in-memory Postgres (PGlite) with the keyless Demo AI provider. No network. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", testIgnore: /mobile/, use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } } },
    { name: "mobile", testMatch: /mobile/, use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
  webServer: {
    command: `npx next start -p ${port}`,
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DB_DRIVER: "pglite",
      ALLOW_PGLITE: "true",
      PGLITE_SEED_ADMIN: "e2e_admin:admin pass phrase for tests",
      PGLITE_SEED_DEMO: "true",
      APP_SECRET: "e2e-secret-e2e-secret-e2e-secret-0001",
      APP_ORIGIN: `http://localhost:${port}`,
      HARNESS_DEMO_PROVIDER: "true",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: "",
    },
  },
});
