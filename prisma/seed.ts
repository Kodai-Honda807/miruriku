/**
 * デモデータの投入（pnpm db:seed / prisma db seed）。
 *
 *   SEED_BASE_DATE=2026-10-10 pnpm db:seed   # 基準日を固定（既定は日本時間の今日）
 *
 * 本番環境（NODE_ENV=production）では実行しない。
 */
import "dotenv/config";

import { isValidLocalDate } from "../src/domain/datetime";
import { createPrismaClient } from "../src/lib/prisma";
import { seedDemoData } from "./demo-seed";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production ではデモデータを投入しません");
  }
  const baseDate = process.env.SEED_BASE_DATE?.trim() || undefined;
  if (baseDate && !isValidLocalDate(baseDate)) {
    throw new Error(`SEED_BASE_DATE は YYYY-MM-DD 形式で指定してください: ${baseDate}`);
  }
  const prisma = createPrismaClient();
  try {
    const result = await seedDemoData(prisma, { baseDate });
    console.log(`デモデータを投入しました（基準日 ${result.baseDate}、大会 ${result.eventCount} 件、すべて架空）`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
