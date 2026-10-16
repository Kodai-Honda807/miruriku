import { describe, expect, it } from "vitest";

import { extractionResultSchema, normalizeExtraction, type ExtractionResultInput, type NormalizedExtraction } from "./candidate";
import { JST, zonedToUtc } from "./datetime";
import {
  computeCandidateDiff,
  eventUpdateFromChanges,
  proposedBroadcastInfoStatus,
  providerBaseName,
  slotFieldsFromProposed,
  slotUpdateFromChanges,
  toCurrentSlotState,
  type CurrentEventState,
  type CurrentSlotState,
} from "./diff";

function currentSlot(overrides: Partial<CurrentSlotState> = {}): CurrentSlotState {
  return {
    id: "slot-tv",
    medium: "TERRESTRIAL",
    providerName: "デモテレビ",
    airDate: "2026-10-12",
    startAt: zonedToUtc("2026-10-12", "07:50", JST),
    endAt: zonedToUtc("2026-10-12", "14:00", JST),
    cost: "FREE",
    viewingType: "LIVE",
    region: "NATIONWIDE",
    regionNote: null,
    note: null,
    watchUrl: null,
    infoUrl: "https://example.com/info",
    status: "PUBLISHED",
    verificationStatus: "CONFIRMED",
    ...overrides,
  };
}

function currentEvent(overrides: Partial<CurrentEventState> = {}): CurrentEventState {
  return {
    timezone: JST,
    startDate: "2026-10-12",
    endDate: "2026-10-12",
    startAt: zonedToUtc("2026-10-12", "09:00", JST),
    venueName: "デモ競技場",
    broadcastInfoStatus: "CONFIRMED",
    slots: [],
    ...overrides,
  };
}

type BroadcastInput = NonNullable<ExtractionResultInput["broadcasts"]>[number];

const tvBroadcast = (overrides: Partial<BroadcastInput> = {}): BroadcastInput => ({
  medium: "TERRESTRIAL",
  providerName: "デモテレビ",
  date: "2026-10-12",
  startTime: "07:50",
  endTime: "14:00",
  cost: "FREE",
  viewingType: "LIVE",
  region: "NATIONWIDE",
  infoUrl: "https://example.com/info",
  ...overrides,
});

function candidate(raw: ExtractionResultInput, tz = JST): NormalizedExtraction {
  return normalizeExtraction(extractionResultSchema.parse(raw), tz);
}

