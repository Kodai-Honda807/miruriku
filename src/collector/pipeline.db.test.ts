/**
 * 収集パイプラインの DB 統合テスト（専用 DB: miruriku_collector_test）。
 * 外部ネットワークにはアクセスしない（固定ファイルモード、または MockAgent と差し替えた名前解決）。
 */
import { MockAgent } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { parseStoredPayload } from "@/domain/candidate";
import type { CandidateDiff } from "@/domain/diff";
import type { PrismaClient } from "@/lib/prisma";

import { seedDemoData } from "../../prisma/demo-seed";
import { createTestPrisma, resetDatabase } from "../../test/db";
import { runCollectCli } from "./cli";
import { FixtureStore } from "./fixtures";
import { HttpPageFetcher } from "./http-fetcher";
import { collectSource } from "./pipeline";
import { createProviderRegistry } from "./providers/registry";
import type { ExtractionProvider } from "./providers/types";

const BASE_DATE = "2026-10-10";
const DEMO_SOURCE_ID = "seed-demo-city-marathon-source-broadcast";
const DISABLED_SOURCE_ID = "seed-demo-city-marathon-source-official";
const DEMO_SOURCE_URL = "https://example.com/miruriku-demo/city-marathon/broadcast";
const NOW = new Date("2026-10-10T03:00:00.000Z");

let prisma: PrismaClient;

beforeAll(() => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma, { baseDate: BASE_DATE });
});

afterEach(async () => {
  // どの経路でも実行記録が RUNNING のまま残らないこと
  expect(await prisma.collectionRun.count({ where: { status: "RUNNING" } })).toBe(0);
});

/** 公開データ（大会・セッション・放送枠・シリーズ）のスナップショット */
async function publicSnapshot() {
  const [series, events, sessions, slots] = await Promise.all([
    prisma.eventSeries.findMany({ orderBy: { id: "asc" } }),
    prisma.event.findMany({ orderBy: { id: "asc" } }),
    prisma.eventSession.findMany({ orderBy: { id: "asc" } }),
    prisma.broadcastSlot.findMany({ orderBy: { id: "asc" } }),
  ]);
  return { series, events, sessions, slots };
}

function providerReturning(raw: unknown | (() => unknown)): ExtractionProvider {
  return {
    id: "test-provider",
    kind: "LLM",
    description: "テスト用",
    fixtureOnly: false,
    async extract() {
      return typeof raw === "function" ? (raw as () => unknown)() : raw;
    },
  };
}

function registryWith(provider: ExtractionProvider) {
  const registry = new Map(createProviderRegistry());
  registry.set(provider.id, provider);
  return registry;
}

const fixtureOptions = { fetchMode: "fixture" as const, providerId: "rule-based", now: () => NOW };

