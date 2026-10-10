/**
 * 安全な HTTP 取得（GET のみ）。
 *
 * - URL の静的検査（url-policy.ts）→ 名前解決と全アドレスの検査（dns-guard.ts）→ 接続時の名前解決でも再検査
 *   （createSafeAgent が undici の Agent に検査付き lookup を設定する）
 * - リダイレクトは自動追跡せず手動で追跡（最大 3 回）。各リダイレクト先も同じ検査を行い、
 *   さらに元の URL と同一ホスト（先頭の www. の違いのみ許容）・https から http への格下げなしに限定
 * - 通信時間の合計に対するタイムアウト、応答サイズの上限（ストリームで読み、超えたら中断）、Content-Type の検証
 * - Cookie・認証ヘッダーは送らない。圧縮は要求しない（Accept-Encoding: identity）
 * - 再試行はしない
 */
import { Agent, request, type Dispatcher } from "undici";

import { FETCH_TIMEOUT_MS, MAX_PAGE_BYTES, MAX_REDIRECTS } from "./config";
import { createGuardedLookup, resolveAndAssertHost, systemResolveAll, type ResolveAll } from "./dns-guard";
import { CollectorError, findCollectorError } from "./errors";
import { assertFetchableUrl, isSameSiteHost } from "./url-policy";

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

export type SafeFetchOptions = {
  /** 接続に使う Dispatcher（通常は createSafeAgent()。テストでは MockAgent） */
  dispatcher: Dispatcher;
  /** 取得前の名前解決（テストでは差し替える） */
  resolveAll: ResolveAll;
  userAgent: string;
  accept: string;
  /** 2xx 応答で許可する MIME タイプ（小文字） */
  allowedContentTypes: readonly string[];
  maxBytes: number;
  maxRedirects?: number;
  /** 通信時間の合計に対するタイムアウト（beforeRequest での待ち時間は含めない） */
  timeoutMs?: number;
  /** 各リクエスト（リダイレクト先を含む）の直前に呼ばれる。robots.txt の確認や間隔の調整に使う */
  beforeRequest?: (url: URL) => Promise<void>;
  /** 各リクエストの完了後（成否にかかわらず）に呼ばれる */
  afterRequest?: (url: URL) => void;
  nowMs?: () => number;
};

export type SafeFetchResult = {
  status: number;
  /** 最終的に応答を返した URL */
  url: string;
  /** 追跡したリダイレクト先（順に） */
  redirects: string[];
  contentType: string | null;
  mimeType: string | null;
  charset: string | null;
  /** 2xx の場合のみ本文。それ以外は null（本文は読まずに破棄する） */
  body: Uint8Array | null;
};

/** 検査付き lookup を設定した undici の Agent。プロキシは使わない（名前解決の検査を迂回させないため） */
export function createSafeAgent(resolveAll: ResolveAll = systemResolveAll): Agent {
  return new Agent({
    connect: { lookup: createGuardedLookup(resolveAll), timeout: 10_000 },
    connections: 1,
    allowH2: false,
    maxResponseSize: MAX_PAGE_BYTES,
    headersTimeout: FETCH_TIMEOUT_MS,
    bodyTimeout: FETCH_TIMEOUT_MS,
    keepAliveTimeout: 4_000,
  });
}

export function parseContentType(value: string | null): { mimeType: string | null; charset: string | null } {
  if (!value) return { mimeType: null, charset: null };
  const [type, ...params] = value.split(";");
  const mimeType = type.trim().toLowerCase() || null;
  let charset: string | null = null;
  for (const param of params) {
    const m = /^\s*charset\s*=\s*"?([^";\s]+)"?\s*$/i.exec(param);
    if (m) charset = m[1].toLowerCase();
  }
  return { mimeType, charset };
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function discardBody(body: Dispatcher.ResponseData["body"]): void {
  try {
    body.destroy();
  } catch {
    // 破棄の失敗は無視する
  }
}

async function readLimited(body: Dispatcher.ResponseData["body"], maxBytes: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.length;
    if (total > maxBytes) {
      discardBody(body);
      throw new CollectorError("RESPONSE_TOO_LARGE", `応答サイズが上限（${maxBytes} バイト）を超えました`, {
        byteLength: total,
      });
    }
    chunks.push(buf);
  }
  return new Uint8Array(Buffer.concat(chunks, total));
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function toCollectorError(error: unknown, timedOut: boolean, url: URL): CollectorError {
  const found = findCollectorError(error);
  if (found) return found;
  if (timedOut) return new CollectorError("TIMEOUT", `タイムアウトしました: ${url.href}`, { finalUrl: url.href });
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  if (code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return new CollectorError("TIMEOUT", `タイムアウトしました（${code}）: ${url.href}`, { finalUrl: url.href });
  }
  if (code === "UND_ERR_RES_EXCEEDED_MAX_SIZE") {
    return new CollectorError("RESPONSE_TOO_LARGE", `応答サイズが上限を超えました: ${url.href}`, { finalUrl: url.href });
  }
  return new CollectorError(
    "NETWORK_ERROR",
    `通信エラー（${typeof code === "string" ? code : "unknown"}）: ${message.slice(0, 300)}`,
    { finalUrl: url.href },
    { cause: error },
  );
}

type HopOutcome =
  | { kind: "redirect"; status: number; location: string }
  | {
      kind: "final";
      status: number;
      contentType: string | null;
      mimeType: string | null;
      charset: string | null;
      body: Uint8Array | null;
    };

