/**
 * robots.txt の判定（RFC 9309 に沿った扱い）。
 *
 * - 2xx: robots-parser で解析し、UA トークン "mirurikuBot" の規則で判定（該当グループがなければ "*"）
 * - 4xx（429 を除く）: robots.txt が「利用できない」ものとして全許可
 * - 5xx・429・通信エラー・タイムアウト・不正な応答: 「到達できない」ものとして全拒否
 * robots.txt の取得自体も safe-fetch.ts の安全な取得で行う（http-fetcher.ts）。
 */
import robotsParser from "robots-parser";

export type Robot = ReturnType<typeof robotsParser>;

export type RobotsRules =
  | { kind: "allow-all"; reason: string }
  | { kind: "disallow-all"; reason: string }
  | { kind: "parsed"; robotsUrl: string; robot: Robot };

export type RobotsDecision =
  | { allowed: true; crawlDelayMs: number | null }
  | { allowed: false; code: "ROBOTS_DISALLOWED" | "ROBOTS_UNAVAILABLE"; reason: string };

/** robots.txt の URL（取得対象 URL のオリジン直下） */
export function robotsUrlFor(url: URL): string {
  return `${url.origin}/robots.txt`;
}

export function decodeRobotsText(body: Uint8Array): string {
  return new TextDecoder("utf-8").decode(body).replace(/^﻿/, "");
}

/** robots.txt の応答（リダイレクト追跡後のステータスと本文）から規則を作る */
export function robotsRulesFromResponse(robotsUrl: string, status: number, text: string | null): RobotsRules {
  if (status >= 200 && status < 300) {
    return { kind: "parsed", robotsUrl, robot: robotsParser(robotsUrl, text ?? "") };
  }
  if (status === 429) {
    return { kind: "disallow-all", reason: "robots.txt の取得で HTTP 429 を受け取ったため、取得を控えます" };
  }
  if (status >= 400 && status < 500) {
    return { kind: "allow-all", reason: `robots.txt が HTTP ${status} のため、制限なしとして扱います` };
  }
  return { kind: "disallow-all", reason: `robots.txt の取得で HTTP ${status} を受け取ったため、全拒否として扱います` };
}

export function checkRobots(rules: RobotsRules, url: URL, userAgentToken: string): RobotsDecision {
  switch (rules.kind) {
    case "allow-all":
      return { allowed: true, crawlDelayMs: null };
    case "disallow-all":
      return { allowed: false, code: "ROBOTS_UNAVAILABLE", reason: rules.reason };
    case "parsed": {
      const allowed = rules.robot.isAllowed(url.href, userAgentToken);
      if (allowed !== true) {
        // undefined（robots.txt と URL のオリジンが一致しない）も拒否として扱う
        return {
          allowed: false,
          code: "ROBOTS_DISALLOWED",
          reason: `robots.txt（${rules.robotsUrl}）で ${userAgentToken} による取得が許可されていません: ${url.pathname}`,
        };
      }
      const delay = rules.robot.getCrawlDelay(userAgentToken);
      const crawlDelayMs = typeof delay === "number" && Number.isFinite(delay) && delay > 0 ? delay * 1000 : null;
      return { allowed: true, crawlDelayMs };
    }
  }
}
