import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseAndNormalizeExtraction } from "@/domain/candidate";

import { CollectorError } from "./errors";
import { FixtureStore, applyFixtureTokens, buildFixtureTokens } from "./fixtures";
import { extractTextFromHtml } from "./html-text";
import { createFixtureProvider } from "./providers/fixture";
import { extractByRules } from "./providers/rule-based";

const DEMO_SOURCE_URL = "https://example.com/miruriku-demo/city-marathon/broadcast";
const EVENT = { name: "みる陸デモ市民マラソン", startDate: "2026-10-11", endDate: "2026-10-11" };

describe("固定ファイルのトークン", () => {
  it("大会データからトークンを作る", () => {
    expect(buildFixtureTokens(EVENT)).toEqual({
      EVENT_NAME: "みる陸デモ市民マラソン",
      EVENT_START_DATE: "2026-10-11",
      EVENT_END_DATE: "2026-10-11",
      EVENT_DATE_JA: "10月11日（日）",
      EVENT_YEAR: "2026",
      EVENT_MONTH: "10",
      EVENT_DAY: "11",
      EVENT_WEEKDAY: "日",
    });
  });

  it("未知のトークンはエラー", () => {
    expect(() => applyFixtureTokens("{{EVENT_YEAR}} {{UNKNOWN}}", { EVENT_YEAR: "2026" })).toThrow(CollectorError);
    expect(applyFixtureTokens("{{ EVENT_YEAR }}年", { EVENT_YEAR: "2026" })).toBe("2026年");
  });
});

describe("FixtureStore（リポジトリの fixtures/collector）", () => {
  const store = new FixtureStore();

  it("デモの情報源の HTML を読み、トークンを置換する", async () => {
    const page = await store.loadPage(DEMO_SOURCE_URL, EVENT);
    expect(page.contentType).toBe("text/html; charset=utf-8");
    expect(page.html).not.toMatch(/\{\{\s*[A-Z_]+\s*\}\}/);
    expect(page.html).toContain("10月11日（日）");
    expect(page.byteLength).toBe(Buffer.byteLength(page.html));
  });

  it("基準日が変わればページの日付も変わる", async () => {
    const page = await store.loadPage(DEMO_SOURCE_URL, { ...EVENT, startDate: "2027-03-01", endDate: "2027-03-01" });
    expect(page.html).toContain("3月1日（月）8:50〜11:30");
  });

  it("manifest にない情報源は FIXTURE_NOT_FOUND", async () => {
    await expect(store.loadPage("https://example.org/unknown", EVENT)).rejects.toMatchObject({ code: "FIXTURE_NOT_FOUND" });
  });

  it("fixture プロバイダの固定 JSON は rule-based の抽出結果と同じ枠になる", async () => {
    const provider = createFixtureProvider(store);
    expect(provider.kind).toBe("FIXTURE");
    expect(provider.fixtureOnly).toBe(true);
    const event = { ...EVENT, seasonYear: 2026, timezone: "Asia/Tokyo" };
    const fixed = parseAndNormalizeExtraction(await provider.extract({ sourceUrl: DEMO_SOURCE_URL, text: "", event }), "Asia/Tokyo");
    const { text } = extractTextFromHtml((await store.loadPage(DEMO_SOURCE_URL, EVENT)).html);
    const ruled = parseAndNormalizeExtraction(extractByRules({ sourceUrl: DEMO_SOURCE_URL, text, event }), "Asia/Tokyo");
    if (!fixed.success || !ruled.success) throw new Error("検証に失敗しました");
    expect(fixed.data.broadcastStatus).toBe(ruled.data.broadcastStatus);
    expect(fixed.data.broadcasts).toEqual(ruled.data.broadcasts);
  });
});

describe("FixtureStore（パスの安全性）", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "miruriku-fixtures-"));
    await mkdir(path.join(dir, "pages"));
    await writeFile(path.join(dir, "pages", "ok.html"), "<p>{{EVENT_NAME}}</p>");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function storeWith(entries: unknown[]): Promise<FixtureStore> {
    await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ version: 1, entries }));
    return new FixtureStore(dir);
  }

  it("ルート外のファイルを指す manifest は拒否する", async () => {
    const store = await storeWith([{ sourceUrl: "https://example.org/a", page: "../../etc/passwd" }]);
    await expect(store.loadPage("https://example.org/a", EVENT)).rejects.toMatchObject({ code: "FIXTURE_INVALID" });
  });

  it("HTML に埋め込むトークンの値はエスケープする", async () => {
    const store = await storeWith([{ sourceUrl: "https://example.org/a", page: "pages/ok.html" }]);
    const page = await store.loadPage("https://example.org/a", { ...EVENT, name: '<script>"x"</script>' });
    expect(page.html).not.toContain("<script>");
  });

  it("manifest の形式が不正なら FIXTURE_INVALID", async () => {
    const store = await storeWith([{ sourceUrl: "https://example.org/a", page: "pages/ok.html", unexpected: true }]);
    await expect(store.loadPage("https://example.org/a", EVENT)).rejects.toMatchObject({ code: "FIXTURE_INVALID" });
  });
});
