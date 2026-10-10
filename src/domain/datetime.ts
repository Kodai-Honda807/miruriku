/**
 * 日付・時刻のユーティリティ。
 *
 * 用語:
 * - LocalDate: "YYYY-MM-DD"。どのタイムゾーンの日付かは文脈で決まる（大会は開催地、放送は日本時間）。
 * - LocalTime: "HH:MM"（24 時間表記）。
 * - instant: 確定した瞬間。Date（UTC）で扱う。
 *
 * DB の @db.Date 列は Prisma では UTC 0 時の Date として読み書きされるため、
 * 変換は必ず dbDateToLocalDate / localDateToDbDate を通すこと。
 */
import { TZDate } from "@date-fns/tz";

export const JST = "Asia/Tokyo";

export type LocalDate = string;
export type LocalTime = string;

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = LOCAL_DATE_RE.exec(date);
  if (!m) {
    throw new RangeError(`不正な日付です: ${date}`);
  }
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseLocalTime(time: LocalTime): { hour: number; minute: number } {
  const m = LOCAL_TIME_RE.exec(time);
  if (!m) {
    throw new RangeError(`不正な時刻です: ${time}`);
  }
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 実在する暦日の "YYYY-MM-DD" か */
export function isValidLocalDate(value: string): boolean {
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** "HH:MM"（00:00〜23:59）か */
export function isValidLocalTime(value: string): boolean {
  return LOCAL_TIME_RE.test(value);
}

const IANA_ZONE_RE = /^(?:UTC|[A-Z][A-Za-z_]*(?:\/[A-Z][A-Za-z0-9_+-]*)+)$/;

/**
 * 正式な表記の IANA タイムゾーン名（"Asia/Tokyo" などの「地域/都市」形式、または "UTC"）か。
 * ICU が受け付ける "JST" や "+09:00"、大小文字だけが違う "asia/tokyo" / "Asia/TOKYO" は、
 * 日本時間かどうかの判定（=== "Asia/Tokyo"）と食い違うため拒否する。
 * "America/Argentina/Buenos_Aires" のような別名（ICU が別の正規名に置き換えるもの）は受け付ける。
 */
export function isValidTimeZone(value: string): boolean {
  if (!value || !IANA_ZONE_RE.test(value)) return false;
  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
  const differsOnlyInCase = resolved !== value && resolved.toLowerCase() === value.toLowerCase();
  return !differsOnlyInCase;
}

/** DB の @db.Date 値 → LocalDate */
export function dbDateToLocalDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

/** LocalDate → DB の @db.Date に保存する値 */
export function localDateToDbDate(date: LocalDate): Date {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDaysToLocalDate(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 曜日（0 = 日曜） */
export function weekdayOfLocalDate(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export type ZonedParts = {
  date: LocalDate;
  time: LocalTime;
};

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

/** 瞬間を指定タイムゾーンの日付・時刻に変換する */
export function toZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** 日本時間の日付 */
export function jstDateOf(instant: Date): LocalDate {
  return toZonedParts(instant, JST).date;
}

/**
 * 指定タイムゾーンの現地日付・時刻 → 瞬間（UTC）。
 * 夏時間の切り替えで存在しない時刻は前方にずらして解釈する。
 */
export function zonedToUtc(date: LocalDate, time: LocalTime, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const { hour, minute } = parseLocalTime(time);
  return new Date(new TZDate(year, month - 1, day, hour, minute, 0, timeZone).getTime());
}

/** 指定タイムゾーンでの、その日の 0 時の瞬間 */
export function startOfZonedDay(date: LocalDate, timeZone: string): Date {
  return zonedToUtc(date, "00:00", timeZone);
}

// ---------------------------------------------------------------------------
// 日本語表記
// ---------------------------------------------------------------------------

/** "10月12日（月）"。withYear で "2026年10月12日（月）" */
export function formatLocalDateJa(date: LocalDate, opts: { withYear?: boolean } = {}): string {
  const { year, month, day } = parseLocalDate(date);
  const wd = WEEKDAYS_JA[weekdayOfLocalDate(date)];
  const md = `${month}月${day}日（${wd}）`;
  return opts.withYear ? `${year}年${md}` : md;
}

/** "07:50" → "7:50" */
export function formatTimeJa(time: LocalTime): string {
  const { hour, minute } = parseLocalTime(time);
  return `${hour}:${pad2(minute)}`;
}

/**
 * 日付範囲。同日なら単日表記、年をまたぐ・withYear 指定時は年を付ける。
 * 例: "10月20日（火）〜10月22日（木）"
 */
export function formatLocalDateRangeJa(
  start: LocalDate,
  end: LocalDate,
  opts: { withYear?: boolean } = {},
): string {
  if (start === end) return formatLocalDateJa(start, opts);
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  const withYear = opts.withYear || crossesYear;
  return `${formatLocalDateJa(start, { withYear })}〜${formatLocalDateJa(end, { withYear })}`;
}

/** 瞬間を日本時間で表記。"10月12日（月）7:50" */
export function formatInstantJst(instant: Date, opts: { withYear?: boolean } = {}): string {
  const { date, time } = toZonedParts(instant, JST);
  return `${formatLocalDateJa(date, opts)}${formatTimeJa(time)}`;
}

/** 日本時間の時刻のみ。"7:50" */
export function formatJstTime(instant: Date): string {
  return formatTimeJa(toZonedParts(instant, JST).time);
}

/** 管理画面などで使う日時表記。"2026/10/12 07:50"（日本時間） */
export function formatInstantJstNumeric(instant: Date): string {
  const { date, time } = toZonedParts(instant, JST);
  return `${date.replaceAll("-", "/")} ${time}`;
}

/** 表示中の基準日と年が異なる場合に年を表示するための判定 */
export function shouldShowYear(date: LocalDate, now: Date): boolean {
  return date.slice(0, 4) !== jstDateOf(now).slice(0, 4);
}
