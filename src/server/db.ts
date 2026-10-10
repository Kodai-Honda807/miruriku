import "server-only";

import { getSharedPrismaClient, type PrismaClient } from "@/lib/prisma";

/**
 * Web アプリ用の Prisma Client（プロセス内で 1 つ）。
 * `next build` 時に DB 接続文字列を要求しないよう、最初の呼び出しで生成する。
 */
export function getPrisma(): PrismaClient {
  return getSharedPrismaClient();
}
