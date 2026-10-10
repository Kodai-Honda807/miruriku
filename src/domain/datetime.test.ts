import { describe, expect, it } from "vitest";

import {
  JST,
  addDaysToLocalDate,
  dbDateToLocalDate,
  formatInstantJst,
  formatInstantJstNumeric,
  formatJstTime,
  formatLocalDateJa,
  formatLocalDateRangeJa,
  formatTimeJa,
  isValidLocalDate,
  isValidLocalTime,
  isValidTimeZone,
  jstDateOf,
  localDateToDbDate,
  shouldShowYear,
  startOfZonedDay,
  toZonedParts,
  weekdayOfLocalDate,
  zonedToUtc,
} from "./datetime";

// テストは固定の瞬間だけを使い、実行日・実行環境のタイムゾーン（vitest では America/Los_Angeles）に依存しない。

describe("toZonedParts / jstDateOf（日本時間への変換と日付境界）", () => {
  it("UTC 14:59:59 は日本時間の同日 23:59", () => {
    const instant = new Date("2026-10-10T14:59:59Z");
    expect(toZonedParts(instant, JST)).toEqual({ date: "2026-10-10", time: "23:59" });
    expect(jstDateOf(instant)).toBe("2026-10-10");
  });

  it("UTC 15:00:00 は日本時間の翌日 0:00", () => {
    const instant = new Date("2026-10-10T15:00:00Z");
    expect(toZonedParts(instant, JST)).toEqual({ date: "2026-10-11", time: "00:00" });
    expect(jstDateOf(instant)).toBe("2026-10-11");
  });

  it("実行環境のタイムゾーン（日本以外）に影響されない", () => {
    // 実行環境が America/Los_Angeles でも、日本時間・現地時間で正しく変換される
    const instant = new Date("2026-10-10T15:00:00Z");
    expect(toZonedParts(instant, "America/New_York")).toEqual({ date: "2026-10-10", time: "11:00" });
    expect(toZonedParts(instant, "Europe/Zurich")).toEqual({ date: "2026-10-10", time: "17:00" });
  });

  it("0 時台は 24 時ではなく 00 と表記する", () => {
    expect(toZonedParts(new Date("2026-10-10T15:05:00Z"), JST).time).toBe("00:05");
  });
});

describe("zonedToUtc", () => {
  it("日本時間の現地日時を UTC の瞬間に変換する", () => {
    expect(zonedToUtc("2026-10-10", "00:00", JST).toISOString()).toBe("2026-10-09T15:00:00.000Z");
    expect(zonedToUtc("2026-10-12", "07:50", JST).toISOString()).toBe("2026-10-11T22:50:00.000Z");
  });

  it("Europe/Zurich の夏時間（UTC+2）", () => {
    expect(zonedToUtc("2026-07-01", "20:00", "Europe/Zurich").toISOString()).toBe("2026-07-01T18:00:00.000Z");
  });

  it("Europe/Zurich の冬時間（UTC+1）", () => {
    expect(zonedToUtc("2026-01-15", "20:00", "Europe/Zurich").toISOString()).toBe("2026-01-15T19:00:00.000Z");
  });

  it("夏時間開始で存在しない時刻（2026-03-29 02:30 Zurich）は前方にずらして 03:30 として解釈する", () => {
    const instant = zonedToUtc("2026-03-29", "02:30", "Europe/Zurich");
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(toZonedParts(instant, "Europe/Zurich")).toEqual({ date: "2026-03-29", time: "03:30" });
  });

  it("夏時間終了で 2 回現れる時刻は、どちらかの正しい瞬間になる", () => {
    const instant = zonedToUtc("2026-10-25", "02:30", "Europe/Zurich");
    expect(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]).toContain(instant.toISOString());
    expect(toZonedParts(instant, "Europe/Zurich")).toEqual({ date: "2026-10-25", time: "02:30" });
  });

  it("変換結果は現地日時に戻せる（往復）", () => {
    for (const tz of [JST, "Europe/Zurich", "America/New_York", "Australia/Sydney"]) {
      const instant = zonedToUtc("2026-11-03", "09:15", tz);
      expect(toZonedParts(instant, tz)).toEqual({ date: "2026-11-03", time: "09:15" });
    }
  });

  it("不正な日付・時刻は RangeError", () => {
    expect(() => zonedToUtc("2026/10/10", "07:00", JST)).toThrow(RangeError);
    expect(() => zonedToUtc("2026-10-10", "7:00", JST)).toThrow(RangeError);
    expect(() => zonedToUtc("2026-10-10", "24:00", JST)).toThrow(RangeError);
  });
});

describe("startOfZonedDay", () => {
  it("指定タイムゾーンの 0 時の瞬間", () => {
    expect(startOfZonedDay("2026-10-11", JST).toISOString()).toBe("2026-10-10T15:00:00.000Z");
    expect(startOfZonedDay("2026-10-17", "Europe/Zurich").toISOString()).toBe("2026-10-16T22:00:00.000Z");
  });
});

