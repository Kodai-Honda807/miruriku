import { describe, expect, it } from "vitest";

import { formDataToRecord } from "./form-state";
import {
  eventFormSchema,
  eventFormToData,
  parseCandidateListFilter,
  reviewFormSchema,
  sessionFormSchema,
  sessionFormToData,
  slotFormSchema,
  slotFormToData,
  sourceFormSchema,
} from "./schemas";

const VALID_EVENT = {
  seriesMode: "existing",
  seriesId: "seed-series_1",
  name: " テスト大会 ",
  slug: "test-event-2026",
  editionLabel: "",
  seasonYear: "2026",
  category: "MARATHON",
  description: "",
  venueName: "テスト会場",
  venueRegion: "",
  countryCode: "jp",
  timezone: "Asia/Tokyo",
  startDate: "2026-10-11",
  endDate: "2026-10-11",
  startTime: "09:00",
  officialUrl: "https://example.com/event",
  broadcastInfoStatus: "UNVERIFIED",
  broadcastNote: "",
} satisfies Record<string, string>;

function eventErrors(overrides: Record<string, string | undefined>) {
  const result = eventFormSchema.safeParse({ ...VALID_EVENT, ...overrides });
  if (result.success) return {};
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

describe("eventFormSchema", () => {
  it("正しい入力を受け付け、保存用の値に変換する", () => {
    const result = eventFormSchema.safeParse(VALID_EVENT);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      name: "テスト大会",
      countryCode: "JP",
      editionLabel: null,
      description: null,
      seasonYear: 2026,
      markBroadcastChecked: false,
    });
    const data = eventFormToData(result.data);
    expect(data.startDate).toEqual(new Date("2026-10-11T00:00:00.000Z"));
    // 日本時間 9:00 = UTC 0:00
    expect(data.startAt).toEqual(new Date("2026-10-11T00:00:00.000Z"));
    expect(data.officialUrl).toBe("https://example.com/event");
  });

  it("競技開始時刻が空欄なら startAt は null（不明）", () => {
    const result = eventFormSchema.parse({ ...VALID_EVENT, startTime: "" });
    expect(eventFormToData(result).startAt).toBeNull();
    const missing = eventFormSchema.parse({ ...VALID_EVENT, startTime: undefined });
    expect(eventFormToData(missing).startAt).toBeNull();
  });

  it("競技開始時刻は開催地のタイムゾーンで解釈する", () => {
    const result = eventFormSchema.parse({
      ...VALID_EVENT,
      timezone: "Europe/Berlin",
      startDate: "2026-10-17",
      endDate: "2026-10-17",
      startTime: "20:00",
    });
    // 2026-10-17 20:00 CEST（UTC+2）
    expect(eventFormToData(result).startAt).toEqual(new Date("2026-10-17T18:00:00.000Z"));
  });

  it("チェックボックスはチェック時だけ true", () => {
    expect(eventFormSchema.parse({ ...VALID_EVENT, markBroadcastChecked: "on" }).markBroadcastChecked).toBe(true);
    expect(eventFormSchema.parse(VALID_EVENT).markBroadcastChecked).toBe(false);
  });

  it.each(["Test-Event", "a--b", "-abc", "abc-", "a_b", "a b", "日本語", "", "a/b"])(
    "slug %j を拒否する",
    (slug) => {
      expect(eventErrors({ slug }).slug).toBeDefined();
    },
  );

  it.each(["a", "abc-123", "city-marathon-2026"])("slug %j を受け付ける", (slug) => {
    expect(eventErrors({ slug }).slug).toBeUndefined();
  });

  it("slug が長すぎる場合は拒否する", () => {
    expect(eventErrors({ slug: "a".repeat(101) }).slug).toBeDefined();
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/",
    "https://user:pass@example.com/",
    "//example.com/path",
    "example.com",
  ])("URL %j を拒否する", (officialUrl) => {
    expect(eventErrors({ officialUrl }).officialUrl).toBeDefined();
  });

  it("URL の空欄は null", () => {
    expect(eventFormSchema.parse({ ...VALID_EVENT, officialUrl: "  " }).officialUrl).toBeNull();
  });

  it("タイムゾーンは IANA 名のみ受け付け、表記を正規化する", () => {
    expect(eventFormSchema.parse({ ...VALID_EVENT, timezone: "asia/tokyo" }).timezone).toBe("Asia/Tokyo");
    expect(eventFormSchema.parse({ ...VALID_EVENT, timezone: "America/New_York" }).timezone).toBe("America/New_York");
    for (const timezone of ["JST", "+09:00", "Mars/Olympus_Mons", "", "Asia/Tokyo; DROP TABLE"]) {
      expect(eventErrors({ timezone }).timezone, timezone).toBeDefined();
    }
  });

  it("終了日が開始日より前なら終了日のエラー", () => {
    const errors = eventErrors({ startDate: "2026-10-12", endDate: "2026-10-11" });
    expect(errors.endDate?.[0]).toContain("開始日");
    expect(eventErrors({ startDate: "2026-10-11", endDate: "2026-10-13" }).endDate).toBeUndefined();
  });

  it.each(["2026-02-30", "2026/10/11", "20261011", "", "2026-1-1"])("日付 %j を拒否する", (startDate) => {
    expect(eventErrors({ startDate }).startDate).toBeDefined();
  });

  it.each(["9:00", "24:00", "07:5", "07:50:00", "7時", "25:61"])("時刻 %j を拒否する", (startTime) => {
    expect(eventErrors({ startTime }).startTime).toBeDefined();
  });

  it("国コード・開催年・カテゴリを検証する", () => {
    expect(eventErrors({ countryCode: "JPN" }).countryCode).toBeDefined();
    expect(eventErrors({ seasonYear: "26" }).seasonYear).toBeDefined();
    expect(eventErrors({ seasonYear: "1800" }).seasonYear).toBeDefined();
    expect(eventErrors({ category: "SWIMMING" }).category).toBeDefined();
    expect(eventErrors({ broadcastInfoStatus: "NONE" }).broadcastInfoStatus).toBeDefined();
  });

  it("既存シリーズの指定がなければエラー", () => {
    expect(eventErrors({ seriesId: "" }).seriesId).toBeDefined();
    expect(eventErrors({ seriesId: "../x" }).seriesId).toBeDefined();
  });

  it("新しいシリーズの作成には名前と slug が必要", () => {
    const errors = eventErrors({ seriesMode: "new", seriesId: "", newSeriesName: "", newSeriesSlug: "" });
    expect(errors.newSeriesName).toBeDefined();
    expect(errors.newSeriesSlug).toBeDefined();
    expect(errors.seriesId).toBeUndefined();
    expect(eventErrors({ seriesMode: "new", newSeriesName: "新シリーズ", newSeriesSlug: "New Series" }).newSeriesSlug).toBeDefined();
    expect(eventErrors({ seriesMode: "new", newSeriesName: "新シリーズ", newSeriesSlug: "new-series" })).toEqual({});
  });

  it("必須項目が未送信でも例外にせず項目ごとのエラーを返す", () => {
    const result = eventFormSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = new Set(result.error.issues.map((i) => i.path[0]));
    for (const key of ["name", "slug", "seasonYear", "category", "timezone", "startDate", "endDate", "seriesId"]) {
      expect(paths.has(key), key).toBe(true);
    }
  });
});

