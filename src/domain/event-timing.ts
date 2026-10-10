/**
 * 大会・放送枠の日時の解釈と表示。
 *
 * - 一覧・絞り込みは日本時間（Asia/Tokyo）を基準にする
 * - 開始時刻が不明な場合に 0:00 などの仮時刻を表示しない
 * - 海外大会で開始時刻が不明な場合、日本時間の日付は確定できないため現地日付を明示する
 */
import {
  JST,
  addDaysToLocalDate,
  formatLocalDateJa,
  formatLocalDateRangeJa,
  formatTimeJa,
  startOfZonedDay,
  toZonedParts,
  type LocalDate,
  type LocalTime,
} from "./datetime";

export type EventTimingInput = {
  /** 開催地の現地日付（初日） */
  startDate: LocalDate;
  /** 開催地の現地日付（最終日） */
  endDate: LocalDate;
  /** 競技開始の瞬間（不明なら null） */
  startAt: Date | null;
  /** 開催地の IANA タイムゾーン */
  timezone: string;
};

export type EventTiming = {
  timezone: string;
  /** 開催地が日本時間か */
  isJapanTime: boolean;
  isMultiDay: boolean;
  localStartDate: LocalDate;
  localEndDate: LocalDate;
  startTimeKnown: boolean;
  /** 日本時間の開始日時（開始時刻が判明している場合のみ） */
  jstStart: { date: LocalDate; time: LocalTime } | null;
  /** 現地の開始日時（開始時刻が判明している場合のみ） */
  localStart: { date: LocalDate; time: LocalTime } | null;
  /** 日本時間の開始日が現地の開始日と異なる（日付をまたぐ） */
  jstDateDiffersFromLocal: boolean;
  /**
   * 一覧で主に表示する日付。日本時間で確定できるなら日本時間、
   * できない（海外かつ開始時刻不明）なら現地日付。
   */
  primaryDate: LocalDate;
  primaryDateBasis: "JST" | "LOCAL";
};

export function describeEventTiming(input: EventTimingInput): EventTiming {
  const isJapanTime = input.timezone === JST;
  const isMultiDay = input.startDate !== input.endDate;
  const jstStart = input.startAt ? toZonedParts(input.startAt, JST) : null;
  const localStart = input.startAt ? toZonedParts(input.startAt, input.timezone) : null;
  const jstDateDiffersFromLocal = Boolean(jstStart && localStart && jstStart.date !== localStart.date);

  let primaryDate: LocalDate;
  let primaryDateBasis: "JST" | "LOCAL";
  if (jstStart) {
    primaryDate = jstStart.date;
    primaryDateBasis = "JST";
  } else {
    primaryDate = input.startDate;
    primaryDateBasis = isJapanTime ? "JST" : "LOCAL";
  }

  return {
    timezone: input.timezone,
    isJapanTime,
    isMultiDay,
    localStartDate: input.startDate,
    localEndDate: input.endDate,
    startTimeKnown: input.startAt !== null,
    jstStart,
    localStart,
    jstDateDiffersFromLocal,
    primaryDate,
    primaryDateBasis,
  };
}

/**
 * 一覧の期間絞り込み・並び順に使う区間 [start, end)（UTC の瞬間）。
 * - start: 競技開始の瞬間。不明なら開催地の初日 0 時
 * - end: 開催地の最終日の翌日 0 時
 * 開始時刻不明の海外大会は、現地日付に対応する日本時間の 2 日間にまたがり得る。
 */
export function getEventWindow(input: EventTimingInput): { start: Date; end: Date } {
  const start = input.startAt ?? startOfZonedDay(input.startDate, input.timezone);
  const endOfLastDay = startOfZonedDay(addDaysToLocalDate(input.endDate, 1), input.timezone);
  const end = endOfLastDay.getTime() > start.getTime() ? endOfLastDay : new Date(start.getTime() + 1);
  return { start, end };
}