describe("collectSource（固定ファイルモード）", () => {
  it("PENDING の候補と SUCCEEDED の実行を作り、公開データは変えない", async () => {
    const before = await publicSnapshot();

    const result = await collectSource(prisma, DEMO_SOURCE_ID, fixtureOptions);
    expect(result).toMatchObject({ outcome: "SUCCEEDED", fetchMode: "FIXTURE", providerKind: "RULE_BASED", errorCode: null });
    expect(result.candidateId).not.toBeNull();

    const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(run).toMatchObject({
      sourceId: DEMO_SOURCE_ID,
      status: "SUCCEEDED",
      fetchMode: "FIXTURE",
      providerId: "rule-based",
      providerKind: "RULE_BASED",
      httpStatus: null,
      contentType: "text/html; charset=utf-8",
      errorCode: null,
      errorMessage: null,
    });
    expect(run.finishedAt).toEqual(NOW);
    expect(run.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(run.byteLength).toBeGreaterThan(0);

    const candidate = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: result.candidateId! } });
    expect(candidate).toMatchObject({
      sourceId: DEMO_SOURCE_ID,
      runId: run.id,
      reviewStatus: "PENDING",
      fetchMode: "FIXTURE",
      providerId: "rule-based",
      providerKind: "RULE_BASED",
      contentHash: run.contentHash,
    });
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "demo-city-marathon" } });
    expect(candidate.eventId).toBe(event.id);

    // payload は管理画面が読み戻せる形（normalizedExtractionSchema）
    const payload = parseStoredPayload(candidate.payload);
    expect(payload.broadcastStatus).toBe("CONFIRMED");
    expect(payload.broadcasts.map((b) => [b.medium, b.providerName, b.startAt, b.endAt, b.viewingType, b.cost, b.region, b.watchUrl])).toEqual([
      ["TERRESTRIAL", "みる陸デモ中央テレビ（架空）", "2026-10-10T23:50:00.000Z", "2026-10-11T02:30:00.000Z", "LIVE", "FREE", "NATIONWIDE", null],
      [
        "INTERNET",
        "みる陸デモ配信（架空）",
        "2026-10-10T23:50:00.000Z",
        "2026-10-11T02:30:00.000Z",
        "LIVE",
        "FREE",
        "NATIONWIDE",
        "https://example.com/miruriku-demo/watch/city-marathon",
      ],
    ]);

    const diff = candidate.diff as unknown as CandidateDiff;
    expect(diff.eventChanges).toEqual([{ field: "broadcastInfoStatus", before: "UNVERIFIED", after: "CONFIRMED" }]);
    expect(diff.slots.map((s) => s.kind)).toEqual(["add", "add"]);
    expect(diff.hasChanges).toBe(true);

    // 公開データは変化しない。固定ファイルモードでは取得日時も更新しない
    expect(await publicSnapshot()).toEqual(before);
    const source = await prisma.source.findUniqueOrThrow({ where: { id: DEMO_SOURCE_ID } });
    expect(source.lastFetchedAt).toBeNull();
  });

  it("2 回実行しても同じ内容の候補を重複して作らない", async () => {
    const first = await collectSource(prisma, DEMO_SOURCE_ID, fixtureOptions);
    const second = await collectSource(prisma, DEMO_SOURCE_ID, fixtureOptions);
    expect(second).toMatchObject({ outcome: "SUCCEEDED", candidateId: null, duplicateOfCandidateId: first.candidateId });
    expect(await prisma.extractionCandidate.count()).toBe(1);
    const runs = await prisma.collectionRun.findMany({ where: { sourceId: DEMO_SOURCE_ID } });
    expect(runs.map((r) => r.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(new Set(runs.map((r) => r.contentHash)).size).toBe(1);
  });

  it("前回の候補がレビュー済みなら新しい候補を作る", async () => {
    const first = await collectSource(prisma, DEMO_SOURCE_ID, fixtureOptions);
    await prisma.extractionCandidate.update({ where: { id: first.candidateId! }, data: { reviewStatus: "REJECTED" } });
    const second = await collectSource(prisma, DEMO_SOURCE_ID, fixtureOptions);
    expect(second.candidateId).not.toBeNull();
    expect(second.candidateId).not.toBe(first.candidateId);
  });

  it("fixture プロバイダは FIXTURE として正直に記録する", async () => {
    const result = await collectSource(prisma, DEMO_SOURCE_ID, { ...fixtureOptions, providerId: "fixture" });
    expect(result).toMatchObject({ outcome: "SUCCEEDED", providerKind: "FIXTURE" });
    const candidate = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: result.candidateId! } });
    expect(candidate.providerKind).toBe("FIXTURE");
    expect(parseStoredPayload(candidate.payload).broadcasts).toHaveLength(2);
  });

  it("ドライランでは DB に書き込まず、抽出結果と差分を返す", async () => {
    const result = await collectSource(prisma, DEMO_SOURCE_ID, { ...fixtureOptions, dryRun: true });
    expect(result).toMatchObject({ outcome: "SUCCEEDED", dryRun: true, runId: null, candidateId: null });
    expect(result.extraction?.broadcasts).toHaveLength(2);
    expect(result.diff?.slots).toHaveLength(2);
    expect(await prisma.collectionRun.count()).toBe(0);
    expect(await prisma.extractionCandidate.count()).toBe(0);
  });
});