describe("LocalDate / LocalTime / タイムゾーンの検証", () => {
  it("2026-02-29 は存在しないので不正、2028-02-29 は正しい", () => {
    expect(isValidLocalDate("2026-02-29")).toBe(false);
    expect(isValidLocalDate("2028-02-29")).toBe(true);
  });

  it.each(["2026-04-31", "2026-13-01", "2026-00-10", "2026-10-00", "2026-1-1", "2026/10/10", "20261010", "", "2026-10-10T00:00"])(
    "不正な日付: %s",
    (value) => {
      expect(isValidLocalDate(value)).toBe(false);
    },
  );

  it.each(["2026-01-01", "2026-12-31", "2000-02-29"])("正しい日付: %s", (value) => {
    expect(isValidLocalDate(value)).toBe(true);
  });

  it("時刻は HH:MM（00:00〜23:59）のみ", () => {
    expect(isValidLocalTime("00:00")).toBe(true);
    expect(isValidLocalTime("23:59")).toBe(true);
    expect(isValidLocalTime("07:50")).toBe(true);
    for (const v of ["24:00", "7:50", "12:60", "12:00:00", "", "ab:cd"]) {
      expect(isValidLocalTime(v)).toBe(false);
    }
  });

  it("IANA タイムゾーン名", () => {
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("Europe/Zurich")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("別名の IANA 名と UTC は受け付け、略称・オフセット・大小文字違いは拒否する", () => {
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("Etc/GMT+9")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    for (const value of ["JST", "+09:00", "asia/tokyo", "Asia/TOKYO", "Asia/tokyo", "Japan"]) {
      expect(isValidTimeZone(value), value).toBe(false);
    }
  });
});

describe("addDaysToLocalDate", () => {
  it("月をまたぐ", () => {
    expect(addDaysToLocalDate("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysToLocalDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToLocalDate("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("年をまたぐ", () => {
    expect(addDaysToLocalDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToLocalDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDaysToLocalDate("2026-12-28", 7)).toBe("2027-01-04");
  });

  it("0 日は同じ日付", () => {
    expect(addDaysToLocalDate("2026-10-10", 0)).toBe("2026-10-10");
  });

  it("夏時間の切り替え日をまたいでも 1 日ずつ進む（実行環境のタイムゾーンに依存しない）", () => {
    // America/Los_Angeles の夏時間終了日（2026-11-01）
    expect(addDaysToLocalDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToLocalDate("2026-11-01", 1)).toBe("2026-11-02");
    // Europe の夏時間開始日（2026-03-29）
    expect(addDaysToLocalDate("2026-03-28", 2)).toBe("2026-03-30");
  });

  it("不正な日付は RangeError", () => {
    expect(() => addDaysToLocalDate("2026-10-1", 1)).toThrow(RangeError);
  });
});

describe("日本語表記", () => {
  it("formatLocalDateJa は曜日を付ける", () => {
    expect(formatLocalDateJa("2026-10-10")).toBe("10月10日（土）");
    expect(formatLocalDateJa("2026-10-11")).toBe("10月11日（日）");
    expect(formatLocalDateJa("2026-10-12")).toBe("10月12日（月）");
    expect(formatLocalDateJa("2027-01-01")).toBe("1月1日（金）");
    expect(formatLocalDateJa("2026-10-12", { withYear: true })).toBe("2026年10月12日（月）");
  });

  it("weekdayOfLocalDate（0 = 日曜）", () => {
    expect(weekdayOfLocalDate("2026-10-11")).toBe(0);
    expect(weekdayOfLocalDate("2026-10-17")).toBe(6);
  });

  it('formatTimeJa は時の先頭ゼロを除く（"07:50" → "7:50"）', () => {
    expect(formatTimeJa("07:50")).toBe("7:50");
    expect(formatTimeJa("00:05")).toBe("0:05");
    expect(formatTimeJa("23:00")).toBe("23:00");
    expect(() => formatTimeJa("7:50")).toThrow(RangeError);
  });

  it("formatLocalDateRangeJa: 単日・範囲・年またぎ", () => {
    expect(formatLocalDateRangeJa("2026-10-20", "2026-10-20")).toBe("10月20日（火）");
    expect(formatLocalDateRangeJa("2026-10-20", "2026-10-22")).toBe("10月20日（火）〜10月22日（木）");
    expect(formatLocalDateRangeJa("2026-12-31", "2027-01-02")).toBe("2026年12月31日（木）〜2027年1月2日（土）");
    expect(formatLocalDateRangeJa("2026-10-20", "2026-10-22", { withYear: true })).toBe(
      "2026年10月20日（火）〜2026年10月22日（木）",
    );
  });

  it("瞬間の日本時間表記", () => {
    const instant = new Date("2026-10-11T22:50:00Z"); // JST 2026-10-12 07:50
    expect(formatInstantJst(instant)).toBe("10月12日（月）7:50");
    expect(formatInstantJst(instant, { withYear: true })).toBe("2026年10月12日（月）7:50");
    expect(formatJstTime(instant)).toBe("7:50");
    expect(formatInstantJstNumeric(instant)).toBe("2026/10/12 07:50");
  });

  it("shouldShowYear は日本時間の今日と年が異なるときだけ true", () => {
    const now = new Date("2026-12-31T15:00:00Z"); // JST 2027-01-01 0:00
    expect(shouldShowYear("2027-01-05", now)).toBe(false);
    expect(shouldShowYear("2026-12-30", now)).toBe(true);
    const now2 = new Date("2026-12-31T14:59:59Z"); // JST 2026-12-31 23:59
    expect(shouldShowYear("2026-12-31", now2)).toBe(false);
    expect(shouldShowYear("2027-01-01", now2)).toBe(true);
  });
});

describe("dbDateToLocalDate / localDateToDbDate", () => {
  it("@db.Date は UTC 0 時の Date として扱う", () => {
    expect(localDateToDbDate("2026-10-10").toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(dbDateToLocalDate(new Date("2026-10-10T00:00:00.000Z"))).toBe("2026-10-10");
  });

  it.each(["2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31"])("往復しても同じ日付: %s", (date) => {
    expect(dbDateToLocalDate(localDateToDbDate(date))).toBe(date);
  });

  it("不正な日付は RangeError", () => {
    expect(() => localDateToDbDate("2026-10-1")).toThrow(RangeError);
  });
});
