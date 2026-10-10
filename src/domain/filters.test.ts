import { describe, expect, it } from "vitest";

import { JST, zonedToUtc, type LocalDate } from "./datetime";
import type { BroadcastMedium, CostType, SlotVerificationStatus } from "./enums";
import {
  DEFAULT_FILTERS,
  MAX_QUERY_LENGTH,
  filterAndSortEvents,
  getPeriodRange,
  hasActiveFilters,
  isCurrentYearSlot,
  matchesFilters,
  normalizeSearchText,
  parseEventFilters,
  toQueryString,
  toSearchParams,
  type EventFilters,
  type FilterableEvent,
} from "./filters";

const ZURICH = "Europe/Zurich";

/** 2026-10-10（土）12:00 日本時間 */
const NOW = new Date("2026-10-10T03:00:00Z");

type Slot = { medium: BroadcastMedium; cost: CostType; verificationStatus: SlotVerificationStatus };

function slot(medium: BroadcastMedium, cost: CostType, verificationStatus: SlotVerificationStatus = "CONFIRMED"): Slot {
  return { medium, cost, verificationStatus };
}

function event(
  name: string,
  overrides: Partial<FilterableEvent> & { date?: LocalDate; time?: string | null } = {},
): FilterableEvent {
  const { date = "2026-10-10", time = "09:00", ...rest } = overrides;
  const timezone = rest.timezone ?? JST;
  return {
    name,
    seriesName: null,
    category: "MARATHON",
    broadcastInfoStatus: "CONFIRMED",
    broadcasts: [],
    startDate: date,
    endDate: date,
    startAt: time ? zonedToUtc(date, time, timezone) : null,
    timezone,
    ...rest,
  };
}

const filters = (overrides: Partial<EventFilters> = {}): EventFilters => ({ ...DEFAULT_FILTERS, ...overrides });

// 一覧の検証用の大会（NOW = 2026-10-10 12:00 JST）
const EVENTS = {
  bay: event("湾岸駅伝", { category: "EKIDEN", date: "2026-10-10", time: "08:00", broadcasts: [slot("TERRESTRIAL", "FREE")] }),
  trackNight: event("トラックナイト記録会", {
    category: "TRACK",
    date: "2026-10-10",
    time: "18:00",
    seriesName: "Demo Track Series",
    broadcasts: [slot("INTERNET", "FREE")],
  }),
  city: event("市民マラソン", { date: "2026-10-11", time: "09:00", broadcastInfoStatus: "UNVERIFIED" }),
  seaside: event("海浜マラソン", {
    date: "2026-10-12",
    time: "09:10",
    broadcasts: [slot("TERRESTRIAL", "FREE"), slot("INTERNET", "FREE")],
  }),
  zurichDateOnly: event("欧州ロード（時刻不明）", { category: "TRACK", timezone: ZURICH, date: "2026-10-16", time: null, broadcasts: [slot("BS", "FREE")] }),
  tenK: event("10000m ナイト", { category: "TRACK", date: "2026-10-16", time: "19:00", broadcasts: [slot("INTERNET", "PAID")] }),
  grandPrix: event("国際グランプリ", {
    category: "TRACK",
    timezone: ZURICH,
    date: "2026-10-17",
    time: "20:00", // 日本時間 10/18 3:00
    broadcasts: [slot("CS", "PAID")],
  }),
  lakeside: event("湖畔マラソン", {
    date: "2026-10-30",
    time: "09:00",
    broadcastInfoStatus: "PAST_REFERENCE",
    broadcasts: [slot("TERRESTRIAL", "FREE", "PAST_REFERENCE"), slot("INTERNET", "FREE", "PAST_REFERENCE")],
  }),
  ended: event("終了したリレーマラソン", { date: "2026-10-07", time: "09:00", broadcastInfoStatus: "NO_BROADCAST" }),
};
const ALL = Object.values(EVENTS);
const names = (list: FilterableEvent[]) => list.map((e) => e.name);

