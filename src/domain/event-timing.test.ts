import { describe, expect, it } from "vitest";

import { JST, zonedToUtc } from "./datetime";
import {
  broadcastJstDate,
  describeEventTiming,
  formatBroadcastTiming,
  formatEventSchedule,
  getEventWindow,
  type EventTimingInput,
} from "./event-timing";

const ZURICH = "Europe/Zurich";

function schedule(input: EventTimingInput, opts?: { withYear?: boolean }) {
  return formatEventSchedule(describeEventTiming(input), opts);
}

describe("国内大会", () => {
  it("日付のみ（開始時刻不明）は「開始時刻未定」と表示し、0:00 などの仮時刻を出さない", () => {
    const input: EventTimingInput = { startDate: "2026-10-13", endDate: "2026-10-13", startAt: null, timezone: JST };
    const timing = describeEventTiming(input);
    expect(timing.startTimeKnown).toBe(false);
    expect(timing.jstStart).toBeNull();
    expect(timing.primaryDate).toBe("2026-10-13");
    expect(timing.primaryDateBasis).toBe("JST");

    const labels = formatEventSchedule(timing);
    expect(labels).toEqual({
      dateLabel: "10月13日（火）",
      dateBasisLabel: "日本時間",
      startTimeLabel: null,
      startTimeUnknownLabel: "開始時刻未定",
      localLabel: null,
    });
    const allText = Object.values(labels).filter(Boolean).join(" ");
    expect(allText).not.toContain("0:00");
    expect(allText).not.toContain("00:00");
  });

  it("開始時刻が判明している", () => {
    const startAt = zonedToUtc("2026-10-10", "08:00", JST);
    const timing = describeEventTiming({ startDate: "2026-10-10", endDate: "2026-10-10", startAt, timezone: JST });
    expect(timing.isJapanTime).toBe(true);
    expect(timing.startTimeKnown).toBe(true);
    expect(timing.jstStart).toEqual({ date: "2026-10-10", time: "08:00" });
    expect(timing.jstDateDiffersFromLocal).toBe(false);
    expect(formatEventSchedule(timing)).toEqual({
      dateLabel: "10月10日（土）",
      dateBasisLabel: "日本時間",
      startTimeLabel: "8:00",
      startTimeUnknownLabel: null,
      localLabel: null,
    });
  });

  it("複数日開催は日付範囲で表示する", () => {
    const startAt = zonedToUtc("2026-10-20", "10:00", JST);
    const input: EventTimingInput = { startDate: "2026-10-20", endDate: "2026-10-22", startAt, timezone: JST };
    const timing = describeEventTiming(input);
    expect(timing.isMultiDay).toBe(true);
    const labels = formatEventSchedule(timing);
    expect(labels.dateLabel).toBe("10月20日（火）〜10月22日（木）");
    expect(labels.startTimeLabel).toBe("10:00");
    expect(schedule(input, { withYear: true }).dateLabel).toBe("2026年10月20日（火）〜2026年10月22日（木）");
  });

  it("年をまたぐ複数日開催は年を付ける", () => {
    const input: EventTimingInput = { startDate: "2026-12-31", endDate: "2027-01-02", startAt: null, timezone: JST };
    expect(schedule(input).dateLabel).toBe("2026年12月31日（木）〜2027年1月2日（土）");
  });
});

describe("海外大会", () => {
  it("現地 20:00（CEST）は日本時間の翌日 3:00。現地日時を補足表示する", () => {
    const startAt = zonedToUtc("2026-10-17", "20:00", ZURICH);
    expect(startAt.toISOString()).toBe("2026-10-17T18:00:00.000Z");
    const timing = describeEventTiming({ startDate: "2026-10-17", endDate: "2026-10-17", startAt, timezone: ZURICH });
    expect(timing.isJapanTime).toBe(false);
    expect(timing.jstStart).toEqual({ date: "2026-10-18", time: "03:00" });
    expect(timing.localStart).toEqual({ date: "2026-10-17", time: "20:00" });
    expect(timing.jstDateDiffersFromLocal).toBe(true);
    expect(timing.primaryDate).toBe("2026-10-18");
    expect(timing.primaryDateBasis).toBe("JST");

    expect(formatEventSchedule(timing)).toEqual({
      dateLabel: "10月18日（日）",
      dateBasisLabel: "日本時間",
      startTimeLabel: "3:00",
      startTimeUnknownLabel: null,
      localLabel: "現地 10月17日（土）20:00",
    });
  });

  it("日本時間でも同じ日付なら jstDateDiffersFromLocal は false", () => {
    const startAt = zonedToUtc("2026-10-17", "09:00", ZURICH); // JST 16:00
    const timing = describeEventTiming({ startDate: "2026-10-17", endDate: "2026-10-17", startAt, timezone: ZURICH });
    expect(timing.jstDateDiffersFromLocal).toBe(false);
    expect(formatEventSchedule(timing).startTimeLabel).toBe("16:00");
  });

  it("海外の複数日開催は現地日程と初日の開始日時を補足する", () => {
    const startAt = zonedToUtc("2026-08-01", "19:00", ZURICH); // JST 8/2 2:00
    const labels = schedule({ startDate: "2026-08-01", endDate: "2026-08-03", startAt, timezone: ZURICH });
    expect(labels.dateLabel).toBe("8月2日（日）");
    expect(labels.startTimeLabel).toBe("2:00");
    expect(labels.localLabel).toBe("現地日程 8月1日（土）〜8月3日（月）（初日 8月1日（土）19:00 開始）");
  });

  it("開始時刻不明の場合は現地日付ベースで表示し、日本時間の日付が変わり得ることを示す", () => {
    const timing = describeEventTiming({ startDate: "2026-10-17", endDate: "2026-10-17", startAt: null, timezone: ZURICH });
    expect(timing.primaryDate).toBe("2026-10-17");
    expect(timing.primaryDateBasis).toBe("LOCAL");
    expect(timing.jstStart).toBeNull();
    expect(timing.jstDateDiffersFromLocal).toBe(false);

    const labels = formatEventSchedule(timing);
    expect(labels.dateLabel).toBe("10月17日（土）");
    expect(labels.dateBasisLabel).toBe("現地日付");
    expect(labels.startTimeLabel).toBeNull();
    expect(labels.startTimeUnknownLabel).toContain("開始時刻未定");
    expect(labels.startTimeUnknownLabel).toContain("日本時間の日付は変わる場合があります");
    expect(Object.values(labels).filter(Boolean).join(" ")).not.toContain("0:00");
  });
});

