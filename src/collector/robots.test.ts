/**
 * robots.txt の判定と、HTTP 取得器（robots.txt の確認・アクセス間隔）のテスト。
 * 外部ネットワークにはアクセスしない（MockAgent と差し替えた名前解決を使う）。
 */
import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ResolveAll } from "./dns-guard";
import { CollectorError } from "./errors";
import { HttpPageFetcher } from "./http-fetcher";
import { checkRobots, robotsRulesFromResponse } from "./robots";

const TOKEN = "mirurikuBot";
const page = (path = "/broadcast") => new URL(`https://example.org${path}`);

describe("robotsRulesFromResponse / checkRobots", () => {
  it("404 / 410 などの 4xx は全許可", () => {
    for (const status of [400, 401, 403, 404, 410]) {
      expect(checkRobots(robotsRulesFromResponse("https://example.org/robots.txt", status, null), page(), TOKEN)).toEqual({
        allowed: true,
        crawlDelayMs: null,
      });
    }
  });

  it("5xx と 429 は全拒否（ROBOTS_UNAVAILABLE）", () => {
    for (const status of [429, 500, 502, 503]) {
      const decision = checkRobots(robotsRulesFromResponse("https://example.org/robots.txt", status, null), page(), TOKEN);
      expect(decision).toMatchObject({ allowed: false, code: "ROBOTS_UNAVAILABLE" });
    }
  });

  it("mirurikuBot 向けの Disallow に従う", () => {
    const text = ["User-agent: *", "Allow: /", "", "User-agent: mirurikuBot", "Disallow: /broadcast"].join("\n");
    const rules = robotsRulesFromResponse("https://example.org/robots.txt", 200, text);
    expect(checkRobots(rules, page("/broadcast"), TOKEN)).toMatchObject({ allowed: false, code: "ROBOTS_DISALLOWED" });
    expect(checkRobots(rules, page("/news"), TOKEN)).toMatchObject({ allowed: true });
  });

  it("専用のグループがなければ * の規則に従う", () => {
    const rules = robotsRulesFromResponse("https://example.org/robots.txt", 200, "User-agent: *\nDisallow: /\n");
    expect(checkRobots(rules, page(), TOKEN)).toMatchObject({ allowed: false, code: "ROBOTS_DISALLOWED" });
  });

  it("他のボット向けの Disallow は影響しない", () => {
    const rules = robotsRulesFromResponse("https://example.org/robots.txt", 200, "User-agent: OtherBot\nDisallow: /\n");
    expect(checkRobots(rules, page(), TOKEN)).toMatchObject({ allowed: true });
  });

  it("Crawl-delay を返す", () => {
    const rules = robotsRulesFromResponse("https://example.org/robots.txt", 200, "User-agent: *\nCrawl-delay: 5\n");
    expect(checkRobots(rules, page(), TOKEN)).toEqual({ allowed: true, crawlDelayMs: 5000 });
  });

  it("robots.txt と異なるオリジンの URL は拒否扱い", () => {
    const rules = robotsRulesFromResponse("https://example.org/robots.txt", 200, "");
    expect(checkRobots(rules, new URL("http://example.org/broadcast"), TOKEN)).toMatchObject({ allowed: false });
  });
});

