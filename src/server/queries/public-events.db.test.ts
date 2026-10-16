/**
 * 公開用クエリの DB 統合テスト（観戦者向け UI 担当の専用 DB: miruriku_ui_test）。
 *
 *   TEST_DATABASE_URL=postgresql://miruriku:miruriku@localhost:5432/miruriku_ui_test?schema=public \
 *     pnpm exec vitest run --project db src/server/queries/public-events.db.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { JST, localDateToDbDate, zonedToUtc } from "@/domain/datetime";
import type { PrismaClient } from "@/generated/prisma/client";

import { seedDemoData } from "../../../prisma/demo-seed";
import { createTestPrisma, resetDatabase } from "../../../test/db";
import {
  LIST_LOOKBACK_DAYS,
  getPublicEventDetailFrom,
  listPublicEventsFrom,
  listSitemapEventSlugsFrom,
} from "./public-events";

const BASE_DATE = "2026-10-10";
/** 基準日の日本時間 12:00 */
const NOW = zonedToUtc(BASE_DATE, "12:00", JST);

const SUMMARY_KEYS = [
  "broadcastCheckedAt",
  "broadcastInfoStatus",
  "broadcastNote",
  "broadcasts",
  "category",
  "countryCode",
  "editionLabel",
  "endDate",
  "id",
  "isDemo",
  "name",
  "officialUrl",
  "seriesName",
  "slug",
  "startAt",
  "startDate",
  "timezone",
  "venueName",
  "venueRegion",
].sort();

const BROADCAST_KEYS = [
  "airDate",
  "cost",
  "endAt",
  "id",
  "infoUrl",
  "medium",
  "note",
  "providerName",
  "region",
  "regionNote",
  "source",
  "startAt",
  "verificationStatus",
  "verifiedAt",
  "viewingType",
  "watchUrl",
].sort();

let prisma: PrismaClient;

