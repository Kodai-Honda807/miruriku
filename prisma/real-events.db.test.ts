/**
 * 実在の大会データのロード（prisma/real-events.ts）の DB 統合テスト。
 * TEST_DATABASE_URL（データベース名が _test で終わるもの）に対して実行する。外部ネットワークには接続しない。
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { REAL_EVENTS } from "../data/real-events";
import { JST, zonedToUtc } from "../src/domain/datetime";
import { createTestPrisma, resetDatabase } from "../test/db";
import { seedDemoData } from "./demo-seed";
import { loadRealEvents, realChildId, type RealEventDef } from "./real-events";

const prisma = createTestPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma, { baseDate: "2026-10-10" });
});

async function counts() {
  const [events, slots, sessions, sources, demoEvents, demoSeries] = await Promise.all([
    prisma.event.count({ where: { isDemo: false } }),
    prisma.broadcastSlot.count({ where: { event: { isDemo: false } } }),
    prisma.eventSession.count({ where: { event: { isDemo: false } } }),
    prisma.source.count({ where: { event: { isDemo: false } } }),
    prisma.event.count({ where: { isDemo: true } }),
    prisma.eventSeries.count({ where: { isDemo: true } }),
  ]);
  return { events, slots, sessions, sources, demoEvents, demoSeries };
}

describe("loadRealEvents", () => {
  it("実在の大会を登録し、2 回実行しても重複しない。デモ大会には触れない", async () => {
    const demoBefore = await prisma.event.count({ where: { isDemo: true } });
    const first = await loadRealEvents(prisma, REAL_EVENTS);
    const afterFirst = await counts();
    await loadRealEvents(prisma, REAL_EVENTS);
    const afterSecond = await counts();

    expect(first.eventCount).toBe(REAL_EVENTS.length);
    expect(afterFirst.events).toBe(REAL_EVENTS.length);
    expect(afterFirst.slots).toBe(REAL_EVENTS.reduce((n, e) => n + e.slots.length, 0));
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.demoEvents).toBe(demoBefore);
  });

  it("放送時刻は日本時間、競技開始は開催地の現地時刻として保存する", async () => {
    await loadRealEvents(prisma, REAL_EVENTS);
    const hakone = await prisma.event.findUniqueOrThrow({
      where: { slug: "hakone-ekiden-qualifier-2026" },
      include: { broadcasts: { include: { source: true } } },
    });
    expect(hakone.startAt).toEqual(zonedToUtc("2026-10-17", "08:30", JST));
    const ntv = hakone.broadcasts.find((s) => s.id === realChildId(hakone.slug, "slot", "ntv"))!;
    expect(ntv.startAt).toEqual(zonedToUtc("2026-10-17", "08:25", JST));
    expect(ntv.endAt).toEqual(zonedToUtc("2026-10-17", "10:25", JST));
    expect(ntv.source?.url).toBe("https://www.ntv.co.jp/hakone/info/3760062as8mh7v3nwxdk.html");
    expect(ntv.verifiedAt).toEqual(new Date("2026-10-16T06:00:00+09:00"));

    // 未確認の枠は確認日時を持たない
    const tver = hakone.broadcasts.find((s) => s.id === realChildId(hakone.slug, "slot", "tver"))!;
    expect(tver).toMatchObject({ verificationStatus: "UNVERIFIED", verifiedAt: null, startAt: null });

    // 海外大会: 開始時刻が未確認なら startAt は null（仮の時刻を入れない）
    const nyc = await prisma.event.findUniqueOrThrow({ where: { slug: "new-york-city-marathon-2026" } });
    expect(nyc).toMatchObject({ timezone: "America/New_York", startAt: null, countryCode: "US" });
  });

  it("承認などで追加された枠は残し、定義から外した枠だけを削除する", async () => {
    await loadRealEvents(prisma, REAL_EVENTS);
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: "hakone-ekiden-qualifier-2026" } });
    await prisma.broadcastSlot.create({
      data: { eventId: event.id, medium: "RADIO", providerName: "承認で追加した枠", status: "PUBLISHED" },
    });

    const defs: RealEventDef[] = structuredClone(REAL_EVENTS);
    const hakone = defs.find((e) => e.slug === "hakone-ekiden-qualifier-2026")!;
    hakone.slots = hakone.slots.filter((s) => s.key !== "gtasu");
    await loadRealEvents(prisma, defs);

    const slots = await prisma.broadcastSlot.findMany({ where: { eventId: event.id } });
    expect(slots.map((s) => s.providerName)).toContain("承認で追加した枠");
    expect(slots.find((s) => s.id === realChildId(event.slug, "slot", "gtasu"))).toBeUndefined();
    expect(slots.find((s) => s.id === realChildId(event.slug, "slot", "ntv"))).toBeDefined();
  });

  it("removeDemo を指定したときだけデモ大会とデモのシリーズを削除する", async () => {
    const result = await loadRealEvents(prisma, REAL_EVENTS, { removeDemo: true });
    const after = await counts();
    expect(result.removedDemoEventCount).toBeGreaterThan(0);
    expect(after.demoEvents).toBe(0);
    expect(after.demoSeries).toBe(0);
    expect(after.events).toBe(REAL_EVENTS.length);
  });

  it("定義に問題があれば何も書き込まない", async () => {
    const defs: RealEventDef[] = structuredClone(REAL_EVENTS);
    defs[defs.length - 1]!.slots[0]!.sourceKey = null;
    await expect(loadRealEvents(prisma, defs)).rejects.toThrow(/出典/);
    expect((await counts()).events).toBe(0);
  });
});