describe("parseEventFilters", () => {
  it("空なら既定値", () => {
    expect(parseEventFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
    expect(parseEventFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it("不正な値は無視する（エラーにしない）", () => {
    const f = parseEventFilters(
      new URLSearchParams("period=yesterday&category=sprint&category=ekiden&medium=satellite&free=yes&unknown=1"),
    );
    expect(f).toEqual({ ...DEFAULT_FILTERS, categories: ["EKIDEN"] });
  });

  it("カンマ区切りと繰り返し指定の両方に対応し、表示順に並べて重複を除く", () => {
    const fromRepeat = parseEventFilters(new URLSearchParams("category=track&category=ekiden&category=track"));
    const fromComma = parseEventFilters(new URLSearchParams("category=track,ekiden,,track"));
    expect(fromRepeat.categories).toEqual(["EKIDEN", "TRACK"]);
    expect(fromComma.categories).toEqual(["EKIDEN", "TRACK"]);

    const media = parseEventFilters(new URLSearchParams("medium=internet,bs&medium=terrestrial"));
    expect(media.media).toEqual(["TERRESTRIAL", "BS", "INTERNET"]);
  });

  it("大文字小文字・前後の空白を区別しない", () => {
    const f = parseEventFilters(new URLSearchParams("period=WEEK&category=%20Ekiden%20,MARATHON&medium=BS&free=TRUE"));
    expect(f.period).toBe("week");
    expect(f.categories).toEqual(["EKIDEN", "MARATHON"]);
    expect(f.media).toEqual(["BS"]);
    expect(f.freeInternet).toBe(true);
  });

  it('free は "1" または "true" のみ有効', () => {
    expect(parseEventFilters({ free: "1" }).freeInternet).toBe(true);
    expect(parseEventFilters({ free: "true" }).freeInternet).toBe(true);
    expect(parseEventFilters({ free: "0" }).freeInternet).toBe(false);
    expect(parseEventFilters({ free: "yes" }).freeInternet).toBe(false);
  });

  it("Next.js の searchParams（Record、配列値）にも対応し、単一値の項目は先頭を使う", () => {
    const f = parseEventFilters({
      period: ["today", "week"],
      category: ["ekiden", "TRACK,marathon"],
      medium: "internet,foo",
      q: ["駅伝", "マラソン"],
      free: undefined,
    });
    expect(f).toEqual({
      period: "today",
      categories: ["EKIDEN", "MARATHON", "TRACK"],
      media: ["INTERNET"],
      freeInternet: false,
      q: "駅伝",
    });
  });

  it(`q は前後の空白を除き、${MAX_QUERY_LENGTH} 文字に切り詰める`, () => {
    expect(parseEventFilters({ q: "  湾岸 駅伝  " }).q).toBe("湾岸 駅伝");
    const long = parseEventFilters({ q: "あ".repeat(MAX_QUERY_LENGTH + 50) }).q;
    expect(long).toHaveLength(MAX_QUERY_LENGTH);
    expect(parseEventFilters({ q: "   " }).q).toBe("");
  });
});

describe("toSearchParams / toQueryString", () => {
  it("既定値は省略し、条件なしなら空文字", () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe("");
    expect(toQueryString(DEFAULT_FILTERS)).toBe("");
  });

  it("複数値は表示順の繰り返し指定に正規化する", () => {
    const qs = toQueryString(
      filters({
        period: "week",
        categories: ["TRACK", "EKIDEN"],
        media: ["INTERNET", "TERRESTRIAL"],
        freeInternet: true,
        q: "湾岸",
      }),
    );
    expect(qs).toBe(
      `?period=week&category=ekiden&category=track&medium=terrestrial&medium=internet&free=1&q=${encodeURIComponent("湾岸")}`,
    );
  });

  it("parse → toSearchParams → parse で同じ条件に戻る（往復）", () => {
    const original = parseEventFilters(
      new URLSearchParams("period=today&category=marathon,ekiden&medium=radio&medium=cs&free=true&q=デモ 駅伝"),
    );
    const roundTrip = parseEventFilters(toSearchParams(original));
    expect(roundTrip).toEqual(original);
    expect(toQueryString(roundTrip)).toBe(toQueryString(original));
  });

  it("hasActiveFilters は期間以外の条件があるときのみ true", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters({ period: "today" }))).toBe(false);
    expect(hasActiveFilters(filters({ categories: ["TRACK"] }))).toBe(true);
    expect(hasActiveFilters(filters({ media: ["BS"] }))).toBe(true);
    expect(hasActiveFilters(filters({ freeInternet: true }))).toBe(true);
    expect(hasActiveFilters(filters({ q: "駅伝" }))).toBe(true);
  });
});

