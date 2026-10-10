/**
 * E2E 用 DB の初期化:
 *   1. マイグレーション適用
 *   2. 全テーブルを空にして、基準日を固定したデモデータを投入
 *   3. 収集 CLI を固定ファイルモードで実行し、レビュー待ちの収集候補を作る
 *   4. 主要なルートに一度アクセスして、開発サーバーのコンパイルを済ませておく
 *      （初回アクセス時のコンパイル中にページ遷移が中断され、テストが不安定になるのを防ぐ）
 */
import "dotenv/config";

import { execFileSync } from "node:child_process";

import { seedDemoData } from "../prisma/demo-seed";
import { createPrismaClient } from "../src/lib/prisma";
import { E2E_BASE_DATE, E2E_PORT, getE2eDatabaseUrl } from "./support/env";

const WARM_UP_PATHS = ["/", "/events/demo-championships", "/admin/candidates"];

async function warmUp() {
  for (const path of WARM_UP_PATHS) {
    try {
      await fetch(`http://localhost:${E2E_PORT}${path}`, { signal: AbortSignal.timeout(120_000) });
    } catch {
      // 事前アクセスは最適化のためだけなので、失敗してもテストは続行する
    }
  }
}

export default async function globalSetup() {
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

  await warmUp();
}
