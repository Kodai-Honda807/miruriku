import { describe, expect, it } from "vitest";

import { REAL_EVENTS } from "../../../data/real-events";
import type { RealEventDef } from "../../../prisma/real-events";
import { publicEventsFromRealEvents } from "./from-real-events";
import { parsePublicData, serializePublicData } from "./json";

const BASE: RealEventDef = {
  slug: "test-marathon-2026",
  series: { slug: "test-marathon", name: "テストマラソン", officialUrl: null },
  name: "テストマラソン2026",
  editionLabel: null,
  category: "MARATHON",
  description: "説明",
  venueName: null,
  venueRegion: null,
  countryCode: "US",
  timezone: "America/New_York",
  startDate: "2026-11-01",
  endDate: "2026-11-01",
  startTime: "08:00",
  officialUrl: "https://marathon.test/",
  broadcastInfoStatus: "CONFIRMED",
  broadcastNote: null,
  broadcastCheckedAt: "2026-10-16T06:00:00+09:00",
  sessions: [{ key: "main", name: "本戦", date: "2026-11-01", startTime: "08:00", note: null }],
  sources: [
    { key: "other", kind: "OTHER", url: "https://x.test/a", title: "その他", note: "内部メモ", collectEnabled: true },
    { key: "tv", kind: "BROADCAST_INFO", url: "https://tv.test/", title: "放送案内" },
    { key: "official", kind: "OFFICIAL_SITE", url: "https://marathon.test/info", title: "公式" },
  ],
  slots: [
    {
      key: "late",
      medium: "BS",
      providerName: "深夜BS",
      airDate: "2026-11-01",
      startTime: "23:00",
      endTime: "01:30",
      cost: "FREE",
      viewingType: "LIVE",
      region: "NATIONWIDE",
      regionNote: null,
      note: null,
      watchUrl: null,
      infoUrl: "https://tv.test/late",
      verificationStatus: "CONFIRMED",
      sourceKey: "tv",
      verifiedAt: "2026-10-16T06:00:00+09:00",
    },
    {
      key: "unknown-time",
      medium: "INTERNET",
      providerName: "配信",
      airDate: null,
      startTime: null,
      endTime: null,
      cost: "UNKNOWN",
      viewingType: "UNKNOWN",
      region: "UNKNOWN",
      regionNote: null,
      note: "未確認",
      watchUrl: null,
      infoUrl: null,
      verificationStatus: "UNVERIFIED",
      sourceKey: null,
      verifiedAt: null,
    },
  ],
};

describe("publicEventsFromRealEvents", () => {
  it("data/real-events.ts の全大会を変換できる（定義の検証も通る）", () => {
    const events = publicEventsFromRealEvents(REAL_EVENTS);
    expect(events).toHaveLength(REAL_EVENTS.length);
    expect(events.every((e) => !e.isDemo)).toBe(true);
    // 開始日の昇順
    const dates = events.map((e) => e.startDate);
    expect(dates).toEqual([...dates].sort());
  });

  it("時刻は大会・セッションが開催地の現地時刻、放送枠が日本時間。日付をまたぐ放送は翌日に終わる", () => {
    const [event] = publicEventsFromRealEvents([BASE]);
    // ニューヨーク 08:00（夏時間終了後の EST, UTC-5）
    expect(event.startAt?.toISOString()).toBe("2026-11-01T13:00:00.000Z");
    expect(event.sessions[0].startAt?.toISOString()).toBe("2026-11-01T13:00:00.000Z");
    const late = event.broadcasts[0];
    expect(late.startAt?.toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(late.endAt?.toISOString()).toBe("2026-11-01T16:30:00.000Z");
    expect(event.broadcasts[1]).toMatchObject({ airDate: null, startAt: null, endAt: null });
  });

  it("放送枠は定義順、情報源は種別順（大会公式 → 放送・配信案内 → その他）。出典は URL とタイトルだけ", () => {
    const [event] = publicEventsFromRealEvents([BASE]);
    expect(event.broadcasts.map((b) => b.providerName)).toEqual(["深夜BS", "配信"]);
    expect(event.sources.map((s) => s.kind)).toEqual(["OFFICIAL_SITE", "BROADCAST_INFO", "OTHER"]);
    expect(event.broadcasts[0].source).toEqual({ url: "https://tv.test/", title: "放送案内" });
    expect(event.broadcasts[1].source).toBeNull();
  });

  it("情報源のメモ・収集設定は公開データに含めない", () => {
    const json = serializePublicData(publicEventsFromRealEvents([BASE]));
    expect(json).not.toContain("内部メモ");
    expect(json).not.toContain("collectEnabled");
  });

  it("定義に問題があれば例外（推測で埋めずにビルドを止める）", () => {
    const broken = { ...BASE, slots: [{ ...BASE.slots[0], sourceKey: null }] };
    expect(() => publicEventsFromRealEvents([broken])).toThrow(/出典/);
  });
});

describe("公開データの JSON", () => {
  it("書き出して読み込むと元に戻る（日時は Date）", () => {
    const events = publicEventsFromRealEvents([BASE, ...REAL_EVENTS]);
    const restored = parsePublicData(serializePublicData(events));
    expect(restored).toEqual(events);
    expect(restored[0].broadcastCheckedAt).toBeInstanceOf(Date);
  });

  it("形式が違えば例外", () => {
    expect(() => parsePublicData(JSON.stringify({ schemaVersion: 999, events: [] }))).toThrow(/形式/);
    const [event] = JSON.parse(serializePublicData(publicEventsFromRealEvents([BASE]))).events;
    expect(() =>
      parsePublicData(JSON.stringify({ schemaVersion: 1, events: [{ ...event, startAt: "2026-11-01" }] })),
    ).toThrow(/形式/);
    expect(() => parsePublicData(JSON.stringify({ schemaVersion: 1, events: [{ ...event, extra: 1 }] }))).toThrow(
      /形式/,
    );
  });
});
