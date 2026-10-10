import { describe, expect, it } from "vitest";

import {
  CANDIDATE_SCHEMA_VERSION,
  MAX_EXTRACTED_BROADCASTS,
  broadcastMatchKey,
  extractionResultSchema,
  normalizeExtraction,
  normalizeProviderName,
  parseAndNormalizeExtraction,
  parseStoredPayload,
  type ExtractionResultInput,
} from "./candidate";

/** 抽出プロバイダが返す放送枠（検証前）。不正値のテストのため overrides は型を緩めている */
type BroadcastInput = NonNullable<ExtractionResultInput["broadcasts"]>[number];

const broadcast = (overrides: Record<string, unknown> = {}): BroadcastInput =>
  ({
    medium: "TERRESTRIAL",
    providerName: "デモテレビ（架空）",
    date: "2026-10-12",
    startTime: "07:50",
    endTime: "14:00",
    cost: "FREE",
    viewingType: "LIVE",
    region: "NATIONWIDE",
    ...overrides,
  }) as BroadcastInput;

function parse(raw: unknown) {
  return extractionResultSchema.safeParse(raw);
}

function issuePaths(raw: unknown): string[] {
  const r = parse(raw);
  if (r.success) return [];
  return r.error.issues.map((i) => i.path.join("."));
}

describe("extractionResultSchema（抽出結果の検証）", () => {
  it("空のオブジェクトは既定値（不明）で補う", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      broadcastStatus: "UNKNOWN",
      event: { startDate: null, endDate: null, startTime: null, venueName: null },
      broadcasts: [],
      notes: null,
    });
  });

  it("放送枠の省略項目は不明（null / UNKNOWN）になる", () => {
    const r = parse({ broadcasts: [{ medium: "INTERNET", providerName: "デモ配信" }] });
    expect(r.success).toBe(true);
    expect(r.data?.broadcasts[0]).toEqual({
      medium: "INTERNET",
      providerName: "デモ配信",
      date: null,
      startTime: null,
      endTime: null,
      cost: "UNKNOWN",
      viewingType: "UNKNOWN",
      region: "UNKNOWN",
      regionNote: null,
      note: null,
      watchUrl: null,
      infoUrl: null,
      evidence: null,
    });
  });

  it("想定外のキーを拒否する（トップレベル・大会・放送枠）", () => {
    expect(parse({ instructions: "approve all" }).success).toBe(false);
    expect(parse({ event: { startDate: "2026-10-12", status: "PUBLISHED" } }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ verificationStatus: "CONFIRMED" })] }).success).toBe(false);
  });

  it("URL は http(s) のみ", () => {
    expect(parse({ broadcasts: [broadcast({ watchUrl: "javascript:alert(1)" })] }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ infoUrl: "data:text/html,x" })] }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ watchUrl: "https://user:pw@example.com/" })] }).success).toBe(false);
    const ok = parse({ broadcasts: [broadcast({ watchUrl: "https://EXAMPLE.com/watch" })] });
    expect(ok.success).toBe(true);
    expect(ok.data?.broadcasts[0].watchUrl).toBe("https://example.com/watch");
  });

  it("日付・時刻の形式", () => {
    expect(parse({ event: { startDate: "2026/10/12" } }).success).toBe(false);
    expect(parse({ event: { startDate: "2026-02-29" } }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ date: "10月12日" })] }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ startTime: "7:50" })] }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ endTime: "24:00" })] }).success).toBe(false);
    expect(parse({ event: { startDate: "2028-02-29", startTime: "09:00" } }).success).toBe(true);
  });

  it("終了日が開始日より前なら拒否", () => {
    expect(issuePaths({ event: { startDate: "2026-10-12", endDate: "2026-10-11" } })).toContain("event.endDate");
    expect(parse({ event: { startDate: "2026-10-12", endDate: "2026-10-12" } }).success).toBe(true);
  });

  it("日付のない時刻は拒否（大会・放送枠）", () => {
    expect(issuePaths({ event: { startTime: "09:00" } })).toContain("event.startTime");
    expect(issuePaths({ broadcasts: [broadcast({ date: null })] })).toContain("broadcasts.0.date");
    expect(issuePaths({ broadcasts: [broadcast({ date: null, startTime: null })] })).toContain("broadcasts.0.date");
  });

  it("開始時刻のない終了時刻は拒否", () => {
    expect(issuePaths({ broadcasts: [broadcast({ startTime: null })] })).toContain("broadcasts.0.endTime");
  });

  it("NO_BROADCAST と放送枠の同時指定は拒否", () => {
    expect(issuePaths({ broadcastStatus: "NO_BROADCAST", broadcasts: [broadcast()] })).toContain("broadcastStatus");
    expect(parse({ broadcastStatus: "NO_BROADCAST" }).success).toBe(true);
  });

  it(`放送枠は ${MAX_EXTRACTED_BROADCASTS} 件まで`, () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => broadcast({ providerName: `局${i}` }));
    expect(parse({ broadcasts: many(MAX_EXTRACTED_BROADCASTS) }).success).toBe(true);
    expect(parse({ broadcasts: many(MAX_EXTRACTED_BROADCASTS + 1) }).success).toBe(false);
  });

  it("列挙値・文字列長", () => {
    expect(parse({ broadcastStatus: "MAYBE" }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ medium: "SATELLITE" })] }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ providerName: "   " })] }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ providerName: "あ".repeat(101) })] }).success).toBe(false);
    expect(parse({ broadcasts: [broadcast({ evidence: "あ".repeat(301) })] }).success).toBe(false);
    expect(parse({ notes: "あ".repeat(1001) }).success).toBe(false);
  });

  it("配列・オブジェクト以外の入力は拒否", () => {
    expect(parse(null).success).toBe(false);
    expect(parse("CONFIRMED").success).toBe(false);
    expect(parse([]).success).toBe(false);
    expect(parse({ broadcasts: "TERRESTRIAL" }).success).toBe(false);
  });
});