describe("collectSource（実行しない・失敗する場合）", () => {
  it("collectEnabled=false の情報源は実行しない", async () => {
    const result = await collectSource(prisma, DISABLED_SOURCE_ID, fixtureOptions);
    expect(result).toMatchObject({ outcome: "REJECTED", errorCode: "SOURCE_DISABLED", runId: null });
    expect(await prisma.collectionRun.count()).toBe(0);
    expect(await prisma.extractionCandidate.count()).toBe(0);
  });

  it("存在しない情報源は実行しない", async () => {
    const result = await collectSource(prisma, "no-such-source", fixtureOptions);
    expect(result).toMatchObject({ outcome: "REJECTED", errorCode: "SOURCE_NOT_FOUND" });
    expect(await prisma.collectionRun.count()).toBe(0);
  });

  it("fixture プロバイダを HTTP 取得と組み合わせることはできない", async () => {
    const result = await collectSource(prisma, DEMO_SOURCE_ID, { fetchMode: "http", providerId: "fixture" });
    expect(result).toMatchObject({ outcome: "REJECTED", errorCode: "PROVIDER_NOT_ALLOWED" });
    expect(await prisma.collectionRun.count()).toBe(0);
  });

  it.each([
    ["javascript: の視聴 URL", { broadcastStatus: "CONFIRMED", broadcasts: [{ medium: "INTERNET", providerName: "x", watchUrl: "javascript:alert(1)" }] }],
    ["想定外のキー", { broadcastStatus: "CONFIRMED", publishAllEvents: true }],
    ["長すぎる文字列", { broadcasts: [{ medium: "BS", providerName: "あ".repeat(500) }] }],
    ["NO_BROADCAST と枠の同時指定", { broadcastStatus: "NO_BROADCAST", broadcasts: [{ medium: "BS", providerName: "x" }] }],
  ])("検証に失敗した出力（%s）は FAILED で記録し、候補を作らず公開データを壊さない", async (_, raw) => {
    const before = await publicSnapshot();
    const provider = providerReturning(raw);
    const result = await collectSource(prisma, DEMO_SOURCE_ID, {
      ...fixtureOptions,
      providerId: provider.id,
      providers: registryWith(provider),
    });
    expect(result).toMatchObject({ outcome: "FAILED", errorCode: "VALIDATION_FAILED" });
    const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(run).toMatchObject({ status: "FAILED", errorCode: "VALIDATION_FAILED", providerKind: "LLM" });
    expect(run.errorMessage).toContain("スキーマに適合しません");
    expect(run.finishedAt).toEqual(NOW);
    expect(await prisma.extractionCandidate.count()).toBe(0);
    expect(await publicSnapshot()).toEqual(before);
  });

  it("プロバイダの例外は PROVIDER_FAILED", async () => {
    const provider = providerReturning(() => {
      throw new Error("model unavailable");
    });
    const result = await collectSource(prisma, DEMO_SOURCE_ID, {
      ...fixtureOptions,
      providerId: provider.id,
      providers: registryWith(provider),
    });
    expect(result).toMatchObject({ outcome: "FAILED", errorCode: "PROVIDER_FAILED" });
    expect(await prisma.extractionCandidate.count()).toBe(0);
  });

  it("固定ファイルがない情報源は FIXTURE_NOT_FOUND", async () => {
    await prisma.source.update({ where: { id: DISABLED_SOURCE_ID }, data: { collectEnabled: true } });
    const result = await collectSource(prisma, DISABLED_SOURCE_ID, fixtureOptions);
    expect(result).toMatchObject({ outcome: "FAILED", errorCode: "FIXTURE_NOT_FOUND" });
  });

  it("予期しない例外でも実行記録を FAILED（INTERNAL_ERROR）にする", async () => {
    const before = await publicSnapshot();
    const result = await collectSource(prisma, DEMO_SOURCE_ID, {
      fetchMode: "http",
      providerId: "rule-based",
      now: () => NOW,
      httpFetcher: {
        fetchPage: async () => {
          throw new TypeError("boom");
        },
        close: async () => undefined,
      },
    });
    expect(result).toMatchObject({ outcome: "FAILED", errorCode: "INTERNAL_ERROR" });
    const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(run).toMatchObject({ status: "FAILED", errorCode: "INTERNAL_ERROR" });
    expect(run.errorMessage).toContain("boom");
    expect(await publicSnapshot()).toEqual(before);
  });
});

