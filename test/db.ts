/**
 * DB 統合テスト（*.db.test.ts）用のヘルパー。
 * 誤って開発用 DB を消さないよう、データベース名が _test で終わる場合のみ動作する。
 */
import "dotenv/config";

import { createPrismaClient, type PrismaClient } from "@/lib/prisma";

export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL が設定されていません（.env.example を参照）");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`安全のため、DB 統合テストはデータベース名が _test で終わる場合のみ実行します: ${dbName}`);
  }
  return url;
}

export function createTestPrisma(): PrismaClient {
  return createPrismaClient(getTestDatabaseUrl());
}

/** すべてのアプリ用テーブルを空にする */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  getTestDatabaseUrl();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ExtractionCandidate", "CollectionRun", "BroadcastSlot", "EventSession", "Source", "Event", "EventSeries" RESTART IDENTITY CASCADE',
  );
}
