/**
 * 公開ページの表示用の文字列を作る小さな関数群（純粋関数。サーバー・クライアントの両方で使える）。
 * 日時の解釈そのものはドメイン層（src/domain/datetime.ts, event-timing.ts）に任せ、
 * ここでは画面の文言の組み立てだけを行う。
 */
import {
  JST,
  formatInstantJst,
  formatLocalDateJa,
  formatLocalDateRangeJa,
  jstDateOf,
  shouldShowYear,
  type LocalDate,
} from "@/domain/datetime";
import {
  broadcastJstDate,
  describeEventTiming,
  formatEventSchedule,
  type EventScheduleLabels,
  type EventTiming,
} from "@/domain/event-timing";
import type { PeriodRange } from "@/domain/filters";
import { REGION_AVAILABILITY_LABELS } from "@/domain/labels";
import type { PublicBroadcast, PublicEventSummary } from "@/domain/types";

export type EventScheduleView = {
  timing: EventTiming;
  labels: EventScheduleLabels;
  withYear: boolean;
};

/**
 * 大会の開催日時の表示。年は基準日（今）と年が異なる場合、または forceYear 指定時に付ける。
 */
export function buildEventScheduleView(
  event: Pick<PublicEventSummary, "startDate" | "endDate" | "startAt" | "timezone">,
  now: Date,
  opts: { forceYear?: boolean } = {},
): EventScheduleView {
  const timing = describeEventTiming(event);
  const withYear =
    opts.forceYear === true || shouldShowYear(timing.primaryDate, now) || shouldShowYear(event.endDate, now);
  return { timing, labels: formatEventSchedule(timing, { withYear }), withYear };
}

/** 放送枠の日付に年を付けるか */
export function broadcastNeedsYear(slot: PublicBroadcast, fallbackDate: LocalDate, now: Date): boolean {
  return shouldShowYear(broadcastJstDate(slot) ?? fallbackDate, now);
}

/** 人が確認した日時の表示（日本時間）。例: "10月8日（木）10:00" */
export function formatCheckedAt(instant: Date, now: Date, opts: { forceYear?: boolean } = {}): string {
  const withYear = opts.forceYear === true || shouldShowYear(jstDateOf(instant), now);
  return formatInstantJst(instant, { withYear });
}

/** 期間の実際の日付範囲（日本時間）。例: "10月10日（土）〜10月16日（金）"、"10月10日（土）以降" */
export function formatPeriodRange(range: PeriodRange, now: Date): string {
  const withYear = shouldShowYear(range.startDate, now) || (range.endDate ? shouldShowYear(range.endDate, now) : false);
  if (range.endDate === null) return `${formatLocalDateJa(range.startDate, { withYear })}以降`;
  return formatLocalDateRangeJa(range.startDate, range.endDate, { withYear });
}

/** 視聴地域の表示。地域限定なら詳細（regionNote）を併記する */
export function formatRegion(slot: Pick<PublicBroadcast, "region" | "regionNote">): string {
  const label = REGION_AVAILABILITY_LABELS[slot.region];
  const note = slot.regionNote?.trim();
  if (slot.region === "REGIONAL" && note) return `${label}（${note}）`;
  return label;
}

let regionNames: Intl.DisplayNames | null | undefined;

/** ISO 3166-1 alpha-2 → 日本語の国・地域名。解釈できなければコードをそのまま返す */
export function countryNameJa(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["ja"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** 開催地が日本以外か（国コードまたはタイムゾーンで判定） */
export function isOverseas(event: Pick<PublicEventSummary, "countryCode" | "timezone">): boolean {
  return event.countryCode.toUpperCase() !== "JP" || event.timezone !== JST;
}

/** 過去大会の参考情報の枠と、今年の枠を分ける */
export function splitSlots(slots: readonly PublicBroadcast[]): {
  current: PublicBroadcast[];
  pastReference: PublicBroadcast[];
} {
  const current: PublicBroadcast[] = [];
  const pastReference: PublicBroadcast[] = [];
  for (const slot of slots) {
    (slot.verificationStatus === "PAST_REFERENCE" ? pastReference : current).push(slot);
  }
  return { current, pastReference };
}

/** 外部リンクのアクセシブルネームに付ける補足 */
export const EXTERNAL_LINK_SUFFIX = "（外部サイト・新しいタブで開きます）";
