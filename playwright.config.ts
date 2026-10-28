import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/ithub_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 120_000,
    env: {
      DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-123",
      ALLOWED_EMAIL_DOMAINS: "gardenersdream.co.uk",
      UPLOAD_DIR: "./test-results/e2e-uploads",
      SMTP_HOST: "",
      SLACK_API_BASE: "http://localhost:3199/api",
      SLACK_BOT_TOKEN: "xoxb-test-token",
      SLACK_CHANNEL: "C0ITJOBS",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