describe("getPeriodRange（日本時間の日付境界）", () => {
  it("today: 日本時間 23:59:59 ではまだ当日", () => {
    const r = getPeriodRange("today", new Date("2026-10-10T14:59:59Z"));
    expect(r.startDate).toBe("2026-10-10");
    expect(r.endDate).toBe("2026-10-10");
    expect(r.start.toISOString()).toBe("2026-10-09T15:00:00.000Z");
    expect(r.end?.toISOString()).toBe("2026-10-10T15:00:00.000Z");
  });

  it("today: 日本時間 0:00 になったら翌日", () => {
    const r = getPeriodRange("today", new Date("2026-10-10T15:00:00Z"));
    expect(r.startDate).toBe("2026-10-11");
    expect(r.start.toISOString()).toBe("2026-10-10T15:00:00.000Z");
    expect(r.end?.toISOString()).toBe("2026-10-11T15:00:00.000Z");
  });

  it("week: 今日を含む 7 日間", () => {
    const r = getPeriodRange("week", NOW);
    expect(r.startDate).toBe("2026-10-10");
    expect(r.endDate).toBe("2026-10-16");
    expect(r.start.toISOString()).toBe("2026-10-09T15:00:00.000Z");
    expect(r.end?.toISOString()).toBe("2026-10-16T15:00:00.000Z");
  });

  it("week: 月・年をまたぐ", () => {
    const r = getPeriodRange("week", new Date("2026-12-28T00:00:00Z"));
    expect(r.startDate).toBe("2026-12-28");
    expect(r.endDate).toBe("2027-01-03");
  });

  it("upcoming: 今日 0:00 から上限なし", () => {
    const r = getPeriodRange("upcoming", NOW);
    expect(r.startDate).toBe("2026-10-10");
    expect(r.start.toISOString()).toBe("2026-10-09T15:00:00.000Z");
    expect(r.end).toBeNull();
    expect(r.endDate).toBeNull();
  });
});

describe("matchesFilters / filterAndSortEvents", () => {
  it("この先: 終了した大会を除き、開始日時の昇順", () => {
    expect(names(filterAndSortEvents(ALL, filters(), NOW))).toEqual([
      "湾岸駅伝",
      "トラックナイト記録会",
      "市民マラソン",
      "海浜マラソン",
      "欧州ロード（時刻不明）",
      "10000m ナイト",
      "国際グランプリ",
      "湖畔マラソン",
    ]);
  });

  it("今日: 開始済みでも当日中の大会は含む", () => {
    expect(names(filterAndSortEvents(ALL, filters({ period: "today" }), NOW))).toEqual([
      "湾岸駅伝",
      "トラックナイト記録会",
    ]);
  });

  it("今週: 日本時間で 7 日間に入る大会のみ（海外で日本時間の日付が変わる大会は日本時間で判定）", () => {
    const result = names(filterAndSortEvents(ALL, filters({ period: "week" }), NOW));
    expect(result).toEqual([
      "湾岸駅伝",
      "トラックナイト記録会",
      "市民マラソン",
      "海浜マラソン",
      "欧州ロード（時刻不明）",
      "10000m ナイト",
    ]);
    // 国際グランプリは現地 10/17 だが日本時間 10/18 3:00 開始
    expect(result).not.toContain("国際グランプリ");
  });

  it("競技カテゴリ", () => {
    expect(names(filterAndSortEvents(ALL, filters({ categories: ["MARATHON"] }), NOW))).toEqual([
      "市民マラソン",
      "海浜マラソン",
      "湖畔マラソン",
    ]);
    expect(names(filterAndSortEvents(ALL, filters({ categories: ["EKIDEN", "TRACK"], period: "today" }), NOW))).toEqual([
      "湾岸駅伝",
      "トラックナイト記録会",
    ]);
  });

  it("視聴方法: 過去大会の参考情報（PAST_REFERENCE）の枠は対象外", () => {
    expect(names(filterAndSortEvents(ALL, filters({ media: ["TERRESTRIAL"] }), NOW))).toEqual(["湾岸駅伝", "海浜マラソン"]);
    expect(names(filterAndSortEvents(ALL, filters({ media: ["CS", "BS"] }), NOW))).toEqual([
      "欧州ロード（時刻不明）",
      "国際グランプリ",
    ]);
    // 放送枠のない大会は視聴方法を指定すると出ない
    expect(names(filterAndSortEvents(ALL, filters({ media: ["RADIO"] }), NOW))).toEqual([]);
  });

  it("無料ネット配信: 有料ネット・地上波のみ・PAST_REFERENCE の枠は対象外", () => {
    expect(names(filterAndSortEvents(ALL, filters({ freeInternet: true }), NOW))).toEqual([
      "トラックナイト記録会",
      "海浜マラソン",
    ]);
  });

  it("検索: 大会名・シリーズ名を NFKC・大小文字・空白を無視して部分一致", () => {
    expect(names(filterAndSortEvents(ALL, filters({ q: "マラソン" }), NOW))).toEqual([
      "市民マラソン",
      "海浜マラソン",
      "湖畔マラソン",
    ]);
    expect(names(filterAndSortEvents(ALL, filters({ q: "１００００Ｍ" }), NOW))).toEqual(["10000m ナイト"]);
    expect(names(filterAndSortEvents(ALL, filters({ q: "10000 m ナイト" }), NOW))).toEqual(["10000m ナイト"]);
    expect(names(filterAndSortEvents(ALL, filters({ q: "demo track" }), NOW))).toEqual(["トラックナイト記録会"]);
    expect(names(filterAndSortEvents(ALL, filters({ q: "存在しない大会" }), NOW))).toEqual([]);
    expect(normalizeSearchText(" ＡＢＣ　ｄｅ ")).toBe("abcde");
  });

  it("期間×カテゴリ×視聴方法×無料ネット×検索の組み合わせ", () => {
    const base = { period: "week", categories: ["TRACK"], media: ["INTERNET"] } as const;
    const f1 = filters({ ...base, categories: [...base.categories], media: [...base.media] });
    expect(names(filterAndSortEvents(ALL, f1, NOW))).toEqual(["トラックナイト記録会", "10000m ナイト"]);
    expect(names(filterAndSortEvents(ALL, { ...f1, q: "ナイト" }, NOW))).toEqual(["トラックナイト記録会", "10000m ナイト"]);
    expect(names(filterAndSortEvents(ALL, { ...f1, q: "ナイト", freeInternet: true }, NOW))).toEqual([
      "トラックナイト記録会",
    ]);
    expect(names(filterAndSortEvents(ALL, { ...f1, q: "ナイト", freeInternet: true, period: "today" }, NOW))).toEqual([
      "トラックナイト記録会",
    ]);
    expect(names(filterAndSortEvents(ALL, { ...f1, q: "10000m", freeInternet: true }, NOW))).toEqual([]);
  });

  it("同時刻の大会は大会名順", () => {
    const list = [
      event("みる陸C", { date: "2026-10-12", time: "09:00" }),
      event("みる陸A", { date: "2026-10-12", time: "09:00" }),
      event("みる陸B", { date: "2026-10-11", time: null }),
    ];
    expect(names(filterAndSortEvents(list, filters(), NOW))).toEqual(["みる陸B", "みる陸A", "みる陸C"]);
  });

  it("入力の配列を変更しない", () => {
    const list = [EVENTS.lakeside, EVENTS.bay];
    filterAndSortEvents(list, filters(), NOW);
    expect(names(list)).toEqual(["湖畔マラソン", "湾岸駅伝"]);
  });
});

