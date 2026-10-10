/**
 * 管理画面の表示用ヘルパー（日時は日本時間で整形し、enum は日本語ラベルにする）。
 */
import {
  JST,
  dbDateToLocalDate,
  formatInstantJstNumeric,
  formatLocalDateJa,
  formatLocalDateRangeJa,
  isValidLocalDate,
  toZonedParts,
} from "@/domain/datetime";
import type { EventDiffField, SlotDiffField } from "@/domain/diff";
import {
  BROADCAST_INFO_STATUS_LABELS,
  COST_TYPE_LABELS,
  REGION_AVAILABILITY_LABELS,
  VIEWING_TYPE_LABELS,
} from "@/domain/labels";

export const UNSET_LABEL = "（未設定）";

function label(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

/** "2026/10/12 07:50（日本時間）"。null は「—」 */
export function formatAdminInstant(value: Date | null | undefined): string {
  return value ? `${formatInstantJstNumeric(value)}（日本時間）` : "—";
}

export function formatAdminDate(value: Date | null | undefined): string {
  return value ? formatLocalDateJa(dbDateToLocalDate(value), { withYear: true }) : "—";
}

/** 大会の開催日（現地日付）。日本以外のタイムゾーンは併記する */
export function formatEventDates(startDate: Date, endDate: Date, timezone: string): string {
  const range = formatLocalDateRangeJa(dbDateToLocalDate(startDate), dbDateToLocalDate(endDate), { withYear: true });
  return timezone === JST ? range : `${range}（現地 ${timezone}）`;
}

/** 瞬間を、指定タイムゾーンの "YYYY/MM/DD HH:MM" で表す */
export function formatZonedNumeric(instant: Date, timeZone: string): string {
  const { date, time } = toZonedParts(instant, timeZone);
  return `${date.replaceAll("-", "/")} ${time}`;
}

export const EVENT_FIELD_LABELS: Record<EventDiffField, string> = {
  startDate: "開始日（現地）",
  endDate: "終了日（現地）",
  startAt: "競技開始日時",
  venueName: "会場",
  broadcastInfoStatus: "放送情報の状態",
};

export const SLOT_FIELD_LABELS: Record<SlotDiffField, string> = {
  providerName: "局・サービス名",
  airDate: "放送日（日本時間）",
  startAt: "開始（日本時間）",
  endAt: "終了（日本時間）",
  cost: "料金",
  viewingType: "視聴形態",
  region: "視聴地域",
  regionNote: "視聴地域の補足",
  note: "補足",
  watchUrl: "視聴 URL",
  infoUrl: "案内 URL",
};

function formatIsoInstant(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : formatInstantJstNumeric(d);
}

function formatLocalDateValue(value: string): string {
  return isValidLocalDate(value) ? formatLocalDateJa(value, { withYear: true }) : value;
}

/** 差分の値（大会の項目）を表示用に整形する */
export function formatEventDiffValue(field: EventDiffField, value: string | null, eventTimezone: string): string {
  if (value === null) return UNSET_LABEL;
  switch (field) {
    case "startDate":
    case "endDate":
      return formatLocalDateValue(value);
    case "startAt": {
      const jst = `${formatIsoInstant(value)}（日本時間）`;
      const d = new Date(value);
      if (eventTimezone === JST || Number.isNaN(d.getTime())) return jst;
      return `${jst} / 現地 ${formatZonedNumeric(d, eventTimezone)}`;
    }
    case "broadcastInfoStatus":
      return label(BROADCAST_INFO_STATUS_LABELS, value);
    case "venueName":
      return value;
  }
}

/** 差分の値（放送枠の項目）を表示用に整形する */
export function formatSlotDiffValue(field: SlotDiffField, value: string | null): string {
  if (value === null) return UNSET_LABEL;
  switch (field) {
    case "airDate":
      return formatLocalDateValue(value);
    case "startAt":
    case "endAt":
      return formatIsoInstant(value);
    case "cost":
      return label(COST_TYPE_LABELS, value);
    case "viewingType":
      return label(VIEWING_TYPE_LABELS, value);
    case "region":
      return label(REGION_AVAILABILITY_LABELS, value);
    default:
      return value;
  }
}

/** 抽出結果の broadcastStatus（ページの記載内容）の説明 */
export const EXTRACTED_BROADCAST_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "放送・配信予定の記載あり",
  NOT_ANNOUNCED: "未発表と記載",
  NO_BROADCAST: "放送・配信なしと記載",
  UNKNOWN: "ページから判断できない（「放送・配信なし」という意味ではありません）",
};

/** 保存済みの差分スナップショット（Json）から hasChanges を読む。読めなければ null */
export function snapshotHasChanges(diff: unknown): boolean | null {
  if (typeof diff === "object" && diff !== null && "hasChanges" in diff) {
    const value = (diff as { hasChanges: unknown }).hasChanges;
    return typeof value === "boolean" ? value : null;
  }
  return null;
}
