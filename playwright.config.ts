import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

import { E2E_FIXED_NOW, E2E_PORT, getE2eDatabaseUrl } from "./e2e/support/env";

/**
 * E2E テスト。
 * - E2E 専用 DB（E2E_DATABASE_URL、名前が _e2e で終わるもの）を毎回初期化し、
 *   基準日を固定したデモデータと、固定ファイルによる収集候補を用意する（e2e/global-setup.ts）
 * - 管理画面を使うため `next dev`（NODE_ENV=development）で起動し、時計を MIRURIKU_FIXED_NOW で固定する
 * - 公開ページのテスト（public, mobile）が終わってから、データを書き換える管理画面のテスト（admin）を実行する
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "public",
      testMatch: /public\/.*\.spec\.ts/,
      testIgnore: /public\/mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testMatch: /public\/mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ["public", "mobile"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${E2E_PORT}`,
    // DB に依存しないヘルスチェックで起動を待つ（DB の初期化は global-setup で行う）
    url: `http://localhost:${E2E_PORT}/api/health`,
    // 誤って開発用 DB に接続した既存サーバーを使わないよう、常に新しく起動する
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: getE2eDatabaseUrl(),
      MIRURIKU_ADMIN_ENABLED: "true",
      MIRURIKU_FIXED_NOW: E2E_FIXED_NOW,
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
