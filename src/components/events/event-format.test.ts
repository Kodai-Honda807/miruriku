import { describe, expect, it } from "vitest";

import { JST, zonedToUtc } from "@/domain/datetime";
import { getPeriodRange } from "@/domain/filters";

import {
  buildEventScheduleView,
  countryNameJa,
  formatCheckedAt,
  formatPeriodRange,
  formatRegion,
  isOverseas,
  splitSlots,
} from "./event-format";
import { makeBroadcast } from "./test-fixtures";

const NOW = zonedToUtc("2026-10-10", "12:00", JST);

describe("formatPeriodRange", () => {
  it("今日・今週（7日間）・この先の実際の日付範囲（日本時間）", () => {
    expect(formatPeriodRange(getPeriodRange("today", NOW), NOW)).toBe("10月10日（土）");
    expect(formatPeriodRange(getPeriodRange("week", NOW), NOW)).toBe("10月10日（土）〜10月16日（金）");
    expect(formatPeriodRange(getPeriodRange("upcoming", NOW), NOW)).toBe("10月10日（土）以降");
  });

  it("日本時間の日付境界で判定する（UTC では前日でも日本時間の今日）", () => {
    const earlyMorningJst = zonedToUtc("2026-10-10", "00:30", JST);
    expect(formatPeriodRange(getPeriodRange("today", earlyMorningJst), earlyMorningJst)).toBe("10月10日（土）");
  });

  it("年をまたぐ今週は年を付ける", () => {
    const now = zonedToUtc("2026-12-29", "12:00", JST);
    expect(formatPeriodRange(getPeriodRange("week", now), now)).toBe("2026年12月29日（火）〜2027年1月4日（月）");
  });
});

describe("formatRegion", () => {
  it("地域限定は詳細を併記し、それ以外はラベルのみ", () => {
    expect(formatRegion({ region: "REGIONAL", regionNote: "テスト県内のみ" })).toBe("地域限定（テスト県内のみ）");
    expect(formatRegion({ region: "REGIONAL", regionNote: null })).toBe("地域限定");
    expect(formatRegion({ region: "JAPAN_UNKNOWN", regionNote: null })).toBe("日本での視聴可否不明");
    expect(formatRegion({ region: "NATIONWIDE", regionNote: "無視される" })).toBe("全国");
  });
});

describe("countryNameJa / isOverseas", () => {
  it("国コードを日本語の国名にする（解釈できなければコードのまま）", () => {
    expect(countryNameJa("CH")).toBe("スイス");
    expect(countryNameJa("jp")).toBe("日本");
    expect(countryNameJa("??")).toBe("??");
  });

  it("国コードまたはタイムゾーンが日本以外なら海外", () => {
    expect(isOverseas({ countryCode: "JP", timezone: JST })).toBe(false);
    expect(isOverseas({ countryCode: "CH", timezone: "Europe/Zurich" })).toBe(true);
  });
});

describe("formatCheckedAt", () => {
  it("日本時間で表示し、年が違えば年を付ける", () => {
    expect(formatCheckedAt(zonedToUtc("2026-10-08", "10:00", JST), NOW)).toBe("10月8日（木）10:00");
    expect(formatCheckedAt(zonedToUtc("2025-12-31", "23:59", JST), NOW)).toBe("2025年12月31日（水）23:59");
    expect(formatCheckedAt(zonedToUtc("2026-10-08", "10:00", JST), NOW, { forceYear: true })).toBe(
      "2026年10月8日（木）10:00",
    );
  });
});

describe("buildEventScheduleView", () => {
  it("開始時刻不明でも 0:00 を作らない", () => {
    const view = buildEventScheduleView(
      { startDate: "2026-10-13", endDate: "2026-10-13", startAt: null, timezone: JST },
      NOW,
    );
    expect(view.labels.startTimeLabel).toBeNull();
    expect(view.labels.startTimeUnknownLabel).toBe("開始時刻未確認");
    expect(view.withYear).toBe(false);
  });
});

describe("splitSlots", () => {
  it("過去大会の参考情報の枠を分け、元の順序を保つ", () => {
    const a = makeBroadcast({ id: "a" });
    const b = makeBroadcast({ id: "b", verificationStatus: "PAST_REFERENCE" });
    const c = makeBroadcast({ id: "c", verificationStatus: "UNVERIFIED" });
    expect(splitSlots([a, b, c])).toEqual({ current: [a, c], pastReference: [b] });
  });
});
