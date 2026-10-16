import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

import { E2E_ADMIN_PORT, E2E_FIXED_NOW, E2E_PORT, E2E_STATIC_DIR, getE2eDatabaseUrl } from "./e2e/support/env";

/**
 * E2E テスト（pnpm test:e2e = e2e/prepare.ts → playwright test）。
 * - 公開ページ（public, mobile）: デモデータで静的ビルドした .e2e/out を、本番の CloudFront と同じ URL 処理を
 *   再現する静的サーバー（scripts/serve-static.mjs）で配信してテストする。時計はビルド時に固定している
 * - 管理画面（admin）: 開発サーバー（next dev）を E2E 専用 DB に接続し、時計を MIRURIKU_FIXED_NOW で固定する
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
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${E2E_ADMIN_PORT}` },
    },
  ],
  webServer: [
    {
      command: `node scripts/serve-static.mjs ${E2E_STATIC_DIR} ${E2E_PORT}`,
      url: `http://localhost:${E2E_PORT}/`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next dev --port ${E2E_ADMIN_PORT}`,
      // DB に依存しないヘルスチェックで起動を待つ
      url: `http://localhost:${E2E_ADMIN_PORT}/api/health`,
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
  ],
});