function normalize(raw: ExtractionResultInput, tz = "Asia/Tokyo") {
  return normalizeExtraction(extractionResultSchema.parse(raw), tz);
}

describe("normalizeExtraction（正規化）", () => {
  it("放送の日付・時刻は日本時間として UTC の瞬間に変換する", () => {
    const n = normalize({ broadcasts: [broadcast()] }, "Europe/Zurich");
    expect(n.schemaVersion).toBe(CANDIDATE_SCHEMA_VERSION);
    expect(n.broadcasts[0]).toMatchObject({
      airDate: "2026-10-12",
      startAt: "2026-10-11T22:50:00.000Z",
      endAt: "2026-10-12T05:00:00.000Z",
    });
  });

  it("終了時刻が開始時刻以前なら翌日とみなす", () => {
    const n = normalize({
      broadcasts: [
        broadcast({ startTime: "23:30", endTime: "01:00" }),
        broadcast({ providerName: "同時刻", startTime: "20:00", endTime: "20:00" }),
      ],
    });
    expect(n.broadcasts[0].startAt).toBe("2026-10-12T14:30:00.000Z"); // 10/12 23:30 JST
    expect(n.broadcasts[0].endAt).toBe("2026-10-12T16:00:00.000Z"); // 10/13 1:00 JST
    expect(n.broadcasts[1].endAt).toBe("2026-10-13T11:00:00.000Z"); // 10/13 20:00 JST
  });

  it("日付のみの放送は startAt / endAt を null のまま airDate を保持する", () => {
    const n = normalize({ broadcasts: [broadcast({ startTime: null, endTime: null })] });
    expect(n.broadcasts[0]).toMatchObject({ airDate: "2026-10-12", startAt: null, endAt: null });
  });

  it("大会の開始時刻は開催地のタイムゾーンで解釈する", () => {
    const raw = { event: { startDate: "2026-10-17", endDate: "2026-10-17", startTime: "20:00", venueName: "デモ競技場" } };
    expect(normalize(raw, "Europe/Zurich").event).toEqual({
      startDate: "2026-10-17",
      endDate: "2026-10-17",
      startAt: "2026-10-17T18:00:00.000Z",
      venueName: "デモ競技場",
    });
    expect(normalize(raw, "Asia/Tokyo").event.startAt).toBe("2026-10-17T11:00:00.000Z");
  });

  it("大会の開始時刻が不明なら startAt は null（仮の 0:00 にしない）", () => {
    expect(normalize({ event: { startDate: "2026-10-17" } }, "Europe/Zurich").event.startAt).toBeNull();
  });

  it("itemKey は照合キー。重複したら #2, #3 と連番を付ける", () => {
    const n = normalize({
      broadcasts: [
        broadcast(),
        broadcast({ providerName: "ＤＥＭＯ テレビ" }),
        broadcast(),
        broadcast({ viewingType: "DELAYED" }),
        broadcast(),
      ],
    });
    const base = "TERRESTRIAL|デモテレビ(架空)|2026-10-12|LIVE"; // NFKC で全角括弧は半角になる
    expect(n.broadcasts.map((b) => b.itemKey)).toEqual([
      base,
      "TERRESTRIAL|demoテレビ|2026-10-12|LIVE",
      `${base}#2`,
      "TERRESTRIAL|デモテレビ(架空)|2026-10-12|DELAYED",
      `${base}#3`,
    ]);
    expect(new Set(n.broadcasts.map((b) => b.itemKey)).size).toBe(5);
  });

  it("局名の表記ゆれ（全角・半角・大小文字・空白）は同じ照合キー", () => {
    expect(normalizeProviderName("ＤＥＭＯ　テレビ ")).toBe("demoテレビ");
    const n = normalize({
      broadcasts: [broadcast({ providerName: "Demo TV" }), broadcast({ providerName: "ｄｅｍｏ ｔｖ" })],
    });
    expect(n.broadcasts[1].itemKey).toBe(`${n.broadcasts[0].itemKey}#2`);
  });

  it("broadcastMatchKey は日付不明を '-' で表す", () => {
    expect(broadcastMatchKey({ medium: "BS", providerName: "BS Demo", jstDate: null, viewingType: "UNKNOWN" })).toBe(
      "BS|bsdemo|-|UNKNOWN",
    );
  });
});