export type EventScheduleLabels = {
  /** 主たる日付の表示。例: "10月12日（月）"、"10月20日（火）〜10月22日（木）" */
  dateLabel: string;
  /** dateLabel の基準。"日本時間" または "現地日付" */
  dateBasisLabel: "日本時間" | "現地日付";
  /** 開始時刻（日本時間）。不明なら null（0:00 などは表示しない） */
  startTimeLabel: string | null;
  /** 開始時刻が不明な場合の注記 */
  startTimeUnknownLabel: string | null;
  /** 海外大会の現地日時の補足。例: "現地 10月17日（土）20:00" */
  localLabel: string | null;
};

/**
 * 大会の開催日時の表示文字列を作る。
 * 年は withYear 指定時、または日付範囲が年をまたぐ場合に付く。
 */
export function formatEventSchedule(
  timing: EventTiming,
  opts: { withYear?: boolean } = {},
): EventScheduleLabels {
  const withYear = opts.withYear ?? false;

  if (timing.isJapanTime) {
    return {
      dateLabel: formatLocalDateRangeJa(timing.localStartDate, timing.localEndDate, { withYear }),
      dateBasisLabel: "日本時間",
      startTimeLabel: timing.jstStart ? formatTimeJa(timing.jstStart.time) : null,
      startTimeUnknownLabel: timing.startTimeKnown ? null : "開始時刻未定",
      localLabel: null,
    };
  }

  const localRange = formatLocalDateRangeJa(timing.localStartDate, timing.localEndDate, { withYear });

  if (timing.jstStart && timing.localStart) {
    const localStartLabel = `${formatLocalDateJa(timing.localStart.date, { withYear })}${formatTimeJa(timing.localStart.time)}`;
    return {
      dateLabel: formatLocalDateJa(timing.jstStart.date, { withYear }),
      dateBasisLabel: "日本時間",
      startTimeLabel: formatTimeJa(timing.jstStart.time),
      startTimeUnknownLabel: null,
      localLabel: timing.isMultiDay
        ? `現地日程 ${localRange}（初日 ${localStartLabel} 開始）`
        : `現地 ${localStartLabel}`,
    };
  }

  return {
    dateLabel: localRange,
    dateBasisLabel: "現地日付",
    startTimeLabel: null,
    startTimeUnknownLabel: "開始時刻未定（日本時間の日付は変わる場合があります）",
    localLabel: null,
  };
}

export type BroadcastTimingInput = {
  /** 日本時間の放送日（時刻不明でも日付が分かる場合） */
  airDate: LocalDate | null;
  startAt: Date | null;
  endAt: Date | null;
};

/**
 * 放送・配信枠の日時表示（日本時間）。
 * 例: "10月12日（月）7:50〜14:00"、"10月12日（月）時刻未定"、"日時未定"
 */
export function formatBroadcastTiming(
  input: BroadcastTimingInput,
  opts: { withYear?: boolean } = {},
): string {
  if (input.startAt) {
    const start = toZonedParts(input.startAt, JST);
    const startLabel = `${formatLocalDateJa(start.date, opts)}${formatTimeJa(start.time)}`;
    if (!input.endAt) return `${startLabel}〜`;
    const end = toZonedParts(input.endAt, JST);
    const endLabel =
      end.date === start.date
        ? formatTimeJa(end.time)
        : `${formatLocalDateJa(end.date, opts)}${formatTimeJa(end.time)}`;
    return `${startLabel}〜${endLabel}`;
  }
  if (input.airDate) {
    return `${formatLocalDateJa(input.airDate, opts)}時刻未定`;
  }
  return "日時未定";
}

/** 放送・配信枠の日本時間の日付（並び替え・表示用）。不明なら null */
export function broadcastJstDate(input: BroadcastTimingInput): LocalDate | null {
  if (input.startAt) return toZonedParts(input.startAt, JST).date;
  return input.airDate;
}