describe("computeCandidateDiff: 放送枠", () => {
  it("一致する既存枠がなければ add", () => {
    const diff = computeCandidateDiff(currentEvent(), candidate({ broadcastStatus: "CONFIRMED", broadcasts: [tvBroadcast()] }));
    expect(diff.slots).toHaveLength(1);
    expect(diff.slots[0].kind).toBe("add");
    expect(diff.untouchedSlots).toEqual([]);
    expect(diff.hasChanges).toBe(true);
  });

  it("同じ内容なら unchanged、変更がなければ hasChanges は false", () => {
    const diff = computeCandidateDiff(
      currentEvent({ slots: [currentSlot()] }),
      candidate({ broadcastStatus: "CONFIRMED", broadcasts: [tvBroadcast()] }),
    );
    expect(diff.slots).toEqual([expect.objectContaining({ kind: "unchanged", slotId: "slot-tv" })]);
    expect(diff.eventChanges).toEqual([]);
    expect(diff.hasChanges).toBe(false);
  });

  it("変更のある項目だけを update として示す", () => {
    const diff = computeCandidateDiff(
      currentEvent({ slots: [currentSlot()] }),
      candidate({ broadcasts: [tvBroadcast({ endTime: "15:00", note: "延長の可能性あり" })] }),
    );
    expect(diff.slots).toHaveLength(1);
    const item = diff.slots[0];
    expect(item.kind).toBe("update");
    if (item.kind !== "update") return;
    expect(item.slotId).toBe("slot-tv");
    expect(item.changes).toEqual([
      { field: "endAt", before: "2026-10-12T05:00:00.000Z", after: "2026-10-12T06:00:00.000Z" },
      { field: "note", before: null, after: "延長の可能性あり" },
    ]);
    expect(diff.hasChanges).toBe(true);
  });

  it("候補の不明値（null / UNKNOWN）は既存値を上書きしない", () => {
    const existing = currentSlot({
      regionNote: "関東ローカル",
      note: "既存の補足",
      watchUrl: "https://example.com/watch",
      region: "REGIONAL",
    });
    const diff = computeCandidateDiff(
      currentEvent({ slots: [existing] }),
      candidate({
        broadcasts: [
          {
            medium: "TERRESTRIAL",
            providerName: "デモテレビ",
            date: "2026-10-12",
            viewingType: "LIVE",
            // 時刻・料金・地域・URL などは不明
          },
        ],
      }),
    );
    expect(diff.slots).toEqual([expect.objectContaining({ kind: "unchanged", slotId: "slot-tv" })]);
    expect(diff.hasChanges).toBe(false);
  });

  it("緩い照合: 既存枠の日付・視聴形態が不明でも同じ局・媒体なら同じ枠として更新する", () => {
    const existing = currentSlot({ airDate: null, startAt: null, endAt: null, viewingType: "UNKNOWN", cost: "UNKNOWN" });
    const diff = computeCandidateDiff(currentEvent({ slots: [existing] }), candidate({ broadcasts: [tvBroadcast()] }));
    expect(diff.slots).toHaveLength(1);
    const item = diff.slots[0];
    expect(item.kind).toBe("update");
    if (item.kind !== "update") return;
    expect(item.changes.map((c) => c.field)).toEqual(["airDate", "startAt", "endAt", "cost", "viewingType"]);
    expect(item.changes.find((c) => c.field === "airDate")).toEqual({ field: "airDate", before: null, after: "2026-10-12" });
    expect(diff.untouchedSlots).toEqual([]);
  });

  it("緩い照合: 候補の日付が不明でも既存枠と照合し、既存の日付を消さない", () => {
    const diff = computeCandidateDiff(
      currentEvent({ slots: [currentSlot()] }),
      candidate({ broadcasts: [{ medium: "TERRESTRIAL", providerName: "デモテレビ" }] }),
    );
    expect(diff.slots).toEqual([expect.objectContaining({ kind: "unchanged", slotId: "slot-tv" })]);
  });

  it("局名の表記ゆれ（全角・半角・空白）は同じ枠として扱う", () => {
    const existing = currentSlot({ providerName: "Demo TV" });
    const diff = computeCandidateDiff(
      currentEvent({ slots: [existing] }),
      candidate({ broadcasts: [tvBroadcast({ providerName: "ＤＥＭＯ　ＴＶ" })] }),
    );
    // 照合は同じ枠になる（新規追加にならない）。表記だけの違いを変更として提示するかは仕様判断のため検証しない
    expect(diff.slots[0].kind).not.toBe("add");
    expect(diff.slots[0]).toMatchObject({ slotId: "slot-tv" });
    expect(diff.untouchedSlots).toEqual([]);
  });

  it("媒体・局が異なる枠とは照合しない", () => {
    const diff = computeCandidateDiff(
      currentEvent({ slots: [currentSlot()] }),
      candidate({ broadcasts: [tvBroadcast({ medium: "BS" }), tvBroadcast({ providerName: "別のテレビ" })] }),
    );
    expect(diff.slots.map((s) => s.kind)).toEqual(["add", "add"]);
    expect(diff.untouchedSlots.map((s) => s.slotId)).toEqual(["slot-tv"]);
  });

  it("完全一致を緩い一致より優先し、既存枠は 1 回だけ使う", () => {
    const undated = currentSlot({ id: "slot-undated", airDate: null, startAt: null, endAt: null });
    const dated = currentSlot({ id: "slot-dated" });
    const diff = computeCandidateDiff(
      currentEvent({ slots: [undated, dated] }),
      candidate({ broadcasts: [tvBroadcast(), tvBroadcast(), tvBroadcast()] }),
    );
    // 1 件目は完全一致の slot-dated、2 件目は緩い一致の slot-undated、3 件目は新規
    expect(diff.slots.map((s) => [s.kind, "slotId" in s ? s.slotId : null])).toEqual([
      ["unchanged", "slot-dated"],
      ["update", "slot-undated"],
      ["add", null],
    ]);
    expect(diff.untouchedSlots).toEqual([]);
  });

  it("下書きの既存枠とも照合する（重複作成を避ける）", () => {
    const draft = currentSlot({ id: "slot-draft", status: "DRAFT", verificationStatus: "UNVERIFIED" });
    const diff = computeCandidateDiff(currentEvent({ slots: [draft] }), candidate({ broadcasts: [tvBroadcast()] }));
    expect(diff.slots[0]).toMatchObject({ kind: "unchanged", slotId: "slot-draft" });
  });

  it("候補に含まれない既存枠は削除せず untouchedSlots として示す", () => {
    const bs = currentSlot({
      id: "slot-bs",
      medium: "BS",
      providerName: "BSデモ",
      airDate: "2026-10-13",
      startAt: zonedToUtc("2026-10-13", "12:00", JST),
    });
    const diff = computeCandidateDiff(currentEvent({ slots: [currentSlot(), bs] }), candidate({ broadcasts: [tvBroadcast()] }));
    expect(diff.untouchedSlots).toEqual([
      { slotId: "slot-bs", medium: "BS", providerName: "BSデモ", airDate: "2026-10-13", startAt: "2026-10-13T03:00:00.000Z" },
    ]);
    expect(diff.slots.some((s) => (s.kind as string) === "remove")).toBe(false);
    expect(diff.hasChanges).toBe(false);
  });
});