describe("collectSource（HTTP モード。MockAgent を使い外部には接続しない）", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent({ enableCallHistory: true });
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  function httpFetcher() {
    return new HttpPageFetcher({
      dispatcher: agent,
      resolveAll: async () => [{ address: "93.184.215.14", family: 4 }],
      userAgent: "mirurikuBot/test",
      sleep: async () => undefined,
    });
  }

  async function demoHtml() {
    return (await new FixtureStore().loadPage(DEMO_SOURCE_URL, { name: "みる陸デモ市民マラソン", startDate: "2026-10-11", endDate: "2026-10-11" }))
      .html;
  }

  it("取得に成功したら HTTP の情報を記録し、取得日時を更新する", async () => {
    const pool = agent.get("https://example.com");
    pool.intercept({ path: "/robots.txt" }).reply(404, "");
    pool.intercept({ path: "/miruriku-demo/city-marathon/broadcast" }).reply(200, await demoHtml(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    const before = await publicSnapshot();
    const result = await collectSource(prisma, DEMO_SOURCE_ID, {
      fetchMode: "http",
      providerId: "rule-based",
      now: () => NOW,
      httpFetcher: httpFetcher(),
    });
    expect(result).toMatchObject({ outcome: "SUCCEEDED", fetchMode: "HTTP", httpStatus: 200 });
    const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(run).toMatchObject({ status: "SUCCEEDED", fetchMode: "HTTP", httpStatus: 200, finalUrl: DEMO_SOURCE_URL });
    const candidate = await prisma.extractionCandidate.findUniqueOrThrow({ where: { id: result.candidateId! } });
    expect(candidate.fetchMode).toBe("HTTP");
    expect(parseStoredPayload(candidate.payload).broadcasts).toHaveLength(2);
    expect((await prisma.source.findUniqueOrThrow({ where: { id: DEMO_SOURCE_ID } })).lastFetchedAt).toEqual(NOW);
    expect(await publicSnapshot()).toEqual(before);
  });

  it("HTTP エラーは FAILED（HTTP_STATUS）で記録し、候補を作らず公開データを壊さない", async () => {
    const pool = agent.get("https://example.com");
    pool.intercept({ path: "/robots.txt" }).reply(404, "");
    pool.intercept({ path: "/miruriku-demo/city-marathon/broadcast" }).reply(500, "error");
    const before = await publicSnapshot();
    const result = await collectSource(prisma, DEMO_SOURCE_ID, {
      fetchMode: "http",
      providerId: "rule-based",
      now: () => NOW,
      httpFetcher: httpFetcher(),
    });
    expect(result).toMatchObject({ outcome: "FAILED", errorCode: "HTTP_STATUS", httpStatus: 500 });
    const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(run).toMatchObject({ status: "FAILED", errorCode: "HTTP_STATUS", httpStatus: 500, finalUrl: DEMO_SOURCE_URL });
    expect(await prisma.extractionCandidate.count()).toBe(0);
    expect((await prisma.source.findUniqueOrThrow({ where: { id: DEMO_SOURCE_ID } })).lastFetchedAt).toEqual(NOW);
    expect(await publicSnapshot()).toEqual(before);
  });

  it("robots.txt で拒否されたら SKIPPED（ROBOTS_DISALLOWED）でページを取得しない", async () => {
    agent.get("https://example.com").intercept({ path: "/robots.txt" }).reply(200, "User-agent: mirurikuBot\nDisallow: /miruriku-demo/\n", {
      headers: { "content-type": "text/plain" },
    });
    const result = await collectSource(prisma, DEMO_SOURCE_ID, {
      fetchMode: "http",
      providerId: "rule-based",
      now: () => NOW,
      httpFetcher: httpFetcher(),
    });
    expect(result).toMatchObject({ outcome: "SKIPPED", errorCode: "ROBOTS_DISALLOWED" });
    const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.runId! } });
    expect(run.status).toBe("SKIPPED");
    expect(agent.getCallHistory()!.calls().map((c) => c.path)).toEqual(["/robots.txt"]);
    expect(await prisma.extractionCandidate.count()).toBe(0);
  });

  it("禁止アドレスに解決される情報源は FAILED（BLOCKED_ADDRESS）", async () => {
    const fetcher = new HttpPageFetcher({
      dispatcher: agent,
      resolveAll: async () => [{ address: "169.254.169.254", family: 4 }],
      userAgent: "mirurikuBot/test",
      sleep: async () => undefined,
    });
    const result = await collectSource(prisma, DEMO_SOURCE_ID, {
      fetchMode: "http",
      providerId: "rule-based",
      now: () => NOW,
      httpFetcher: fetcher,
    });
    expect(result).toMatchObject({ outcome: "FAILED", errorCode: "BLOCKED_ADDRESS" });
    expect(agent.getCallHistory()!.calls()).toHaveLength(0);
  });
});

