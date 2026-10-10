import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

export type { PrismaClient };

/**
 * Prisma Client を作成する。Next.js 以外（seed・収集 CLI・テスト）からも使うため
 * "server-only" は付けない。Web アプリからは src/server/db.ts の getPrisma() を使うこと。
 */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL が設定されていません（.env.example を参照）");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// 開発時のホットリロードや、Proxy とページの間で接続プールが増えないよう globalThis に保持する。
const globalForPrisma = globalThis as unknown as { mirurikuPrisma?: PrismaClient };

/**
 * プロセス内で共有する Prisma Client。`next build` 時に DB 接続文字列を要求しないよう、最初の呼び出しで生成する。
 * Web アプリのコードからは src/server/db.ts の getPrisma() 経由で使う（Proxy のみ直接使う）。
 */
export function getSharedPrismaClient(): PrismaClient {
  if (!globalForPrisma.mirurikuPrisma) {
    globalForPrisma.mirurikuPrisma = createPrismaClient();
  }
  return globalForPrisma.mirurikuPrisma;
}
