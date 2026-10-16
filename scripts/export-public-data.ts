/**
 * DB の公開中の大会を、静的ビルド用の公開データ（JSON）に書き出す。
 *
 *   tsx --conditions=react-server scripts/export-public-data.ts <出力先.json>
 *
 * E2E 専用: デモデータを入れた E2E 用 DB から書き出し、MIRURIKU_PUBLIC_DATA_FILE で指定して静的ビルドする
 * （e2e/prepare.ts）。本番のビルドは data/real-events.ts から直接作るため、このスクリプトは使わない。
 * --conditions=react-server は、公開用クエリが読み込む "server-only" をサーバー用として解決するために付ける。
 */
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { createPrismaClient } from "../src/lib/prisma";
import { serializePublicData } from "../src/server/public-data/json";
import { listPublicEventDetailsFrom } from "../src/server/queries/public-events";

async function main(argv: string[]): Promise<number> {
  const [out, ...rest] = argv.filter((a) => a !== "--");
  if (!out || rest.length > 0) {
    console.error("使い方: tsx --conditions=react-server scripts/export-public-data.ts <出力先.json>");
    return 2;
  }
  const prisma = createPrismaClient();
  try {
    const events = await listPublicEventDetailsFrom(prisma);
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, serializePublicData(events));
    console.log(`公開中の大会 ${events.length} 件を ${out} に書き出しました`);
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