describe("runCollectCli（固定ファイルモード）", () => {
  function io() {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  }

  it("大会を指定して候補を作り、2 回目は重複を作らない", async () => {
    const argv = ["--event", "demo-city-marathon", "--fetch", "fixture", "--provider", "rule-based"];
    const first = io();
    expect(await runCollectCli(argv, { db: prisma, io: first.io })).toBe(0);
    const text = first.out.join("\n");
    expect(text).toContain("固定ファイル（デモ・テスト用）");
    expect(text).toContain("AI による収集の結果ではありません");
    expect(text).toContain("収集候補を作成しました");
    expect(text).toContain("枠の追加 2 件");
    expect(text).toContain("収集が許可されていない情報源 1 件は対象外です");

    const second = io();
    expect(await runCollectCli(argv, { db: prisma, io: second.io })).toBe(0);
    expect(second.out.join("\n")).toContain("新しい候補は作成しませんでした");
    expect(await prisma.extractionCandidate.count()).toBe(1);
  });

  it("collectEnabled=false の情報源の指定・存在しない大会は終了コード 1", async () => {
    const t = io();
    expect(await runCollectCli(["--source", DISABLED_SOURCE_ID, "--fetch", "fixture"], { db: prisma, io: t.io })).toBe(1);
    expect(t.out.join("\n")).toContain("SOURCE_DISABLED");
    const u = io();
    expect(await runCollectCli(["--event", "no-such-event", "--fetch", "fixture"], { db: prisma, io: u.io })).toBe(1);
    expect(await prisma.collectionRun.count()).toBe(0);
  });

  it("--all は収集許可済みの情報源だけを処理する", async () => {
    const t = io();
    expect(await runCollectCli(["--all", "--fetch", "fixture", "--dry-run"], { db: prisma, io: t.io })).toBe(0);
    expect(t.out.filter((l) => /^\[\d+\/\d+\]/.test(l))).toHaveLength(1);
    expect(await prisma.collectionRun.count()).toBe(0);
  });
});