describe("期間の境界", () => {
  const todayRange = getPeriodRange("today", NOW); // 2026-10-10 JST

  it("前日に終わった日付のみの大会は今日に含まない（終了 = 区間の開始）", () => {
    expect(matchesFilters(event("前日", { date: "2026-10-09", time: null }), filters(), todayRange)).toBe(false);
  });

  it("翌日 0:00 開始の大会は今日に含まない（開始 = 区間の終了）", () => {
    expect(matchesFilters(event("翌日", { date: "2026-10-11", time: null }), filters(), todayRange)).toBe(false);
    expect(matchesFilters(event("翌日0時", { date: "2026-10-11", time: "00:00" }), filters(), todayRange)).toBe(false);
  });

  it("今日 23:59 開始の大会は今日に含む", () => {
    expect(matchesFilters(event("深夜", { date: "2026-10-10", time: "23:59" }), filters(), todayRange)).toBe(true);
  });

  it("前日から続く複数日開催は今日に含む", () => {
    const multi = event("複数日", { startDate: "2026-10-09", endDate: "2026-10-11", date: "2026-10-09", time: "10:00" });
    expect(matchesFilters({ ...multi, startDate: "2026-10-09", endDate: "2026-10-11" }, filters(), todayRange)).toBe(true);
  });

  it("開始時刻不明の海外大会は、現地日付に対応する日本時間の 2 日間のどちらでも「今日」に含む", () => {
    // Zurich 10/16（時刻不明）= 日本時間 10/16 7:00 〜 10/17 7:00
    const ev = EVENTS.zurichDateOnly;
    const today = (now: string) => getPeriodRange("today", new Date(now));
    expect(matchesFilters(ev, filters(), today("2026-10-15T03:00:00Z"))).toBe(false); // JST 10/15
    expect(matchesFilters(ev, filters(), today("2026-10-16T03:00:00Z"))).toBe(true); // JST 10/16
    expect(matchesFilters(ev, filters(), today("2026-10-16T20:00:00Z"))).toBe(true); // JST 10/17
    expect(matchesFilters(ev, filters(), today("2026-10-17T16:00:00Z"))).toBe(false); // JST 10/18
  });
});

describe("isCurrentYearSlot", () => {
  it("PAST_REFERENCE のみ false", () => {
    expect(isCurrentYearSlot({ verificationStatus: "CONFIRMED" })).toBe(true);
    expect(isCurrentYearSlot({ verificationStatus: "UNVERIFIED" })).toBe(true);
    expect(isCurrentYearSlot({ verificationStatus: "PAST_REFERENCE" })).toBe(false);
  });
});