const VALID_SLOT = {
  medium: "TERRESTRIAL",
  providerName: "テスト放送",
  airDate: "2026-10-11",
  startTime: "08:55",
  endTime: "11:30",
  cost: "FREE",
  viewingType: "LIVE",
  region: "NATIONWIDE",
  regionNote: "",
  note: "",
  watchUrl: "",
  infoUrl: "https://example.com/info",
  verificationStatus: "CONFIRMED",
  status: "PUBLISHED",
  sourceId: "",
} satisfies Record<string, string>;

function slotErrors(overrides: Record<string, string | undefined>) {
  const result = slotFormSchema.safeParse({ ...VALID_SLOT, ...overrides });
  if (result.success) return {};
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (errors[String(issue.path[0])] ??= []).push(issue.message);
  }
  return errors;
}

describe("slotFormSchema", () => {
  it("日本時間の放送日・時刻から瞬間を作る", () => {
    const data = slotFormToData(slotFormSchema.parse(VALID_SLOT));
    expect(data.airDate).toEqual(new Date("2026-10-11T00:00:00.000Z"));
    expect(data.startAt).toEqual(new Date("2026-10-10T23:55:00.000Z"));
    expect(data.endAt).toEqual(new Date("2026-10-11T02:30:00.000Z"));
    expect(data.sourceId).toBeNull();
    expect(data.watchUrl).toBeNull();
  });

  it("終了時刻が開始時刻以前なら翌日として扱う", () => {
    const overnight = slotFormToData(slotFormSchema.parse({ ...VALID_SLOT, startTime: "23:00", endTime: "01:00" }));
    expect(overnight.startAt).toEqual(new Date("2026-10-11T14:00:00.000Z"));
    expect(overnight.endAt).toEqual(new Date("2026-10-11T16:00:00.000Z"));
    const same = slotFormToData(slotFormSchema.parse({ ...VALID_SLOT, startTime: "09:00", endTime: "09:00" }));
    expect(same.endAt!.getTime() - same.startAt!.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("開始時刻だけなら終了は null、日付だけなら瞬間は null", () => {
    const startOnly = slotFormToData(slotFormSchema.parse({ ...VALID_SLOT, endTime: "" }));
    expect(startOnly.endAt).toBeNull();
    const dateOnly = slotFormToData(slotFormSchema.parse({ ...VALID_SLOT, startTime: "", endTime: "" }));
    expect(dateOnly.startAt).toBeNull();
    expect(dateOnly.airDate).toEqual(new Date("2026-10-11T00:00:00.000Z"));
  });

  it("日付なしの時刻を拒否する", () => {
    expect(slotErrors({ airDate: "", startTime: "08:00", endTime: "" }).airDate).toBeDefined();
    expect(slotErrors({ airDate: "", startTime: "", endTime: "10:00" }).airDate).toBeDefined();
  });

  it("他の項目のエラーと同時に、日付なし時刻のエラーも返す", () => {
    const errors = slotErrors({ medium: "", cost: "INVALID", airDate: "", startTime: "08:00" });
    expect(errors.medium).toBeDefined();
    expect(errors.cost).toBeDefined();
    expect(errors.airDate).toBeDefined();
  });

  it("終了時刻だけの入力を拒否する", () => {
    expect(slotErrors({ startTime: "", endTime: "10:00" }).startTime).toBeDefined();
  });

  it("時刻・日付の形式を検証する", () => {
    expect(slotErrors({ startTime: "8:55" }).startTime).toBeDefined();
    expect(slotErrors({ endTime: "25:00" }).endTime).toBeDefined();
    expect(slotErrors({ airDate: "2026-13-01" }).airDate).toBeDefined();
  });

  it("視聴 URL・案内 URL は http/https のみ", () => {
    expect(slotErrors({ watchUrl: "javascript:alert(1)" }).watchUrl).toBeDefined();
    expect(slotErrors({ infoUrl: "data:text/html;base64,PHNjcmlwdD4=" }).infoUrl).toBeDefined();
    expect(slotErrors({ watchUrl: "http://example.com/watch" })).toEqual({});
  });

  it("列挙値・情報源 ID・必須項目を検証する", () => {
    expect(slotErrors({ medium: "SATELLITE" }).medium).toBeDefined();
    expect(slotErrors({ cost: "" }).cost).toBeDefined();
    expect(slotErrors({ status: "ARCHIVED" }).status).toBeDefined();
    expect(slotErrors({ verificationStatus: "MAYBE" }).verificationStatus).toBeDefined();
    expect(slotErrors({ providerName: "  " }).providerName).toBeDefined();
    expect(slotErrors({ sourceId: "x' OR 1=1" }).sourceId).toBeDefined();
    expect(slotErrors({ sourceId: "seed-demo-source-info" })).toEqual({});
  });
});

describe("sourceFormSchema", () => {
  it("URL を正規化し、収集許可のチェックを読む", () => {
    const parsed = sourceFormSchema.parse({ kind: "BROADCAST_INFO", url: " https://Example.com/a ", collectEnabled: "on" });
    expect(parsed).toMatchObject({ url: "https://example.com/a", collectEnabled: true, title: null, note: null });
    expect(sourceFormSchema.parse({ kind: "OTHER", url: "https://example.com/" }).collectEnabled).toBe(false);
  });

  it("URL は必須で http/https のみ", () => {
    for (const url of ["", "javascript:alert(1)", "data:,x", "mailto:a@example.com"]) {
      const result = sourceFormSchema.safeParse({ kind: "OTHER", url });
      expect(result.success, url).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(["url"]);
    }
  });

  it("種類は列挙値のみ", () => {
    expect(sourceFormSchema.safeParse({ kind: "BLOG", url: "https://example.com/" }).success).toBe(false);
  });
});

describe("sessionFormSchema", () => {
  it("現地日付・時刻を大会のタイムゾーンで解釈する", () => {
    const parsed = sessionFormSchema.parse({ name: "1日目", date: "2026-10-17", startTime: "19:00" });
    const data = sessionFormToData(parsed, "Europe/Zurich");
    expect(data.date).toEqual(new Date("2026-10-17T00:00:00.000Z"));
    expect(data.startAt).toEqual(new Date("2026-10-17T17:00:00.000Z"));
    expect(sessionFormToData(sessionFormSchema.parse({ name: "2日目", date: "2026-10-18" }), "Asia/Tokyo").startAt).toBeNull();
  });

  it("名前と日付は必須", () => {
    const result = sessionFormSchema.safeParse({ name: "", date: "" });
    expect(result.success).toBe(false);
  });
});

describe("reviewFormSchema / parseCandidateListFilter", () => {
  it("メモは任意で長さを制限する", () => {
    expect(reviewFormSchema.parse({}).note).toBeNull();
    expect(reviewFormSchema.parse({ note: " 理由 " }).note).toBe("理由");
    expect(reviewFormSchema.safeParse({ note: "あ".repeat(1001) }).success).toBe(false);
  });

  it("一覧の絞り込みは既定で未レビュー", () => {
    expect(parseCandidateListFilter(undefined)).toBe("pending");
    expect(parseCandidateListFilter("approved")).toBe("approved");
    expect(parseCandidateListFilter(["rejected", "all"])).toBe("rejected");
    expect(parseCandidateListFilter("<script>")).toBe("pending");
  });
});

describe("formDataToRecord", () => {
  it("文字列の項目だけを取り出し、React の内部キーとファイルを無視する", () => {
    const fd = new FormData();
    fd.append("name", "a");
    fd.append("name", "b");
    fd.append("$ACTION_ID_abc", "");
    fd.append("upload", new Blob(["x"]), "x.txt");
    expect(formDataToRecord(fd)).toEqual({ name: "a" });
  });
});
