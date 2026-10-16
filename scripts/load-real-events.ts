/**
 * 実在の大会データ（data/real-events.ts）を DB に反映する（pnpm data:load）。
 *
 *   pnpm data:load                 # 実在の大会を登録・更新（デモデータには触れない）
 *   pnpm data:load --remove-demo   # あわせて架空のデモ大会を削除する（実際の観戦用の DB にする）
 *   pnpm data:load --check         # 定義の検証だけを行い、DB には接続しない
 *
 * 定義の書き方とルールは docs/real-data.md を参照。
 */
import "dotenv/config";

import { REAL_EVENTS } from "../data/real-events";
import { loadRealEvents, parseRealEvents } from "../prisma/real-events";
import { createPrismaClient } from "../src/lib/prisma";

const USAGE = "使い方: pnpm data:load [--remove-demo] [--check]";

async function main(argv: string[]): Promise<number> {
  const unknown = argv.filter((a) => a !== "--remove-demo" && a !== "--check" && a !== "--");
  if (unknown.length > 0 || argv.includes("--help")) {
    console.error(`不明なオプション: ${unknown.join(" ")}\n${USAGE}`);
    return 2;
  }
  if (argv.includes("--check")) {
    const events = parseRealEvents(REAL_EVENTS);
    console.log(`定義を検証しました（大会 ${events.length} 件、問題なし）。DB には書き込んでいません。`);
    return 0;
  }
  const prisma = createPrismaClient();
  try {
    const result = await loadRealEvents(prisma, REAL_EVENTS, { removeDemo: argv.includes("--remove-demo") });
    console.log(`実在の大会を反映しました（大会 ${result.eventCount} 件、放送・配信枠 ${result.slotCount} 件）`);
    if (argv.includes("--remove-demo")) console.log(`架空のデモ大会を ${result.removedDemoEventCount} 件削除しました`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
