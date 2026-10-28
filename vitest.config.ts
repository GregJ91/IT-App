import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    globalSetup: ["tests/unit/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/ithub_test",
      UPLOAD_DIR: "./test-results/uploads",
      APP_URL: "http://localhost:3000",
      ALLOWED_EMAIL_DOMAINS: "gardenersdream.co.uk",
    },
    fileParallelism: false,
  },
});