beforeAll(async () => {
  prisma = createTestPrisma();
  await resetDatabase(prisma);
  await seedDemoData(prisma, { baseDate: BASE_DATE });
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("listPublicEventsFrom", () => {
  it("下書きの大会と、終了日が日本時間の今日 − 2 日より前の大会を返さない", async () => {
    const events = await listPublicEventsFrom(prisma, NOW);
    const slugs = events.map((e) => e.slug);

    expect(slugs).not.toContain("demo-draft-ekiden");
    expect(slugs).not.toContain("demo-autumn-relay"); // D-3 に終了
    expect(slugs.sort()).toEqual(
      [
        "demo-bay-ekiden",
        "demo-track-night",
        "demo-city-marathon",
        "demo-seaside-marathon",
        "demo-record-challenge",
        "demo-corporate-road",
        "demo-highland-womens-ekiden",
        "demo-prefecture-ekiden",
        "demo-10000m-night",
        "demo-europe-grand-prix",
        "demo-championships",
        "demo-lakeside-marathon",
      ].sort(),
    );
  });

  it("下書きの放送枠を返さない（公開済みの枠だけを表示順で返す）", async () => {
    const events = await listPublicEventsFrom(prisma, NOW);
    const allProviders = events.flatMap((e) => e.broadcasts.map((b) => b.providerName));
    expect(allProviders).not.toContain("下書きの放送枠（非公開・デモ）");
    expect(allProviders).not.toContain("下書き大会の放送局（デモ）");

    const seaside = events.find((e) => e.slug === "demo-seaside-marathon")!;
    expect(seaside.broadcasts.map((b) => [b.medium, b.viewingType])).toEqual([
      ["TERRESTRIAL", "LIVE"],
      ["INTERNET", "LIVE"],
      ["INTERNET", "ON_DEMAND"],
    ]);
  });

  it("終了日が今日 − 2 日ちょうどの大会は DB の取得対象に含める（時差のある海外大会のため）", async () => {
    expect(LIST_LOOKBACK_DAYS).toBe(2);
    const series = await prisma.eventSeries.create({ data: { slug: "lookback-series", name: "境界テスト" } });
    const boundary = await prisma.event.create({
      data: {
        slug: "lookback-boundary",
        seriesId: series.id,
        name: "境界テスト大会",
        seasonYear: 2026,
        category: "TRACK",
        status: "PUBLISHED",
        timezone: "America/Los_Angeles",
        countryCode: "US",
        startDate: localDateToDbDate("2026-10-08"),
        endDate: localDateToDbDate("2026-10-08"),
      },
    });
    try {
      const slugs = (await listPublicEventsFrom(prisma, NOW)).map((e) => e.slug);
      expect(slugs).toContain("lookback-boundary");
    } finally {
      await prisma.event.delete({ where: { id: boundary.id } });
      await prisma.eventSeries.delete({ where: { id: series.id } });
    }
  });

  it("DB の値を公開用のプレーンな型に変換する（@db.Date は YYYY-MM-DD、必要な列のみ）", async () => {
    const events = await listPublicEventsFrom(prisma, NOW);
    const bay = events.find((e) => e.slug === "demo-bay-ekiden")!;

    expect(Object.keys(bay).sort()).toEqual(SUMMARY_KEYS);
    expect(bay).toMatchObject({
      name: "みる陸デモ湾岸駅伝",
      editionLabel: "第5回",
      seriesName: "みる陸デモ湾岸駅伝",
      category: "EKIDEN",
      isDemo: true,
      countryCode: "JP",
      timezone: "Asia/Tokyo",
      startDate: "2026-10-10",
      endDate: "2026-10-10",
      officialUrl: "https://example.org/miruriku-demo/bay-ekiden",
      broadcastInfoStatus: "CONFIRMED",
    });
    expect(bay.startAt).toEqual(zonedToUtc("2026-10-10", "08:00", JST));
    expect(bay.broadcastCheckedAt).toEqual(zonedToUtc("2026-10-08", "10:00", JST));

    expect(bay.broadcasts).toHaveLength(1);
    const tv = bay.broadcasts[0]!;
    expect(Object.keys(tv).sort()).toEqual(BROADCAST_KEYS);
    expect(tv).toMatchObject({
      medium: "TERRESTRIAL",
      providerName: "デモテレビ系列（架空）",
      airDate: "2026-10-10",
      cost: "FREE",
      viewingType: "LIVE",
      region: "NATIONWIDE",
      watchUrl: null,
      infoUrl: "https://example.com/miruriku-demo/info/bay-ekiden",
      verificationStatus: "CONFIRMED",
    });
    expect(tv.startAt).toEqual(zonedToUtc("2026-10-10", "07:50", JST));
    expect(tv.endAt).toEqual(zonedToUtc("2026-10-10", "14:00", JST));
    // 出典は URL と表示名だけを返す（情報源の内部項目は返さない）
    expect(tv.source === null || Object.keys(tv.source).sort().join(",") === "title,url").toBe(true);
  });

  it("開始時刻不明・海外開催・未確認の枠をそのまま返す", async () => {
    const events = await listPublicEventsFrom(prisma, NOW);

    const corporate = events.find((e) => e.slug === "demo-corporate-road")!;
    expect(corporate.startAt).toBeNull();
    expect(corporate.broadcastInfoStatus).toBe("NOT_ANNOUNCED");
    expect(corporate.broadcasts).toEqual([]);

    const europe = events.find((e) => e.slug === "demo-europe-grand-prix")!;
    expect(europe).toMatchObject({ timezone: "Europe/Zurich", countryCode: "CH", startDate: "2026-10-17" });
    expect(europe.startAt).toEqual(zonedToUtc("2026-10-17", "20:00", "Europe/Zurich"));
    expect(europe.broadcasts.map((b) => [b.medium, b.verificationStatus, b.airDate])).toEqual([
      ["CS", "CONFIRMED", "2026-10-18"],
      ["INTERNET", "UNVERIFIED", null],
    ]);

    const lakeside = events.find((e) => e.slug === "demo-lakeside-marathon")!;
    expect(lakeside.broadcasts.map((b) => b.verificationStatus)).toEqual(["PAST_REFERENCE"]);
  });
});

describe("getPublicEventDetailFrom", () => {
  it("存在しない slug・下書きの大会は null", async () => {
    expect(await getPublicEventDetailFrom(prisma, "no-such-event")).toBeNull();
    expect(await getPublicEventDetailFrom(prisma, "demo-draft-ekiden")).toBeNull();
    expect(await getPublicEventDetailFrom(prisma, "")).toBeNull();
    expect(await getPublicEventDetailFrom(prisma, "x".repeat(500))).toBeNull();
  });

  it("セッション（表示順）・公開済みの放送枠・情報源を含める", async () => {
    const detail = await getPublicEventDetailFrom(prisma, "demo-championships");
    expect(detail).not.toBeNull();
    expect(detail!.description).toBe("3 日間にわたるトラック・フィールドの選手権（デモデータ）。");
    expect(detail!.startDate).toBe("2026-10-20");
    expect(detail!.endDate).toBe("2026-10-22");

    expect(detail!.sessions.map((s) => [s.name, s.date])).toEqual([
      ["1日目（予選・男女10000m決勝）", "2026-10-20"],
      ["2日目（男女100m決勝 ほか）", "2026-10-21"],
      ["3日目（男女1500m決勝 ほか）", "2026-10-22"],
    ]);
    expect(detail!.sessions[0]!.startAt).toEqual(zonedToUtc("2026-10-20", "10:00", JST));
    expect(detail!.sessions[2]).toMatchObject({ startAt: null, note: "競技開始時刻は未発表" });
    expect(Object.keys(detail!.sessions[0]!).sort()).toEqual(["date", "id", "name", "note", "startAt"]);

    expect(detail!.broadcasts).toHaveLength(4);
    expect(detail!.sources.map((s) => s.kind)).toEqual(["OFFICIAL_SITE", "BROADCAST_INFO"]);
    expect(Object.keys(detail!.sources[0]!).sort()).toEqual(["id", "kind", "title", "url"]);
  });

  it("詳細でも下書きの放送枠は返さない", async () => {
    const detail = await getPublicEventDetailFrom(prisma, "demo-seaside-marathon");
    expect(detail!.broadcasts.map((b) => b.providerName)).not.toContain("下書きの放送枠（非公開・デモ）");
    expect(detail!.broadcasts).toHaveLength(3);
  });

  it("終了済みでも公開中の大会の詳細は返す", async () => {
    const detail = await getPublicEventDetailFrom(prisma, "demo-autumn-relay");
    expect(detail?.name).toBe("みる陸デモ秋季リレーマラソン（終了）");
  });
});

describe("listSitemapEventSlugsFrom", () => {
  it("公開中の実在の大会だけを返す（下書き・デモは除き、終了済みは含める）", async () => {
    const series = await prisma.eventSeries.create({ data: { slug: "sitemap-series", name: "サイトマップ" } });
    const base = {
      seriesId: series.id,
      seasonYear: 2026,
      category: "MARATHON" as const,
      timezone: JST,
      countryCode: "JP",
      isDemo: false,
    };
    const created = await Promise.all([
      prisma.event.create({
        data: { ...base, slug: "sitemap-real", name: "実在", status: "PUBLISHED",
          startDate: localDateToDbDate("2026-11-01"), endDate: localDateToDbDate("2026-11-01") },
      }),
      prisma.event.create({
        data: { ...base, slug: "sitemap-past", name: "終了済み", status: "PUBLISHED",
          startDate: localDateToDbDate("2025-01-02"), endDate: localDateToDbDate("2025-01-03") },
      }),
      prisma.event.create({
        data: { ...base, slug: "sitemap-draft", name: "下書き", status: "DRAFT",
          startDate: localDateToDbDate("2026-11-02"), endDate: localDateToDbDate("2026-11-02") },
      }),
    ]);
    try {
      const slugs = await listSitemapEventSlugsFrom(prisma);
      expect(slugs).toEqual(["sitemap-real", "sitemap-past"]); // 開催日の新しい順。デモ大会は含まない
    } finally {
      await prisma.event.deleteMany({ where: { id: { in: created.map((e) => e.id) } } });
      await prisma.eventSeries.delete({ where: { id: series.id } });
    }
  });
});
