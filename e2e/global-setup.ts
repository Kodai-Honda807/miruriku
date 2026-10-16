/**
 * 管理画面の開発サーバーで主要なルートに一度アクセスし、コンパイルを済ませておく
 * （初回アクセス時のコンパイル中にページ遷移が中断され、テストが不安定になるのを防ぐ）。
 * DB の初期化と公開サイトの静的ビルドは e2e/prepare.ts（playwright test の前）で行う。
 */
import { E2E_ADMIN_PORT } from "./support/env";

const WARM_UP_PATHS = ["/admin/candidates", "/admin/events"];

export default async function globalSetup() {
  for (const path of WARM_UP_PATHS) {
    try {
      await fetch(`http://localhost:${E2E_ADMIN_PORT}${path}`, { signal: AbortSignal.timeout(120_000) });
    } catch {
      // 事前アクセスは最適化のためだけなので、失敗してもテストは続行する
    }
  }
}
