/**
 * トップページの絞り込み条件。状態は URL のクエリに保持する。
 *
 * クエリ（既定値は省略）:
 *   period   = today | week | upcoming（既定: upcoming）
 *   category = ekiden | marathon | track（複数可。繰り返し指定またはカンマ区切り）
 *   medium   = terrestrial | bs | cs | internet | radio（複数可）
 *   free     = 1（無料ネット配信ありのみ）
 *   q        = 大会名の検索語
 *
 * 不正な値は無視し、エラーにはしない（共有された古い URL でも表示できるように）。
 */
import { JST, addDaysToLocalDate, jstDateOf, startOfZonedDay, type LocalDate } from "./datetime";
import {
  BROADCAST_MEDIA,
  CATEGORIES,
  type BroadcastInfoStatus,
  type BroadcastMedium,
  type Category,
  type CostType,
  type SlotVerificationStatus,
} from "./enums";
import { getEventWindow, type EventTimingInput } from "./event-timing";

export const PERIODS = ["today", "week", "upcoming"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Record<Period, string> = {
  today: "今日",
  week: "今週（7日間）",
  upcoming: "この先",
};

export const MAX_QUERY_LENGTH = 100;

export type EventFilters = {
  period: Period;
  /** 空 = すべて */
  categories: Category[];
  /** 空 = すべて */
  media: BroadcastMedium[];
  /** 無料ネット配信ありのみ */
  freeInternet: boolean;
  /** 大会名の検索語（前後空白除去済み。空 = 指定なし） */
  q: string;
};

export const DEFAULT_FILTERS: EventFilters = {
  period: "upcoming",
  categories: [],
  media: [],
  freeInternet: false,
  q: "",
};

/** URL クエリでの値 ⇔ 列挙値 */
export const CATEGORY_PARAM: Record<Category, string> = {
  EKIDEN: "ekiden",
  MARATHON: "marathon",
  TRACK: "track",
};

export const MEDIUM_PARAM: Record<BroadcastMedium, string> = {
  TERRESTRIAL: "terrestrial",
  BS: "bs",
  CS: "cs",
  INTERNET: "internet",
  RADIO: "radio",
};

export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function getAll(input: SearchParamsInput, key: string): string[] {
  const raw =
    input instanceof URLSearchParams
      ? input.getAll(key)
      : (() => {
          const v = input[key];
          if (v === undefined) return [];
          return Array.isArray(v) ? v : [v];
        })();
  return raw
    .flatMap((v) => v.split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function getFirst(input: SearchParamsInput, key: string): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const v = input[key];
  return Array.isArray(v) ? v[0] : v;
}

function pickEnumValues<T extends string>(
  values: string[],
  order: readonly T[],
  toParam: Record<T, string>,
): T[] {
  const wanted = new Set(values);
  // 表示順に並べ、重複を除く
  return order.filter((v) => wanted.has(toParam[v]));
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function parseEventFilters(input: SearchParamsInput): EventFilters {
  const periodRaw = getFirst(input, "period")?.trim().toLowerCase();
  const period = PERIODS.find((p) => p === periodRaw) ?? DEFAULT_FILTERS.period;
  const freeRaw = getFirst(input, "free")?.trim().toLowerCase();
  const q = (getFirst(input, "q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  return {
    period,
    categories: pickEnumValues(getAll(input, "category"), CATEGORIES, CATEGORY_PARAM),
    media: pickEnumValues(getAll(input, "medium"), BROADCAST_MEDIA, MEDIUM_PARAM),
    freeInternet: freeRaw === "1" || freeRaw === "true",
    q,
  };
}

/** 正規化したクエリ（既定値は省略、複数値は繰り返し指定） */
export function toSearchParams(filters: EventFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.period !== DEFAULT_FILTERS.period) sp.set("period", filters.period);
  for (const c of CATEGORIES) {
    if (filters.categories.includes(c)) sp.append("category", CATEGORY_PARAM[c]);
  }
  for (const m of BROADCAST_MEDIA) {
    if (filters.media.includes(m)) sp.append("medium", MEDIUM_PARAM[m]);
  }
  if (filters.freeInternet) sp.set("free", "1");
  if (filters.q) sp.set("q", filters.q);
  return sp;
}

/** "?period=week&category=ekiden" 形式。条件なしなら "" */
export function toQueryString(filters: EventFilters): string {
  const s = toSearchParams(filters).toString();
  return s ? `?${s}` : "";
}

export function hasActiveFilters(filters: EventFilters): boolean {
  return (
    filters.categories.length > 0 || filters.media.length > 0 || filters.freeInternet || filters.q !== ""
  );
}

export type PeriodRange = {
  /** 区間の開始（含む） */
  start: Date;
  /** 区間の終了（含まない）。null = 上限なし */
  end: Date | null;
  /** 日本時間の初日 */
  startDate: LocalDate;
  /** 日本時間の最終日（含む）。null = 上限なし */
  endDate: LocalDate | null;
};

/**
 * 期間の区間（日本時間の日付境界）。
 * - today: 今日 0:00〜翌日 0:00
 * - week: 今日 0:00〜7 日後 0:00（今日を含む 7 日間）
 * - upcoming: 今日 0:00〜（上限なし）
 */
export function getPeriodRange(period: Period, now: Date): PeriodRange {
  const today = jstDateOf(now);
  const start = startOfZonedDay(today, JST);
  switch (period) {
    case "today":
      return { start, end: startOfZonedDay(addDaysToLocalDate(today, 1), JST), startDate: today, endDate: today };
    case "week":
      return {
        start,
        end: startOfZonedDay(addDaysToLocalDate(today, 7), JST),
        startDate: today,
        endDate: addDaysToLocalDate(today, 6),
      };
    case "upcoming":
      return { start, end: null, startDate: today, endDate: null };
  }
}

/** 絞り込みに必要な最小限の大会の形 */
export type FilterableEvent = EventTimingInput & {
  name: string;
  seriesName?: string | null;
  category: Category;
  broadcastInfoStatus: BroadcastInfoStatus;
  broadcasts: ReadonlyArray<{
    medium: BroadcastMedium;
    cost: CostType;
    verificationStatus: SlotVerificationStatus;
  }>;
};

/**
 * 視聴方法の絞り込みで数える放送枠か。
 * 過去大会の参考情報は今年の情報ではないため数えない。
 */
export function isCurrentYearSlot(slot: { verificationStatus: SlotVerificationStatus }): boolean {
  return slot.verificationStatus !== "PAST_REFERENCE";
}

export function matchesFilters(event: FilterableEvent, filters: EventFilters, range: PeriodRange): boolean {
  const window = getEventWindow(event);
  if (window.end.getTime() <= range.start.getTime()) return false;
  if (range.end && window.start.getTime() >= range.end.getTime()) return false;

  if (filters.categories.length > 0 && !filters.categories.includes(event.category)) return false;

  const slots = event.broadcasts.filter(isCurrentYearSlot);
  if (filters.media.length > 0 && !slots.some((s) => filters.media.includes(s.medium))) return false;
  if (filters.freeInternet && !slots.some((s) => s.medium === "INTERNET" && s.cost === "FREE")) {
    return false;
  }

  if (filters.q) {
    const needle = normalizeSearchText(filters.q);
    const haystack = normalizeSearchText(`${event.name} ${event.seriesName ?? ""}`);
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** 絞り込み + 開催日時の昇順（同時刻は大会名順） */
export function filterAndSortEvents<T extends FilterableEvent>(
  events: readonly T[],
  filters: EventFilters,
  now: Date,
): T[] {
  const range = getPeriodRange(filters.period, now);
  return events
    .filter((e) => matchesFilters(e, filters, range))
    .map((e) => ({ e, start: getEventWindow(e).start.getTime() }))
    .sort((a, b) => a.start - b.start || a.e.name.localeCompare(b.e.name, "ja"))
    .map(({ e }) => e);
}
