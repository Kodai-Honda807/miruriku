/**
 * 収集基盤のエラー。CollectionRun.errorCode に保存するコードと、管理画面向けの日本語ラベル。
 *
 * errorMessage（内部向け）には URL・HTTP ステータス・Zod の検証メッセージなどを入れてよいが、
 * 取得したページ本文そのものは入れない。
 */

export const COLLECTOR_ERROR_LABELS = {
  INVALID_URL: "URL を解釈できません",
  UNSUPPORTED_SCHEME: "http / https 以外の URL です",
  CREDENTIALS_IN_URL: "認証情報を含む URL です",
  PORT_NOT_ALLOWED: "既定（80 / 443）以外のポートです",
  BLOCKED_HOST: "取得が禁止されたホスト名です",
  BLOCKED_ADDRESS: "取得が禁止された IP アドレスです",
  DNS_FAILED: "名前解決に失敗しました",
  REDIRECT_LIMIT: "リダイレクトの回数が上限を超えました",
  REDIRECT_NOT_ALLOWED: "許可されていないリダイレクト先です",
  HTTP_STATUS: "HTTP エラー応答を受け取りました",
  TIMEOUT: "タイムアウトしました",
  RESPONSE_TOO_LARGE: "応答サイズが上限を超えました",
  UNSUPPORTED_CONTENT_TYPE: "対象外の Content-Type です",
  UNSUPPORTED_CONTENT_ENCODING: "対象外の Content-Encoding です",
  NETWORK_ERROR: "通信エラーが発生しました",
  ROBOTS_DISALLOWED: "robots.txt で取得が許可されていません",
  ROBOTS_UNAVAILABLE: "robots.txt を確認できないため取得しませんでした",
  CRAWL_DELAY_TOO_LONG: "robots.txt の Crawl-delay が長すぎるため取得しませんでした",
  FIXTURE_NOT_FOUND: "固定ファイルが見つかりません",
  FIXTURE_INVALID: "固定ファイルの内容が不正です",
  PROVIDER_NOT_ALLOWED: "この取得方法では使えない抽出プロバイダです",
  PROVIDER_FAILED: "抽出処理に失敗しました",
  VALIDATION_FAILED: "抽出結果の検証に失敗しました",
  SOURCE_NOT_FOUND: "情報源が見つかりません",
  SOURCE_DISABLED: "収集が許可されていない情報源です",
  EVENT_NOT_FOUND: "大会が見つかりません",
  INTERNAL_ERROR: "内部エラーが発生しました",
} as const;

export type CollectorErrorCode = keyof typeof COLLECTOR_ERROR_LABELS;

/** CollectionRun を SKIPPED（取得せず）として記録するエラー。それ以外は FAILED */
const SKIP_CODES: ReadonlySet<CollectorErrorCode> = new Set([
  "ROBOTS_DISALLOWED",
  "ROBOTS_UNAVAILABLE",
  "CRAWL_DELAY_TOO_LONG",
]);

export function isSkipErrorCode(code: CollectorErrorCode): boolean {
  return SKIP_CODES.has(code);
}

export function collectorErrorLabel(code: string): string {
  return (COLLECTOR_ERROR_LABELS as Record<string, string>)[code] ?? code;
}

export type CollectorErrorDetails = {
  httpStatus?: number;
  finalUrl?: string;
  contentType?: string | null;
  byteLength?: number;
};

export class CollectorError extends Error {
  readonly code: CollectorErrorCode;
  readonly details: CollectorErrorDetails;

  constructor(code: CollectorErrorCode, message: string, details: CollectorErrorDetails = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = "CollectorError";
    this.code = code;
    this.details = details;
  }
}

/**
 * undici などが元のエラーを cause / AggregateError に包んで投げる場合があるため、
 * たどって CollectorError を探す。
 */
export function findCollectorError(error: unknown, depth = 0): CollectorError | null {
  if (depth > 5 || error === null || typeof error !== "object") return null;
  if (error instanceof CollectorError) return error;
  const cause = (error as { cause?: unknown }).cause;
  const fromCause = findCollectorError(cause, depth + 1);
  if (fromCause) return fromCause;
  if (error instanceof AggregateError) {
    for (const inner of error.errors) {
      const found = findCollectorError(inner, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** 内部向けメッセージを DB に保存できる長さに切り詰める */
export function truncateMessage(message: string, max = 1000): string {
  const chars = Array.from(message);
  return chars.length <= max ? message : `${chars.slice(0, max - 1).join("")}…`;
}
