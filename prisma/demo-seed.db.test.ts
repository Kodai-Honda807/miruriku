/**
 * デモデータ（prisma/demo-seed.ts）の DB 統合テスト。
 * TEST_DATABASE_URL（データベース名が _test で終わるもの）に対して実行する。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestPrisma, resetDatabase } from "../test/db";
import { dbDateToLocalDate, jstDateOf, toZonedParts } from "../src/domain/datetime";
import { seedDemoData } from "./demo-seed";

const BASE_DATE = "2026-10-10";
const prisma = createTestPrisma();

async function countAll() {
  const [series, events, sessions, slots, sources, runs, candidates] = await Promise.all([
    prisma.eventSeries.count(),
    prisma.event.count(),
    prisma.eventSession.count(),
    prisma.broadcastSlot.count(),
    prisma.source.count(),
    prisma.collectionRun.count(),
    prisma.extractionCandidate.count(),
  ]);
  return { series, events, sessions, slots, sources, runs, candidates };
}

function loadDemoEvents() {
  return prisma.event.findMany({
    where: { isDemo: true },
    include: { series: true, broadcasts: true, sessions: true, sources: true },
    orderBy: { startDate: "asc" },
  });
}
type DemoEvent = Awaited<ReturnType<typeof loadDemoEvents>>[number];

/** 公開ページに出る放送枠のうち、今年の情報として数える枠 */
function currentPublishedSlots(e: DemoEvent) {
  return e.broadcasts.filter((s) => s.status === "PUBLISHED" && s.verificationStatus !== "PAST_REFERENCE");
}
const published = (events: DemoEvent[]) => events.filter((e) => e.status === "PUBLISHED");

