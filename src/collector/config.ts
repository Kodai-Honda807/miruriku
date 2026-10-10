/**
 * 収集基盤の既定値。安全対策に関わる値は CLI の引数や環境変数では緩められないようにしている
 * （User-Agent と処理件数の上限のみ指定可能）。
 */

/** robots.txt の判定に使う UA トークン */
export const ROBOTS_USER_AGENT_TOKEN = "mirurikuBot";

/** COLLECTOR_USER_AGENT 未設定時の User-Agent */
export const DEFAULT_USER_AGENT = "mirurikuBot/0.1 (+https://example.com/miruriku-bot)";

/** 1 回の取得（リダイレクトを含む通信時間の合計）のタイムアウト */
export const FETCH_TIMEOUT_MS = 15_000;

/** ページ本文の最大サイズ */
export const MAX_PAGE_BYTES = 2 * 1024 * 1024;

/** robots.txt の最大サイズ（RFC 9309 は 500 KiB 以上の解析を求める） */
export const MAX_ROBOTS_BYTES = 512 * 1024;

/** リダイレクトの最大追跡回数 */
export const MAX_REDIRECTS = 3;

/** 同一ホストへのリクエスト間隔の最小値（robots.txt の Crawl-delay が長ければそちらを使う） */
export const MIN_HOST_INTERVAL_MS = 2_000;

/** これより長い Crawl-delay が指定されている場合は待たずに取得をやめる（SKIPPED） */
export const MAX_CRAWL_DELAY_MS = 60_000;

/** 抽出テキストの最大文字数 */
export const MAX_TEXT_CHARS = 50_000;

/** 1 回の実行で処理する情報源の数 */
export const DEFAULT_SOURCE_LIMIT = 20;
export const MAX_SOURCE_LIMIT = 50;

export const PAGE_CONTENT_TYPES = ["text/html", "application/xhtml+xml"] as const;
export const ROBOTS_CONTENT_TYPES = ["text/plain"] as const;

const MAX_USER_AGENT_LENGTH = 200;

/**
 * 環境変数 COLLECTOR_USER_AGENT から User-Agent を決める。
 * ヘッダーインジェクションを避けるため、制御文字を含む値や長すぎる値は拒否する。
 */
export function resolveUserAgent(env: Record<string, string | undefined> = process.env): string {
  const value = env.COLLECTOR_USER_AGENT?.trim();
  if (!value) return DEFAULT_USER_AGENT;
  if (!/^[\x20-\x7e]+$/.test(value) || value.length > MAX_USER_AGENT_LENGTH) {
    throw new Error("COLLECTOR_USER_AGENT は 200 文字以内の ASCII 印字可能文字で指定してください");
  }
  return value;
}
