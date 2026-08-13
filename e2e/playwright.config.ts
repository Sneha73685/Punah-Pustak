import { defineConfig, devices } from "@playwright/test";

/**
 * SRS §18.2/TEST-011: the three critical-path E2E flows, run against the
 * project's own Docker Compose stack (see README.md in this directory) —
 * never against Vercel/Render/production data. This suite does not start
 * the stack itself (no `webServer` block): bringing up `docker compose`,
 * applying migrations, and waiting for readiness are all already handled
 * by the stack's own existing entrypoint (`backend/docker-entrypoint.sh`)
 * and `scripts/wait-for-stack.sh` in this directory — duplicating that
 * here would just be a second, divergent copy of the same logic.
 *
 * Chromium only (BROWSER SCOPE instruction) — no multi-browser matrix yet.
 * `workers: 1` is deliberate, not a performance default: every test in
 * this suite shares one backend process's in-memory, per-IP rate limiter
 * (SEC-040) and the same Postgres database, so running specs serially
 * avoids both flaky 429s from concurrent auth calls and ordering
 * assumptions (e.g. "the listing I just created is on page 1 of the admin
 * table") breaking under interleaved test data.
 */
const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "on-failure", outputFolder: "playwright-report" }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
