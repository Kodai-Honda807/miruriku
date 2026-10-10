/**
 * 抽出候補（NormalizedExtraction）と現在の大会情報との差分。
 *
 * 方針:
 * - 候補で不明（null / UNKNOWN）の項目は既存値を上書きしない（「見つからない」≠「なし」）
 * - 候補に含まれない既存の放送枠は削除しない（untouchedSlots として提示のみ）
 * - 過去大会の参考情報（PAST_REFERENCE）の枠は照合対象にしない（今年の情報は別の枠として追加する）
 * - 局・サービス名の表記ゆれ（全角・半角、空白）だけの違いは変更として扱わない
 * - 収集時にスナップショットを保存し、レビュー画面・承認時には最新の状態で再計算する
 */
import type { NormalizedBroadcast, NormalizedExtraction } from "./candidate";
import { normalizeProviderName } from "./candidate";
import { JST, dbDateToLocalDate, localDateToDbDate, toZonedParts, type LocalDate } from "./datetime";
import type {
  BroadcastInfoStatus,
  BroadcastMedium,
  CostType,
  PublicationStatus,
  RegionAvailability,
  SlotVerificationStatus,
  ViewingType,
} from "./enums";

export type CurrentSlotState = {
  id: string;
  medium: BroadcastMedium;
  providerName: string;
  airDate: LocalDate | null;
  startAt: Date | null;
  endAt: Date | null;
  cost: CostType;
  viewingType: ViewingType;
  region: RegionAvailability;
  regionNote: string | null;
  note: string | null;
  watchUrl: string | null;
  infoUrl: string | null;
  status: PublicationStatus;
  verificationStatus: SlotVerificationStatus;
};

export type CurrentEventState = {
  timezone: string;
  startDate: LocalDate;
  endDate: LocalDate;
  startAt: Date | null;
  venueName: string | null;
  broadcastInfoStatus: BroadcastInfoStatus;
  /** 下書きを含むすべての放送枠（重複作成を避けるため） */
  slots: CurrentSlotState[];
};

/** 差分の値は表示・保存しやすいよう文字列（日時は ISO 8601、日付は YYYY-MM-DD）か null */
export type DiffValue = string | null;

export const EVENT_DIFF_FIELDS = ["startDate", "endDate", "startAt", "venueName", "broadcastInfoStatus"] as const;
export type EventDiffField = (typeof EVENT_DIFF_FIELDS)[number];

export const SLOT_DIFF_FIELDS = [
  "providerName",
  "airDate",
  "startAt",
  "endAt",
  "cost",
  "viewingType",
  "region",
  "regionNote",
  "note",
  "watchUrl",
  "infoUrl",
] as const;
export type SlotDiffField = (typeof SLOT_DIFF_FIELDS)[number];

export type FieldChange<F extends string = string> = {
  field: F;
  before: DiffValue;
  after: DiffValue;
};

export type SlotDiffItem =
  | { kind: "add"; itemKey: string; proposed: NormalizedBroadcast }
  | {
      kind: "update";
      itemKey: string;
      slotId: string;
      changes: FieldChange<SlotDiffField>[];
      proposed: NormalizedBroadcast;
    }
  | { kind: "unchanged"; itemKey: string; slotId: string; proposed: NormalizedBroadcast };

export type UntouchedSlot = {
  slotId: string;
  medium: BroadcastMedium;
  providerName: string;
  airDate: LocalDate | null;
  startAt: string | null;
};

export type CandidateDiff = {
  schemaVersion: 1;
  eventChanges: FieldChange<EventDiffField>[];
  slots: SlotDiffItem[];
  /** 候補に含まれない既存の放送枠（自動では削除しない） */
  untouchedSlots: UntouchedSlot[];
  /** 公開データに変更が生じるか（確認日時の更新のみの場合は false） */
  hasChanges: boolean;
};

