/**
 * HTTP モードのページ取得: robots.txt の確認 → 間隔調整 → 安全な取得。
 * 1 回の CLI 実行で 1 つのインスタンスを使い、robots.txt の結果とホストごとの最終アクセス時刻を共有する。
 */
import type { Dispatcher } from "undici";

import {
  FETCH_TIMEOUT_MS,
  MAX_CRAWL_DELAY_MS,
  MAX_PAGE_BYTES,
  MAX_REDIRECTS,
  MAX_ROBOTS_BYTES,
  MIN_HOST_INTERVAL_MS,
  PAGE_CONTENT_TYPES,
  ROBOTS_CONTENT_TYPES,
  ROBOTS_USER_AGENT_TOKEN,
  resolveUserAgent,
} from "./config";
import { systemResolveAll, type ResolveAll } from "./dns-guard";
import { CollectorError, findCollectorError, type CollectorErrorCode } from "./errors";
import { HostRateLimiter, realSleep, type Sleep } from "./rate-limit";
import { checkRobots, decodeRobotsText, robotsRulesFromResponse, robotsUrlFor, type RobotsRules } from "./robots";
import { createSafeAgent, safeFetch, type SafeFetchOptions } from "./safe-fetch";

/** robots.txt の取得で発生しても「robots.txt を確認できない」ではなく、そのまま失敗とするエラー */
const PROPAGATED_ROBOTS_ERRORS: ReadonlySet<CollectorErrorCode> = new Set([
  "INVALID_URL",
  "UNSUPPORTED_SCHEME",
  "CREDENTIALS_IN_URL",
  "PORT_NOT_ALLOWED",
  "BLOCKED_HOST",
  "BLOCKED_ADDRESS",
  "DNS_FAILED",
]);

/** 取得したページ（HTTP・固定ファイル共通） */
export type FetchedPage = {
  httpStatus: number | null;
  finalUrl: string | null;
  contentType: string | null;
  charset: string | null;
  body: Uint8Array;
};

export interface PageFetcher {
  fetchPage(url: string): Promise<FetchedPage>;
  close(): Promise<void>;
}

export type HttpPageFetcherOptions = {
  userAgent?: string;
  robotsToken?: string;
  /** 取得前の名前解決（テストでは差し替える） */
  resolveAll?: ResolveAll;
  /** 省略時は createSafeAgent(resolveAll)（接続時の名前解決も検査する） */
  dispatcher?: Dispatcher;
  sleep?: Sleep;
  nowMs?: () => number;
  timeoutMs?: number;
  maxPageBytes?: number;
  maxRobotsBytes?: number;
  maxRedirects?: number;
  minHostIntervalMs?: number;
  maxCrawlDelayMs?: number;
};

export class HttpPageFetcher implements PageFetcher {
  private readonly robotsCache = new Map<string, Promise<RobotsRules>>();
  private readonly limiter: HostRateLimiter;
  private readonly dispatcher: Dispatcher;
  private readonly ownsDispatcher: boolean;
  private readonly userAgent: string;
  private readonly robotsToken: string;
  private readonly resolveAll: ResolveAll;
  private readonly nowMs: () => number;
  private readonly timeoutMs: number;
  private readonly maxPageBytes: number;
  private readonly maxRobotsBytes: number;
  private readonly maxRedirects: number;
  private readonly minHostIntervalMs: number;
  private readonly maxCrawlDelayMs: number;

  constructor(opts: HttpPageFetcherOptions = {}) {
    this.userAgent = opts.userAgent ?? resolveUserAgent();
    this.robotsToken = opts.robotsToken ?? ROBOTS_USER_AGENT_TOKEN;
    this.resolveAll = opts.resolveAll ?? systemResolveAll;
    this.ownsDispatcher = !opts.dispatcher;
    this.dispatcher = opts.dispatcher ?? createSafeAgent(this.resolveAll);
    this.nowMs = opts.nowMs ?? (() => Date.now());
    this.limiter = new HostRateLimiter(this.nowMs, opts.sleep ?? realSleep);
    this.timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
    this.maxPageBytes = opts.maxPageBytes ?? MAX_PAGE_BYTES;
    this.maxRobotsBytes = opts.maxRobotsBytes ?? MAX_ROBOTS_BYTES;
    this.maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;
    this.minHostIntervalMs = Math.max(opts.minHostIntervalMs ?? MIN_HOST_INTERVAL_MS, 0);
    this.maxCrawlDelayMs = opts.maxCrawlDelayMs ?? MAX_CRAWL_DELAY_MS;
  }

