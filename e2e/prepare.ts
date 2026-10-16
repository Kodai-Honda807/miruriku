/**
 * E2E の準備（playwright test の前に実行する。pnpm test:e2e）:
 *   1. E2E 用 DB にマイグレーションを適用し、全テーブルを空にして、基準日を固定したデモデータを投入
 *   2. 収集 CLI を固定ファイルモードで実行し、レビュー待ちの収集候補を作る（管理画面のテスト用）
 *   3. DB の公開中の大会を JSON に書き出し、それを使って公開サイトを静的ビルドする（.e2e/out）
 *      時計は NEXT_PUBLIC_MIRURIKU_FIXED_NOW でビルド時・ブラウザとも固定する
 *
 * Playwright は、公開ページを静的サーバー（本番の CloudFront と同じ URL 処理）で、管理画面を next dev で配信する。
 * E2E_SKIP_BUILD=1 なら 3 の静的ビルドを省く（テストだけを直して繰り返し実行するとき）。
 */
import "dotenv/config";

import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

import { seedDemoData } from "../prisma/demo-seed";
import { createPrismaClient } from "../src/lib/prisma";
import { E2E_BASE_DATE, E2E_FIXED_NOW, E2E_PUBLIC_DATA_FILE, E2E_STATIC_DIR, getE2eDatabaseUrl } from "./support/env";

async function main() {
  const url = getE2eDatabaseUrl();
  const env = { ...process.env, DATABASE_URL: url };

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { env, stdio: "inherit" });

  const prisma = createPrismaClient(url);
  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ExtractionCandidate", "CollectionRun", "BroadcastSlot", "EventSession", "Source", "Event", "EventSeries" RESTART IDENTITY CASCADE',
    );
    await seedDemoData(prisma, { baseDate: E2E_BASE_DATE });
  } finally {
    await prisma.$disconnect();
  }

  execFileSync(
    "pnpm",
    ["collect", "--event", "demo-city-marathon", "--fetch", "fixture", "--provider", "rule-based"],
    { env, stdio: "inherit" },
  );

  if (process.env.E2E_SKIP_BUILD === "1" && existsSync(`${E2E_STATIC_DIR}/index.html`)) {
    console.log(`E2E_SKIP_BUILD=1: 既存の静的ビルド（${E2E_STATIC_DIR}）を使います`);
    return;
  }

  execFileSync(
    "pnpm",
    ["exec", "tsx", "--conditions=react-server", "scripts/export-public-data.ts", E2E_PUBLIC_DATA_FILE],
    { env, stdio: "inherit" },
  );

  rmSync(E2E_STATIC_DIR, { recursive: true, force: true });
  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_DIST_DIR: E2E_STATIC_DIR,
    MIRURIKU_PUBLIC_DATA_FILE: E2E_PUBLIC_DATA_FILE,
    NEXT_PUBLIC_MIRURIKU_FIXED_NOW: E2E_FIXED_NOW,
    NEXT_PUBLIC_DISABLE_ANALYTICS: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  // ビルドは DB に接続しない（接続先を渡さない）
  delete buildEnv.DATABASE_URL;
  execFileSync("pnpm", ["exec", "next", "build"], { env: buildEnv, stdio: "inherit" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