async function fetchOnce(url: URL, opts: SafeFetchOptions, signal: AbortSignal, remainingMs: number): Promise<HopOutcome> {
  // 取得前に名前解決し、すべてのアドレスを検査する（接続時にも createSafeAgent の lookup で再検査される）
  await raceAbort(resolveAndAssertHost(url.hostname, opts.resolveAll), signal);

  const res = await request(url, {
    dispatcher: opts.dispatcher,
    method: "GET",
    headers: {
      "user-agent": opts.userAgent,
      accept: opts.accept,
      "accept-language": "ja,en;q=0.5",
      "accept-encoding": "identity",
    },
    signal,
    headersTimeout: remainingMs,
    bodyTimeout: remainingMs,
  });
  const status = res.statusCode;
  const headers = res.headers as Record<string, string | string[] | undefined>;

  if (REDIRECT_STATUSES.has(status)) {
    discardBody(res.body);
    const location = headerValue(headers, "location");
    if (!location) {
      throw new CollectorError("REDIRECT_NOT_ALLOWED", `Location ヘッダーのないリダイレクト応答です（HTTP ${status}）`, {
        httpStatus: status,
        finalUrl: url.href,
      });
    }
    return { kind: "redirect", status, location };
  }

  const contentType = headerValue(headers, "content-type");
  const { mimeType, charset } = parseContentType(contentType);
  if (status < 200 || status >= 300) {
    discardBody(res.body);
    return { kind: "final", status, contentType, mimeType, charset, body: null };
  }

  const details = { httpStatus: status, finalUrl: url.href, contentType };
  if (!mimeType || !opts.allowedContentTypes.includes(mimeType)) {
    discardBody(res.body);
    throw new CollectorError(
      "UNSUPPORTED_CONTENT_TYPE",
      `対象外の Content-Type です: ${contentType ?? "（なし）"}（許可: ${opts.allowedContentTypes.join(", ")}）`,
      details,
    );
  }
  const encoding = headerValue(headers, "content-encoding")?.trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    discardBody(res.body);
    throw new CollectorError("UNSUPPORTED_CONTENT_ENCODING", `圧縮された応答は扱いません: ${encoding}`, details);
  }
  const declaredLength = Number(headerValue(headers, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > opts.maxBytes) {
    discardBody(res.body);
    throw new CollectorError(
      "RESPONSE_TOO_LARGE",
      `Content-Length（${declaredLength} バイト）が上限（${opts.maxBytes} バイト）を超えています`,
      { ...details, byteLength: declaredLength },
    );
  }
  try {
    const body = await readLimited(res.body, opts.maxBytes);
    return { kind: "final", status, contentType, mimeType, charset, body };
  } catch (error) {
    const found = findCollectorError(error);
    if (found) {
      throw new CollectorError(found.code, found.message, { ...details, ...found.details }, { cause: error });
    }
    throw error;
  }
}

export async function safeFetch(input: string | URL, opts: SafeFetchOptions): Promise<SafeFetchResult> {
  const original = assertFetchableUrl(input);
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const nowMs = opts.nowMs ?? (() => performance.now());

  let current = original;
  const redirects: string[] = [];
  let spentMs = 0;

  for (;;) {
    const hopUrl = current;
    await opts.beforeRequest?.(hopUrl);

    const remainingMs = Math.floor(timeoutMs - spentMs);
    if (remainingMs <= 0) {
      throw new CollectorError("TIMEOUT", `タイムアウトしました: ${hopUrl.href}`, { finalUrl: hopUrl.href });
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new CollectorError("TIMEOUT", `タイムアウト（${timeoutMs}ms）: ${hopUrl.href}`, { finalUrl: hopUrl.href })),
      remainingMs,
    );
    const startedMs = nowMs();
    let outcome: HopOutcome;
    try {
      outcome = await fetchOnce(hopUrl, opts, controller.signal, remainingMs);
    } catch (error) {
      throw toCollectorError(error, controller.signal.aborted, hopUrl);
    } finally {
      clearTimeout(timer);
      spentMs += nowMs() - startedMs;
      opts.afterRequest?.(hopUrl);
    }

    if (outcome.kind === "final") {
      return {
        status: outcome.status,
        url: hopUrl.href,
        redirects,
        contentType: outcome.contentType,
        mimeType: outcome.mimeType,
        charset: outcome.charset,
        body: outcome.body,
      };
    }

    // --- リダイレクト ---
    const details = { httpStatus: outcome.status, finalUrl: hopUrl.href };
    if (redirects.length >= maxRedirects) {
      throw new CollectorError("REDIRECT_LIMIT", `リダイレクトが ${maxRedirects} 回を超えました`, details);
    }
    let next: URL;
    try {
      next = assertFetchableUrl(new URL(outcome.location, hopUrl));
    } catch (error) {
      const found = findCollectorError(error);
      throw new CollectorError(
        found?.code ?? "REDIRECT_NOT_ALLOWED",
        `リダイレクト先を取得できません: ${found?.message ?? outcome.location.slice(0, 200)}`,
        details,
      );
    }
    if (!isSameSiteHost(next.hostname, original.hostname)) {
      throw new CollectorError(
        "REDIRECT_NOT_ALLOWED",
        `他のホストへのリダイレクトは追跡しません: ${original.hostname} → ${next.hostname}`,
        details,
      );
    }
    if (hopUrl.protocol === "https:" && next.protocol === "http:") {
      throw new CollectorError("REDIRECT_NOT_ALLOWED", `https から http へのリダイレクトは追跡しません: ${next.href}`, details);
    }
    redirects.push(next.href);
    current = next;
  }
}
