/**
 * DB 統合テストの前に、テスト用 DB にマイグレーションを適用する。
 */
import { execFileSync } from "node:child_process";

import { getTestDatabaseUrl } from "./db";

export default function setup() {
  const url = getTestDatabaseUrl();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