describe("computeCandidateDiff: 大会の項目", () => {
  it("判明している項目の変更のみ示す", () => {
    const diff = computeCandidateDiff(
      currentEvent(),
      candidate({ event: { startDate: "2026-10-13", endDate: "2026-10-14", startTime: "10:00", venueName: "新会場" } }),
    );
    expect(diff.eventChanges).toEqual([
      { field: "startDate", before: "2026-10-12", after: "2026-10-13" },
      { field: "endDate", before: "2026-10-12", after: "2026-10-14" },
      { field: "startAt", before: "2026-10-12T00:00:00.000Z", after: "2026-10-13T01:00:00.000Z" },
      { field: "venueName", before: "デモ競技場", after: "新会場" },
    ]);
    expect(diff.hasChanges).toBe(true);
  });

  it("候補で不明な項目は既存値を上書きしない", () => {
    const diff = computeCandidateDiff(currentEvent(), candidate({}));
    expect(diff.eventChanges).toEqual([]);
    expect(diff.hasChanges).toBe(false);
  });

  it("既存の開始時刻が不明で候補に開始時刻があれば追加する", () => {
    const diff = computeCandidateDiff(
      currentEvent({ startAt: null }),
      candidate({ event: { startDate: "2026-10-12", startTime: "09:00" } }),
    );
    expect(diff.eventChanges).toEqual([{ field: "startAt", before: null, after: "2026-10-12T00:00:00.000Z" }]);
  });

  it("海外大会の開始時刻は開催地タイムゾーンで比較する", () => {
    const tz = "Europe/Zurich";
    const current = currentEvent({
      timezone: tz,
      startDate: "2026-10-17",
      endDate: "2026-10-17",
      startAt: zonedToUtc("2026-10-17", "20:00", tz),
    });
    const diff = computeCandidateDiff(current, candidate({ event: { startDate: "2026-10-17", startTime: "20:00" } }, tz));
    expect(diff.eventChanges).toEqual([]);
  });

  it("broadcastStatus の UNKNOWN かつ放送枠なしは放送情報状態を変えない", () => {
    for (const status of ["UNVERIFIED", "NO_BROADCAST", "CONFIRMED", "PAST_REFERENCE"] as const) {
      const diff = computeCandidateDiff(currentEvent({ broadcastInfoStatus: status }), candidate({ broadcastStatus: "UNKNOWN" }));
      expect(diff.eventChanges).toEqual([]);
    }
  });

  it("放送情報状態の変更を示す", () => {
    const diff = computeCandidateDiff(
      currentEvent({ broadcastInfoStatus: "UNVERIFIED" }),
      candidate({ broadcastStatus: "NO_BROADCAST" }),
    );
    expect(diff.eventChanges).toEqual([{ field: "broadcastInfoStatus", before: "UNVERIFIED", after: "NO_BROADCAST" }]);
    expect(diff.hasChanges).toBe(true);
  });
});

describe("proposedBroadcastInfoStatus", () => {
  it.each([
    ["CONFIRMED", false, "CONFIRMED"],
    ["NOT_ANNOUNCED", false, "NOT_ANNOUNCED"],
    ["NO_BROADCAST", false, "NO_BROADCAST"],
    ["UNKNOWN", true, "CONFIRMED"],
    ["UNKNOWN", false, null],
  ] as const)("%s（放送枠あり: %s）→ %s", (broadcastStatus, withSlots, expected) => {
    const c = candidate({ broadcastStatus, broadcasts: withSlots ? [tvBroadcast()] : [] });
    expect(proposedBroadcastInfoStatus(c)).toBe(expected);
  });
});