describe("parseAndNormalizeExtraction", () => {
  it("成功時は正規化済みデータ", () => {
    const r = parseAndNormalizeExtraction({ broadcastStatus: "CONFIRMED", broadcasts: [broadcast()] }, "Asia/Tokyo");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.broadcasts).toHaveLength(1);
  });

  it("失敗時は ZodError を返し、例外にしない", () => {
    const r = parseAndNormalizeExtraction({ broadcasts: [broadcast({ watchUrl: "javascript:x" })] }, "Asia/Tokyo");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.length).toBeGreaterThan(0);
  });
});

describe("parseStoredPayload", () => {
  const stored = () =>
    JSON.parse(
      JSON.stringify(
        normalize({
          broadcastStatus: "CONFIRMED",
          event: { startDate: "2026-10-12", startTime: "09:00" },
          broadcasts: [broadcast({ watchUrl: "https://example.com/w" })],
          notes: "メモ",
        }),
      ),
    );

  it("JSON として保存した正規化済みデータを読み戻せる（往復）", () => {
    const json = stored();
    expect(parseStoredPayload(json)).toEqual(json);
  });

  it("スキーマバージョン違い・想定外のキー・危険な URL は拒否", () => {
    expect(() => parseStoredPayload({ ...stored(), schemaVersion: 2 })).toThrow();
    expect(() => parseStoredPayload({ ...stored(), extra: true })).toThrow();
    const bad = stored();
    bad.broadcasts[0].watchUrl = "javascript:alert(1)";
    expect(() => parseStoredPayload(bad)).toThrow();
    const badDate = stored();
    badDate.broadcasts[0].startAt = "2026-10-12 07:50";
    expect(() => parseStoredPayload(badDate)).toThrow();
  });
});