  private baseOptions(): Pick<
    SafeFetchOptions,
    "dispatcher" | "resolveAll" | "userAgent" | "maxRedirects" | "timeoutMs" | "nowMs"
  > {
    return {
      dispatcher: this.dispatcher,
      resolveAll: this.resolveAll,
      userAgent: this.userAgent,
      maxRedirects: this.maxRedirects,
      timeoutMs: this.timeoutMs,
      nowMs: this.nowMs,
    };
  }

  async fetchPage(url: string): Promise<FetchedPage> {
    const result = await safeFetch(url, {
      ...this.baseOptions(),
      accept: "text/html,application/xhtml+xml;q=0.9",
      allowedContentTypes: PAGE_CONTENT_TYPES,
      maxBytes: this.maxPageBytes,
      beforeRequest: async (hopUrl) => {
        const crawlDelayMs = await this.assertRobotsAllowed(hopUrl);
        const intervalMs = Math.max(this.minHostIntervalMs, crawlDelayMs ?? 0);
        if (intervalMs > this.maxCrawlDelayMs) {
          throw new CollectorError(
            "CRAWL_DELAY_TOO_LONG",
            `robots.txt の Crawl-delay（${Math.round(intervalMs / 1000)} 秒）が上限（${this.maxCrawlDelayMs / 1000} 秒）を超えています`,
            { finalUrl: hopUrl.href },
          );
        }
        await this.limiter.wait(hopUrl.hostname, intervalMs);
      },
      afterRequest: (hopUrl) => this.limiter.markDone(hopUrl.hostname),
    });

    if (result.status < 200 || result.status >= 300 || !result.body) {
      throw new CollectorError("HTTP_STATUS", `HTTP ${result.status} を受け取りました: ${result.url}`, {
        httpStatus: result.status,
        finalUrl: result.url,
        contentType: result.contentType,
      });
    }
    return {
      httpStatus: result.status,
      finalUrl: result.url,
      contentType: result.contentType,
      charset: result.charset,
      body: result.body,
    };
  }

  /** robots.txt で許可されていれば Crawl-delay（ミリ秒、指定なしは null）を返す。拒否なら例外 */
  private async assertRobotsAllowed(url: URL): Promise<number | null> {
    let rules = this.robotsCache.get(url.origin);
    if (!rules) {
      rules = this.loadRobots(url);
      this.robotsCache.set(url.origin, rules);
    }
    const decision = checkRobots(await rules, url, this.robotsToken);
    if (!decision.allowed) {
      throw new CollectorError(decision.code, decision.reason, { finalUrl: url.href });
    }
    return decision.crawlDelayMs;
  }

  private async loadRobots(pageUrl: URL): Promise<RobotsRules> {
    const robotsUrl = robotsUrlFor(pageUrl);
    try {
      const res = await safeFetch(robotsUrl, {
        ...this.baseOptions(),
        accept: "text/plain",
        allowedContentTypes: ROBOTS_CONTENT_TYPES,
        maxBytes: this.maxRobotsBytes,
        beforeRequest: (hopUrl) => this.limiter.wait(hopUrl.hostname, this.minHostIntervalMs),
        afterRequest: (hopUrl) => this.limiter.markDone(hopUrl.hostname),
      });
      // リダイレクトされても、規則は元のオリジンに適用する
      return robotsRulesFromResponse(robotsUrl, res.status, res.body ? decodeRobotsText(res.body) : null);
    } catch (error) {
      const found = findCollectorError(error);
      // 禁止アドレス・名前解決の失敗などは robots.txt の問題ではないため、そのまま失敗として扱う
      if (found && PROPAGATED_ROBOTS_ERRORS.has(found.code)) throw found;
      return {
        kind: "disallow-all",
        reason: `robots.txt を確認できないため、全拒否として扱います（${found?.code ?? "UNKNOWN"}: ${found?.message ?? String(error)}）`,
      };
    }
  }

  async close(): Promise<void> {
    if (this.ownsDispatcher) {
      await this.dispatcher.close();
    }
  }
}