describe("seedDemoData", () => {
  let events: DemoEvent[] = [];
  let firstCounts: Awaited<ReturnType<typeof countAll>>;

  beforeAll(async () => {
    await resetDatabase(prisma);

    // デモ以外のデータ（seed が触れてはいけない）
    const series = await prisma.eventSeries.create({ data: { slug: "qa-real-series", name: "QA 非デモシリーズ" } });
    await prisma.event.create({
      data: {
        slug: "qa-non-demo-event",
        seriesId: series.id,
        name: "QA 非デモ大会",
        seasonYear: 2026,
        category: "TRACK",
        startDate: new Date("2026-11-01T00:00:00Z"),
        endDate: new Date("2026-11-01T00:00:00Z"),
        broadcasts: { create: [{ medium: "RADIO", providerName: "QA ラジオ" }] },
      },
    });

    const result = await seedDemoData(prisma, { baseDate: BASE_DATE });
    expect(result).toEqual({ baseDate: BASE_DATE, eventCount: 14 });
    firstCounts = await countAll();
    events = await loadDemoEvents();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("2 回実行しても件数が増えない（固定 ID で upsert）", async () => {
    await seedDemoData(prisma, { baseDate: BASE_DATE });
    expect(await countAll()).toEqual(firstCounts);
    expect(firstCounts.events).toBe(15); // デモ 14 件 + 非デモ 1 件
  });

  it("再実行でデモ大会は定義どおりに初期化される（承認で増えた枠・候補・収集履歴も消える）", async () => {
    const demo = await prisma.event.findUniqueOrThrow({ where: { slug: "demo-city-marathon" }, include: { sources: true } });
    const source = demo.sources.find((s) => s.collectEnabled)!;
    const run = await prisma.collectionRun.create({
      data: { sourceId: source.id, fetchMode: "FIXTURE", providerId: "fixture", providerKind: "FIXTURE", status: "SUCCEEDED" },
    });
    await prisma.extractionCandidate.create({
      data: {
        eventId: demo.id,
        sourceId: source.id,
        runId: run.id,
        fetchMode: "FIXTURE",
        providerId: "fixture",
        providerKind: "FIXTURE",
        payload: {},
        diff: {},
      },
    });
    await prisma.broadcastSlot.create({ data: { eventId: demo.id, medium: "BS", providerName: "承認で追加された枠" } });
    await prisma.event.update({ where: { id: demo.id }, data: { broadcastInfoStatus: "CONFIRMED", name: "書き換え" } });

    await seedDemoData(prisma, { baseDate: BASE_DATE });

    expect(await countAll()).toEqual(firstCounts);
    const after = await prisma.event.findUniqueOrThrow({ where: { slug: "demo-city-marathon" } });
    expect(after.name).toBe("みる陸デモ市民マラソン");
    expect(after.broadcastInfoStatus).toBe("UNVERIFIED");
  });

  it("デモ以外のデータには触れない", async () => {
    const nonDemo = await prisma.event.findUniqueOrThrow({
      where: { slug: "qa-non-demo-event" },
      include: { broadcasts: true, series: true },
    });
    expect(nonDemo.isDemo).toBe(false);
    expect(nonDemo.series.isDemo).toBe(false);
    expect(nonDemo.broadcasts).toHaveLength(1);
  });

  it("デモ大会・シリーズはすべて isDemo=true", async () => {
    expect(events).toHaveLength(14);
    expect(events.every((e) => e.isDemo && e.series.isDemo)).toBe(true);
    expect(await prisma.eventSeries.count({ where: { isDemo: true } })).toBe(14);
  });

  it("基準日からの相対日付で作られる（今日の大会がある）", () => {
    const today = published(events).filter((e) => dbDateToLocalDate(e.startDate) === BASE_DATE);
    expect(today.length).toBeGreaterThanOrEqual(2);
    expect(events.every((e) => e.seasonYear === Number(dbDateToLocalDate(e.startDate).slice(0, 4)))).toBe(true);
  });

  it("URL は予約ドメイン（example.com / example.org）のみ", async () => {
    const urls: string[] = [];
    for (const e of events) {
      urls.push(...[e.officialUrl, e.series.officialUrl].filter((u): u is string => !!u));
      for (const s of e.broadcasts) urls.push(...[s.watchUrl, s.infoUrl].filter((u): u is string => !!u));
      for (const s of e.sources) urls.push(s.url);
    }
    expect(urls.length).toBeGreaterThan(20);
    for (const u of urls) {
      const url = new URL(u);
      expect(url.protocol, u).toBe("https:");
      expect(["example.com", "example.org"], u).toContain(url.hostname);
    }
  });

  describe("要求ケースが含まれる", () => {
    it("地上波のみ", () => {
      expect(
        published(events).some((e) => {
          const slots = currentPublishedSlots(e);
          return slots.length > 0 && slots.every((s) => s.medium === "TERRESTRIAL");
        }),
      ).toBe(true);
    });

    it("YouTube 無料ライブ", () => {
      expect(
        published(events).some((e) =>
          currentPublishedSlots(e).some(
            (s) => s.medium === "INTERNET" && s.cost === "FREE" && s.viewingType === "LIVE" && s.providerName.includes("YouTube"),
          ),
        ),
      ).toBe(true);
    });

    it("地上波とネット配信の併用", () => {
      expect(
        published(events).some((e) => {
          const media = new Set(currentPublishedSlots(e).map((s) => s.medium));
          return media.has("TERRESTRIAL") && media.has("INTERNET");
        }),
      ).toBe(true);
    });

    it("BS のみ", () => {
      expect(
        published(events).some((e) => {
          const slots = currentPublishedSlots(e);
          return slots.length > 0 && slots.every((s) => s.medium === "BS");
        }),
      ).toBe(true);
    });

    it("地域限定の地上波", () => {
      expect(
        published(events).some((e) =>
          currentPublishedSlots(e).some((s) => s.medium === "TERRESTRIAL" && s.region === "REGIONAL" && !!s.regionNote),
        ),
      ).toBe(true);
    });

    it("有料ネット配信", () => {
      expect(
        published(events).some((e) => currentPublishedSlots(e).some((s) => s.medium === "INTERNET" && s.cost === "PAID")),
      ).toBe(true);
    });

    it("放送・配信情報が未確認（大会全体）と未確認の枠", () => {
      expect(published(events).some((e) => e.broadcastInfoStatus === "UNVERIFIED" && e.broadcasts.length === 0)).toBe(true);
      expect(
        published(events).some((e) =>
          e.broadcasts.some((s) => s.status === "PUBLISHED" && s.verificationStatus === "UNVERIFIED"),
        ),
      ).toBe(true);
    });

    it("開始時刻不明", () => {
      expect(published(events).some((e) => e.startAt === null)).toBe(true);
    });

    it("複数日開催（セッション別の日時を含む）", () => {
      const multi = published(events).filter((e) => e.startDate.getTime() !== e.endDate.getTime());
      expect(multi.length).toBeGreaterThan(0);
      expect(multi.some((e) => e.sessions.length >= 2 && e.sessions.some((s) => s.startAt === null))).toBe(true);
    });

    it("海外開催で日本時間の日付が変わる", () => {
      const overseas = published(events).filter((e) => e.timezone !== "Asia/Tokyo" && e.startAt);
      expect(
        overseas.some((e) => {
          const local = toZonedParts(e.startAt!, e.timezone).date;
          return local === dbDateToLocalDate(e.startDate) && jstDateOf(e.startAt!) !== local;
        }),
      ).toBe(true);
    });

    it("複数の放送・配信枠", () => {
      expect(published(events).some((e) => currentPublishedSlots(e).length >= 2)).toBe(true);
    });

    it("公式に放送・配信なし（枠なし）", () => {
      expect(
        published(events).some((e) => e.broadcastInfoStatus === "NO_BROADCAST" && e.broadcasts.length === 0 && !!e.broadcastNote),
      ).toBe(true);
    });

    it("過去大会の参考情報（大会の状態と枠の検証状態の両方）", () => {
      expect(
        published(events).some(
          (e) =>
            e.broadcastInfoStatus === "PAST_REFERENCE" &&
            e.broadcasts.length > 0 &&
            e.broadcasts.every((s) => s.verificationStatus === "PAST_REFERENCE"),
        ),
      ).toBe(true);
    });

    it("下書き（大会・放送枠）", () => {
      expect(events.some((e) => e.status === "DRAFT")).toBe(true);
      expect(published(events).some((e) => e.broadcasts.some((s) => s.status === "DRAFT"))).toBe(true);
    });

    it("終了済みの大会", () => {
      expect(published(events).some((e) => dbDateToLocalDate(e.endDate) < BASE_DATE)).toBe(true);
    });

    it("収集デモ用の情報源（collectEnabled）が 1 件以上ある", () => {
      expect(events.flatMap((e) => e.sources).filter((s) => s.collectEnabled).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("放送枠の確認日時は確認済みの枠にだけ入る（未確認・参考情報の枠には入らない）", () => {
    for (const s of events.flatMap((e) => e.broadcasts)) {
      if (s.verificationStatus !== "CONFIRMED") expect(s.verifiedAt, s.id).toBeNull();
    }
  });
});