describe("承認時に書き込む値への変換", () => {
  it("slotUpdateFromChanges は変更のある項目だけを DB の値に変換する", () => {
    const data = slotUpdateFromChanges([
      { field: "providerName", before: "旧", after: "新" },
      { field: "airDate", before: null, after: "2026-10-13" },
      { field: "startAt", before: null, after: "2026-10-12T22:50:00.000Z" },
      { field: "endAt", before: "2026-10-12T05:00:00.000Z", after: null },
      { field: "cost", before: "UNKNOWN", after: "PAID" },
      { field: "viewingType", before: "UNKNOWN", after: "DELAYED" },
      { field: "region", before: "UNKNOWN", after: "REGIONAL" },
      { field: "regionNote", before: null, after: "デモ県のみ" },
      { field: "watchUrl", before: null, after: "https://example.com/w" },
    ]);
    expect(data).toEqual({
      providerName: "新",
      airDate: new Date("2026-10-13T00:00:00.000Z"),
      startAt: new Date("2026-10-12T22:50:00.000Z"),
      endAt: null,
      cost: "PAID",
      viewingType: "DELAYED",
      region: "REGIONAL",
      regionNote: "デモ県のみ",
      watchUrl: "https://example.com/w",
    });
    expect(Object.keys(slotUpdateFromChanges([]))).toEqual([]);
  });

  it("差分から得た変更をそのまま変換できる", () => {
    const diff = computeCandidateDiff(
      currentEvent({ slots: [currentSlot()] }),
      candidate({ broadcasts: [tvBroadcast({ endTime: "15:00" })] }),
    );
    const item = diff.slots[0];
    if (item.kind !== "update") throw new Error("update を期待");
    expect(slotUpdateFromChanges(item.changes)).toEqual({ endAt: new Date("2026-10-12T06:00:00.000Z") });
  });

  it("eventUpdateFromChanges", () => {
    expect(
      eventUpdateFromChanges([
        { field: "startDate", before: "2026-10-12", after: "2026-10-13" },
        { field: "endDate", before: "2026-10-12", after: "2026-10-14" },
        { field: "startAt", before: null, after: "2026-10-13T01:00:00.000Z" },
        { field: "venueName", before: null, after: "新会場" },
        { field: "broadcastInfoStatus", before: "UNVERIFIED", after: "CONFIRMED" },
      ]),
    ).toEqual({
      startDate: new Date("2026-10-13T00:00:00.000Z"),
      endDate: new Date("2026-10-14T00:00:00.000Z"),
      startAt: new Date("2026-10-13T01:00:00.000Z"),
      venueName: "新会場",
      broadcastInfoStatus: "CONFIRMED",
    });
    expect(eventUpdateFromChanges([])).toEqual({});
  });

  it("slotFieldsFromProposed は新規作成用の値（@db.Date は UTC 0 時）", () => {
    const c = candidate({ broadcasts: [tvBroadcast({ watchUrl: "https://example.com/w" })] });
    expect(slotFieldsFromProposed(c.broadcasts[0])).toEqual({
      medium: "TERRESTRIAL",
      providerName: "デモテレビ",
      airDate: new Date("2026-10-12T00:00:00.000Z"),
      startAt: new Date("2026-10-11T22:50:00.000Z"),
      endAt: new Date("2026-10-12T05:00:00.000Z"),
      cost: "FREE",
      viewingType: "LIVE",
      region: "NATIONWIDE",
      regionNote: null,
      note: null,
      watchUrl: "https://example.com/w",
      infoUrl: "https://example.com/info",
    });
  });

  it("toCurrentSlotState は @db.Date を LocalDate に変換する", () => {
    const { airDate, ...rest } = currentSlot();
    void airDate;
    expect(toCurrentSlotState({ ...rest, airDate: new Date("2026-10-12T00:00:00.000Z") }).airDate).toBe("2026-10-12");
    expect(toCurrentSlotState({ ...rest, airDate: null }).airDate).toBeNull();
  });
});