describe("getEventWindow", () => {
  it("開始時刻が判明: [開始の瞬間, 最終日の翌日 0 時（開催地）)", () => {
    const startAt = zonedToUtc("2026-10-10", "08:00", JST);
    const w = getEventWindow({ startDate: "2026-10-10", endDate: "2026-10-10", startAt, timezone: JST });
    expect(w.start.toISOString()).toBe("2026-10-09T23:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-10T15:00:00.000Z");
  });

  it("開始時刻不明: 開催地の初日 0 時から", () => {
    const w = getEventWindow({ startDate: "2026-10-13", endDate: "2026-10-13", startAt: null, timezone: JST });
    expect(w.start.toISOString()).toBe("2026-10-12T15:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-13T15:00:00.000Z");
  });

  it("複数日開催は最終日の翌日 0 時まで", () => {
    const w = getEventWindow({ startDate: "2026-10-20", endDate: "2026-10-22", startAt: null, timezone: JST });
    expect(w.start.toISOString()).toBe("2026-10-19T15:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-22T15:00:00.000Z");
  });

  it("開始時刻不明の海外大会は開催地の 1 日（日本時間では 2 日にまたがる）", () => {
    const w = getEventWindow({ startDate: "2026-10-17", endDate: "2026-10-17", startAt: null, timezone: ZURICH });
    expect(w.start.toISOString()).toBe("2026-10-16T22:00:00.000Z"); // JST 10/17 7:00
    expect(w.end.toISOString()).toBe("2026-10-17T22:00:00.000Z"); // JST 10/18 7:00
  });

  it("開始の瞬間が最終日の翌日 0 時以降（不整合なデータ）でも end > start を保つ", () => {
    const startAt = new Date("2026-10-20T00:00:00Z");
    const w = getEventWindow({ startDate: "2026-10-10", endDate: "2026-10-10", startAt, timezone: JST });
    expect(w.start.getTime()).toBe(startAt.getTime());
    expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
  });
});

describe("formatBroadcastTiming", () => {
  const start = zonedToUtc("2026-10-12", "07:50", JST);

  it("開始・終了が同日", () => {
    const end = zonedToUtc("2026-10-12", "14:00", JST);
    expect(formatBroadcastTiming({ airDate: "2026-10-12", startAt: start, endAt: end })).toBe(
      "10月12日（月）7:50〜14:00",
    );
    expect(formatBroadcastTiming({ airDate: null, startAt: start, endAt: end }, { withYear: true })).toBe(
      "2026年10月12日（月）7:50〜14:00",
    );
  });

  it("日付をまたぐ場合は終了側にも日付を付ける", () => {
    const s = zonedToUtc("2026-10-12", "23:30", JST);
    const e = zonedToUtc("2026-10-13", "01:00", JST);
    expect(formatBroadcastTiming({ airDate: "2026-10-12", startAt: s, endAt: e })).toBe(
      "10月12日（月）23:30〜10月13日（火）1:00",
    );
  });

  it("終了時刻なし", () => {
    expect(formatBroadcastTiming({ airDate: "2026-10-12", startAt: start, endAt: null })).toBe("10月12日（月）7:50〜");
  });

  it("日付のみ（時刻未定）", () => {
    expect(formatBroadcastTiming({ airDate: "2026-10-12", startAt: null, endAt: null })).toBe("10月12日（月）時刻未定");
  });

  it("日時未定", () => {
    expect(formatBroadcastTiming({ airDate: null, startAt: null, endAt: null })).toBe("日時未定");
  });

  it("放送時刻は日本時間で表示する（海外の現地時刻で指定した瞬間でも）", () => {
    const s = zonedToUtc("2026-10-17", "19:55", ZURICH);
    expect(formatBroadcastTiming({ airDate: null, startAt: s, endAt: null })).toBe("10月18日（日）2:55〜");
  });
});

describe("broadcastJstDate", () => {
  it("開始の瞬間があれば日本時間の日付、なければ airDate", () => {
    expect(broadcastJstDate({ airDate: "2026-10-17", startAt: new Date("2026-10-17T18:00:00Z"), endAt: null })).toBe(
      "2026-10-18",
    );
    expect(broadcastJstDate({ airDate: "2026-10-17", startAt: null, endAt: null })).toBe("2026-10-17");
    expect(broadcastJstDate({ airDate: null, startAt: null, endAt: null })).toBeNull();
  });
});