describe("HttpPageFetcher", () => {
  let agent: MockAgent;
  let clock: number;
  let sleeps: number[];
  const resolveAll: ResolveAll = async () => [{ address: "93.184.215.14", family: 4 }];

  beforeEach(() => {
    agent = new MockAgent({ enableCallHistory: true });
    agent.disableNetConnect();
    clock = 1_000_000;
    sleeps = [];
  });

  afterEach(async () => {
    await agent.close();
  });

  function fetcher(overrides: Partial<ConstructorParameters<typeof HttpPageFetcher>[0]> = {}) {
    return new HttpPageFetcher({
      dispatcher: agent,
      resolveAll,
      userAgent: "mirurikuBot/test",
      nowMs: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
      ...overrides,
    });
  }

  const HTML = { "content-type": "text/html; charset=utf-8" };
  const TEXT = { "content-type": "text/plain" };

  async function errorOf(promise: Promise<unknown>): Promise<CollectorError> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof CollectorError) return error;
      throw error;
    }
    throw new Error("例外が発生しませんでした");
  }

  function paths(): string[] {
    return agent.getCallHistory()!.calls().map((c) => c.path);
  }

  it("robots.txt が 404 なら取得し、robots.txt との間に 2 秒以上空ける", async () => {
    const pool = agent.get("https://example.org");
    pool.intercept({ path: "/robots.txt" }).reply(404, "");
    pool.intercept({ path: "/broadcast" }).reply(200, "<p>ok</p>", { headers: HTML });
    const result = await fetcher().fetchPage("https://example.org/broadcast");
    expect(result.httpStatus).toBe(200);
    expect(paths()).toEqual(["/robots.txt", "/broadcast"]);
    expect(sleeps).toEqual([2000]);
  });

  it("robots.txt で拒否されたら取得しない（ROBOTS_DISALLOWED）", async () => {
    const pool = agent.get("https://example.org");
    pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: mirurikuBot\nDisallow: /\n", { headers: TEXT });
    const error = await errorOf(fetcher().fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("ROBOTS_DISALLOWED");
    expect(paths()).toEqual(["/robots.txt"]);
  });

  it("robots.txt が 5xx なら取得しない（ROBOTS_UNAVAILABLE）", async () => {
    agent.get("https://example.org").intercept({ path: "/robots.txt" }).reply(503, "");
    const error = await errorOf(fetcher().fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("ROBOTS_UNAVAILABLE");
    expect(paths()).toEqual(["/robots.txt"]);
  });

  it("robots.txt の取得が通信エラーなら取得しない", async () => {
    agent.get("https://example.org").intercept({ path: "/robots.txt" }).replyWithError(new Error("ECONNRESET"));
    const error = await errorOf(fetcher().fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("ROBOTS_UNAVAILABLE");
  });

  it("robots.txt が text/plain 以外なら確認できないものとして取得しない", async () => {
    agent.get("https://example.org").intercept({ path: "/robots.txt" }).reply(200, "<html></html>", { headers: HTML });
    const error = await errorOf(fetcher().fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("ROBOTS_UNAVAILABLE");
  });

  it("Crawl-delay が 2 秒より長ければその間隔を空ける", async () => {
    const pool = agent.get("https://example.org");
    pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nCrawl-delay: 7\n", { headers: TEXT });
    pool.intercept({ path: "/broadcast" }).reply(200, "<p>ok</p>", { headers: HTML });
    await fetcher().fetchPage("https://example.org/broadcast");
    expect(sleeps).toEqual([7000]);
  });

  it("Crawl-delay が長すぎる場合は待たずに取得をやめる（CRAWL_DELAY_TOO_LONG）", async () => {
    agent.get("https://example.org").intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nCrawl-delay: 3600\n", {
      headers: TEXT,
    });
    const error = await errorOf(fetcher().fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("CRAWL_DELAY_TOO_LONG");
    expect(sleeps).toEqual([]);
  });

  it("robots.txt は同じオリジンでは 1 回だけ取得し、同一ホストへの連続取得の間隔を空ける", async () => {
    const pool = agent.get("https://example.org");
    pool.intercept({ path: "/robots.txt" }).reply(404, "");
    pool.intercept({ path: "/a" }).reply(200, "<p>a</p>", { headers: HTML });
    pool.intercept({ path: "/b" }).reply(200, "<p>b</p>", { headers: HTML });
    const f = fetcher();
    await f.fetchPage("https://example.org/a");
    await f.fetchPage("https://example.org/b");
    expect(paths()).toEqual(["/robots.txt", "/a", "/b"]);
    expect(sleeps).toEqual([2000, 2000]);
  });

  it("リダイレクト先のパスも robots.txt で確認する", async () => {
    const pool = agent.get("https://example.org");
    pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nDisallow: /private\n", { headers: TEXT });
    pool.intercept({ path: "/broadcast" }).reply(301, "", { headers: { location: "/private/page" } });
    const error = await errorOf(fetcher().fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("ROBOTS_DISALLOWED");
    expect(paths()).toEqual(["/robots.txt", "/broadcast"]);
  });

  it("401 / 403 / 429 などはそのまま失敗として記録する（回避しない）", async () => {
    for (const status of [401, 403, 429]) {
      const local = new MockAgent({ enableCallHistory: true });
      local.disableNetConnect();
      const pool = local.get("https://example.org");
      pool.intercept({ path: "/robots.txt" }).reply(404, "");
      pool.intercept({ path: "/broadcast" }).reply(status, "denied", { headers: HTML });
      const error = await errorOf(fetcher({ dispatcher: local }).fetchPage("https://example.org/broadcast"));
      expect(error.code).toBe("HTTP_STATUS");
      expect(error.details.httpStatus).toBe(status);
      expect(local.getCallHistory()!.calls().map((c) => c.path)).toEqual(["/robots.txt", "/broadcast"]);
      await local.close();
    }
  });

  it("禁止アドレスに解決されるホストは robots.txt も取得せず BLOCKED_ADDRESS で失敗", async () => {
    const f = fetcher({ resolveAll: async () => [{ address: "192.168.0.10", family: 4 }] });
    const error = await errorOf(f.fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("BLOCKED_ADDRESS");
    expect(paths()).toEqual([]);
  });

  it("robots.txt が他のホストへリダイレクトされたら確認できないものとして取得しない", async () => {
    agent.get("https://example.org").intercept({ path: "/robots.txt" }).reply(301, "", {
      headers: { location: "https://elsewhere.example.net/robots.txt" },
    });
    const error = await errorOf(fetcher().fetchPage("https://example.org/broadcast"));
    expect(error.code).toBe("ROBOTS_UNAVAILABLE");
    expect(paths()).toEqual(["/robots.txt"]);
  });
});