/** 候補が示す大会全体の放送情報状態。判断できない場合は null（変更しない） */
export function proposedBroadcastInfoStatus(candidate: NormalizedExtraction): BroadcastInfoStatus | null {
  switch (candidate.broadcastStatus) {
    case "CONFIRMED":
      return "CONFIRMED";
    case "NOT_ANNOUNCED":
      return "NOT_ANNOUNCED";
    case "NO_BROADCAST":
      return "NO_BROADCAST";
    case "UNKNOWN":
      return candidate.broadcasts.length > 0 ? "CONFIRMED" : null;
  }
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function slotJstDate(slot: { startAt: Date | string | null; airDate: LocalDate | null }): LocalDate | null {
  if (slot.startAt) {
    const d = typeof slot.startAt === "string" ? new Date(slot.startAt) : slot.startAt;
    return toZonedParts(d, JST).date;
  }
  return slot.airDate;
}

function currentSlotValue(slot: CurrentSlotState, field: SlotDiffField): DiffValue {
  switch (field) {
    case "startAt":
      return iso(slot.startAt);
    case "endAt":
      return iso(slot.endAt);
    default:
      return slot[field];
  }
}

/** 候補側の値が「判明している」か（不明な値では既存値を上書きしない） */
function isKnown(field: SlotDiffField, value: DiffValue): value is string {
  if (value === null) return false;
  if ((field === "cost" || field === "viewingType" || field === "region") && value === "UNKNOWN") return false;
  return true;
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

function slotChanges(slot: CurrentSlotState, proposed: NormalizedBroadcast): FieldChange<SlotDiffField>[] {
  const changes: FieldChange<SlotDiffField>[] = [];
  for (const field of SLOT_DIFF_FIELDS) {
    const after = proposed[field] as DiffValue;
    if (!isKnown(field, after)) continue;
    const before = currentSlotValue(slot, field);
    let equal: boolean;
    if (field === "startAt" || field === "endAt") {
      equal = sameInstant(before, after);
    } else if (field === "providerName") {
      // 全角・半角や空白だけの表記ゆれでは、人が入力した名称を上書きしない
      equal = before !== null && normalizeProviderName(before) === normalizeProviderName(after);
    } else {
      equal = before === after;
    }
    if (!equal) changes.push({ field, before, after });
  }
  return changes;
}

function isExactMatch(slot: CurrentSlotState, proposed: NormalizedBroadcast): boolean {
  return (
    slot.medium === proposed.medium &&
    normalizeProviderName(slot.providerName) === normalizeProviderName(proposed.providerName) &&
    slotJstDate(slot) === slotJstDate(proposed) &&
    slot.viewingType === proposed.viewingType
  );
}

/** 日付や視聴形態が片方だけ不明な場合も同じ枠とみなす緩い照合 */
function isLooseMatch(slot: CurrentSlotState, proposed: NormalizedBroadcast): boolean {
  if (slot.medium !== proposed.medium) return false;
  if (normalizeProviderName(slot.providerName) !== normalizeProviderName(proposed.providerName)) return false;
  const a = slotJstDate(slot);
  const b = slotJstDate(proposed);
  const dateOk = a === b || a === null || b === null;
  const typeOk =
    slot.viewingType === proposed.viewingType || slot.viewingType === "UNKNOWN" || proposed.viewingType === "UNKNOWN";
  return dateOk && typeOk;
}

export function computeCandidateDiff(current: CurrentEventState, candidate: NormalizedExtraction): CandidateDiff {
  // --- 大会の項目 ---
  const eventChanges: FieldChange<EventDiffField>[] = [];
  const ev = candidate.event;
  if (ev.startDate && ev.startDate !== current.startDate) {
    eventChanges.push({ field: "startDate", before: current.startDate, after: ev.startDate });
  }
  if (ev.endDate && ev.endDate !== current.endDate) {
    eventChanges.push({ field: "endDate", before: current.endDate, after: ev.endDate });
  }
  if (ev.startAt && !sameInstant(iso(current.startAt), ev.startAt)) {
    eventChanges.push({ field: "startAt", before: iso(current.startAt), after: ev.startAt });
  }
  if (ev.venueName && ev.venueName !== current.venueName) {
    eventChanges.push({ field: "venueName", before: current.venueName, after: ev.venueName });
  }
  const proposedStatus = proposedBroadcastInfoStatus(candidate);
  if (proposedStatus && proposedStatus !== current.broadcastInfoStatus) {
    eventChanges.push({ field: "broadcastInfoStatus", before: current.broadcastInfoStatus, after: proposedStatus });
  }

  // --- 放送枠の照合（完全一致 → 緩い一致の順。既存枠は 1 回だけ使う） ---
  // 過去大会の参考情報の枠は今年の候補と照合しない（参考枠を今年のデータで書き換えない）。
  const matchable = current.slots.filter((s) => s.verificationStatus !== "PAST_REFERENCE");
  const matched = new Map<string, CurrentSlotState>(); // itemKey -> slot
  const usedSlotIds = new Set<string>();
  for (const pass of [isExactMatch, isLooseMatch]) {
    for (const proposed of candidate.broadcasts) {
      if (matched.has(proposed.itemKey)) continue;
      const slot = matchable.find((s) => !usedSlotIds.has(s.id) && pass(s, proposed));
      if (slot) {
        matched.set(proposed.itemKey, slot);
        usedSlotIds.add(slot.id);
      }
    }
  }

  const slots: SlotDiffItem[] = candidate.broadcasts.map((proposed) => {
    const slot = matched.get(proposed.itemKey);
    if (!slot) return { kind: "add", itemKey: proposed.itemKey, proposed };
    const changes = slotChanges(slot, proposed);
    return changes.length > 0
      ? { kind: "update", itemKey: proposed.itemKey, slotId: slot.id, changes, proposed }
      : { kind: "unchanged", itemKey: proposed.itemKey, slotId: slot.id, proposed };
  });

  const untouchedSlots: UntouchedSlot[] = current.slots
    .filter((s) => !usedSlotIds.has(s.id))
    .map((s) => ({
      slotId: s.id,
      medium: s.medium,
      providerName: s.providerName,
      airDate: s.airDate,
      startAt: iso(s.startAt),
    }));

  return {
    schemaVersion: 1,
    eventChanges,
    slots,
    untouchedSlots,
    hasChanges: eventChanges.length > 0 || slots.some((s) => s.kind !== "unchanged"),
  };
}

// ---------------------------------------------------------------------------
// 承認時に DB へ書き込む値への変換（Prisma の型には依存しないプレーンな値）
// ---------------------------------------------------------------------------

/** 新規作成する放送枠の値 */
export function slotFieldsFromProposed(p: NormalizedBroadcast) {
  return {
    medium: p.medium,
    providerName: p.providerName,
    airDate: p.airDate ? localDateToDbDate(p.airDate) : null,
    startAt: p.startAt ? new Date(p.startAt) : null,
    endAt: p.endAt ? new Date(p.endAt) : null,
    cost: p.cost,
    viewingType: p.viewingType,
    region: p.region,
    regionNote: p.regionNote,
    note: p.note,
    watchUrl: p.watchUrl,
    infoUrl: p.infoUrl,
  };
}

/** 既存の放送枠に適用する変更（変更のある項目のみ） */
export function slotUpdateFromChanges(changes: FieldChange<SlotDiffField>[]) {
  const data: Partial<ReturnType<typeof slotFieldsFromProposed>> = {};
  for (const { field, after } of changes) {
    switch (field) {
      case "airDate":
        data.airDate = after ? localDateToDbDate(after) : null;
        break;
      case "startAt":
        data.startAt = after ? new Date(after) : null;
        break;
      case "endAt":
        data.endAt = after ? new Date(after) : null;
        break;
      case "cost":
        data.cost = after as CostType;
        break;
      case "viewingType":
        data.viewingType = after as ViewingType;
        break;
      case "region":
        data.region = after as RegionAvailability;
        break;
      case "providerName":
        if (after) data.providerName = after;
        break;
      default:
        data[field] = after;
    }
  }
  return data;
}

/** 大会に適用する変更（変更のある項目のみ） */
export function eventUpdateFromChanges(changes: FieldChange<EventDiffField>[]) {
  const data: {
    startDate?: Date;
    endDate?: Date;
    startAt?: Date | null;
    venueName?: string | null;
    broadcastInfoStatus?: BroadcastInfoStatus;
  } = {};
  for (const { field, after } of changes) {
    switch (field) {
      case "startDate":
        if (after) data.startDate = localDateToDbDate(after);
        break;
      case "endDate":
        if (after) data.endDate = localDateToDbDate(after);
        break;
      case "startAt":
        data.startAt = after ? new Date(after) : null;
        break;
      case "venueName":
        data.venueName = after;
        break;
      case "broadcastInfoStatus":
        if (after) data.broadcastInfoStatus = after as BroadcastInfoStatus;
        break;
    }
  }
  return data;
}

/** DB の行（@db.Date を含む）から差分計算用の現在状態を作るためのヘルパー */
export function toCurrentSlotState(row: Omit<CurrentSlotState, "airDate"> & { airDate: Date | null }): CurrentSlotState {
  return { ...row, airDate: row.airDate ? dbDateToLocalDate(row.airDate) : null };
}
