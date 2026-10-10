/**
 * 収集 CLI のエントリ（pnpm collect = tsx scripts/collect.ts）。
 * 使い方は `pnpm collect --help`、実装は src/collector/cli.ts を参照。
 *
 * スケジューラや常駐処理はない。手動（または将来の定期ジョブ）で 1 回ずつ実行する。
 * NODE_ENV=production でも動作するが、HTTP 取得の安全対策は常に有効。
 */
import "dotenv/config";

import { runCollectCli } from "@/collector/cli";

process.exitCode = await runCollectCli(process.argv.slice(2));