describe("computeCandidateDiff: 統合時に決めた仕様", () => {
  it("局名が表記ゆれ（全角・半角、空白）だけの違いなら、人が入力した名称を上書きしない", () => {
    const diff = computeCandidateDiff(
      currentEvent({ slots: [currentSlot({ providerName: "デモ テレビ" })] }),
      candidate({ broadcastStatus: "CONFIRMED", broadcasts: [tvBroadcast({ providerName: "デモテレビ" })] }),
    );
    expect(diff.slots[0].kind).toBe("unchanged");
    expect(diff.hasChanges).toBe(false);
  });

  it("過去大会の参考情報の枠は今年の候補と照合せず、今年の枠は追加として扱う", () => {
    const pastSlot = currentSlot({
      id: "slot-past",
      airDate: null,
      startAt: null,
      endAt: null,
      viewingType: "UNKNOWN",
      verificationStatus: "PAST_REFERENCE",
    });
    const diff = computeCandidateDiff(
      currentEvent({ broadcastInfoStatus: "PAST_REFERENCE", slots: [pastSlot] }),
      candidate({ broadcastStatus: "CONFIRMED", broadcasts: [tvBroadcast()] }),
    );
    expect(diff.slots.map((s) => s.kind)).toEqual(["add"]);
    expect(diff.untouchedSlots.map((s) => s.slotId)).toEqual(["slot-past"]);
  });
});

describe("確認済みの大会の格下げ防止", () => {
  it("確認済みの大会に「未発表」の候補が来ても、放送情報の状態の変更を提案しない", () => {
    const diff = computeCandidateDiff(
      currentEvent({ broadcastInfoStatus: "CONFIRMED" }),
      candidate({ broadcastStatus: "NOT_ANNOUNCED", broadcasts: [] }),
    );
    expect(diff.eventChanges.find((c) => c.field === "broadcastInfoStatus")).toBeUndefined();
  });

  it("未確認の大会には「未発表」を提案する", () => {
    const diff = computeCandidateDiff(
      currentEvent({ broadcastInfoStatus: "UNVERIFIED" }),
      candidate({ broadcastStatus: "NOT_ANNOUNCED", broadcasts: [] }),
    );
    expect(diff.eventChanges).toContainEqual({ field: "broadcastInfoStatus", before: "UNVERIFIED", after: "NOT_ANNOUNCED" });
  });

  it("確認済みの大会でも「放送・配信なし」の公式案内は提案する（人が承認するまで反映しない）", () => {
    const diff = computeCandidateDiff(
      currentEvent({ broadcastInfoStatus: "CONFIRMED" }),
      candidate({ broadcastStatus: "NO_BROADCAST", broadcasts: [] }),
    );
    expect(diff.eventChanges).toContainEqual({ field: "broadcastInfoStatus", before: "CONFIRMED", after: "NO_BROADCAST" });
  });
});

describe("局・サービス名の括弧書きの違い", () => {
  it("providerBaseName は末尾の括弧書きを除き、括弧だけの名前はそのまま残す", () => {
    expect(providerBaseName("TVer（ティーバー）")).toBe("tver");
    expect(providerBaseName("YouTube（東京マラソン財団公式チャンネル）")).toBe("youtube");
    expect(providerBaseName("日本テレビ（関東エリア）ほか")).toBe("日本テレビ(関東エリア)ほか");
    expect(providerBaseName("（未定）")).toBe("(未定)");
  });

  it("括弧書きだけが違う既存枠は同じ枠とみなし、追加や名称変更を提案しない", () => {
    const diff = computeCandidateDiff(
      currentEvent({
        slots: [
          currentSlot({
            id: "slot-tver",
            medium: "INTERNET",
            providerName: "TVer",
            airDate: "2026-10-12",
            startAt: null,
            endAt: null,
            cost: "FREE",
            viewingType: "LIVE",
            region: "NATIONWIDE",
            infoUrl: "https://example.com/info",
          }),
        ],
      }),
      candidate({
        broadcastStatus: "CONFIRMED",
        broadcasts: [
          tvBroadcast({ medium: "INTERNET", providerName: "TVer（ティーバー）", date: null, startTime: null, endTime: null, region: "UNKNOWN" }),
        ],
      }),
    );
    expect(diff.slots.filter((s) => s.kind === "add")).toHaveLength(0);
    const changes = diff.slots.flatMap((s) => (s.kind === "update" ? s.changes : []));
    expect(changes.find((c) => c.field === "providerName")).toBeUndefined();
  });
});
