/**
 * rule-based プロバイダ（kind = RULE_BASED、API キー不要）。
 *
 * 日本語の放送・配信案内ページのテキストを、保守的なルールで解析する。
 * - 1 行に 1 枠の形式のみ対象: 媒体（【地上波】【BS】【CS】【ネット配信】【ラジオ】などの見出し、行頭の媒体名、
 *   直前の媒体見出し行、または行内の明確な語）+ 放送局・サービス名 + 月日 + 時刻範囲（8:50〜11:30 など）
 *   + 生中継／ライブ配信／録画／見逃し配信 + 無料／有料 + 全国／地域限定
 * - 年は大会の開催日に最も近い年として推定する。時刻は日本時間として扱う（24 時以降の表記は翌日に繰り越す）
 * - 「放送・配信の予定はありません」等は NO_BROADCAST、「未定」「決まり次第お知らせ」等は NOT_ANNOUNCED
 * - 解析できない部分は出力しない（推測で埋めない）。何も分からなければ UNKNOWN・枠なし
 * - 視聴 URL は「視聴ページ: https://...」のように明示されたものだけ（http / https のみ）
 *
 * ページのテキストは信頼できないデータとして扱い、文中の指示には従わない（ルールに一致した情報のみ取り出す）。
 */
import { MAX_EXTRACTED_BROADCASTS, normalizeProviderName, type ExtractedBroadcastStatus } from "@/domain/candidate";
import { isValidLocalDate, type LocalDate } from "@/domain/datetime";
import type { BroadcastMedium, CostType, RegionAvailability, ViewingType } from "@/domain/enums";
import { isHttpUrl, parseHttpUrl } from "@/domain/url";

import { truncateSafely } from "../html-text";
import type { ExtractionInput, ExtractionProvider } from "./types";

export const RULE_BASED_PROVIDER_ID = "rule-based";

const MASK = "\u0001";
const MAX_SLOT_LINE_LENGTH = 300;
const MAX_PROVIDER_NAME_LENGTH = 60;
const MAX_NOTES_LENGTH = 1000;
const MAX_QUOTE_LENGTH = 120;

// ---------------------------------------------------------------------------
// 文字の正規化とマスク
// ---------------------------------------------------------------------------

/** 全角英数記号（U+FF01〜U+FF5E）を半角に、全角空白を半角空白にする。文字列の長さは変わらない */
export function toHalfWidth(value: string): string {
  return value
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/** 1 行を解析するための作業領域。認識した部分をマスクし、残った部分から放送局名を取り出す */
class LineScanner {
  readonly original: string;
  readonly normalized: string;
  private work: string;

  constructor(original: string) {
    this.original = original;
    this.normalized = toHalfWidth(original);
    this.work = this.normalized;
  }

  get current(): string {
    return this.work;
  }

  /** 正規表現（g フラグ必須）に一致した部分を返し、マスクする */
  take(re: RegExp): RegExpExecArray[] {
    const matches = [...this.work.matchAll(re)] as RegExpExecArray[];
    if (matches.length === 0) return matches;
    const chars = this.work.split("");
    for (const m of matches) {
      for (let i = m.index; i < m.index + m[0].length; i++) chars[i] = MASK;
    }
    this.work = chars.join("");
    return matches;
  }

  /** 元の行のうち、マスクされていない連続部分（位置順） */
  gaps(): string[] {
    const result: string[] = [];
    let start = -1;
    for (let i = 0; i <= this.work.length; i++) {
      const masked = i === this.work.length || this.work[i] === MASK;
      if (!masked && start < 0) start = i;
      if (masked && start >= 0) {
        result.push(this.original.slice(start, i));
        start = -1;
      }
    }
    return result;
  }

  originalOf(m: RegExpExecArray): string {
    return this.original.slice(m.index, m.index + m[0].length);
  }
}

// ---------------------------------------------------------------------------
// パターン（toHalfWidth 済みの文字列に適用する）
// ---------------------------------------------------------------------------

const DECORATION = String.raw`(?:[■□◆◇●○▼▽▶►・*\-]\s*)?`;

const WEEKDAY_PAREN = String.raw`(?:\s*\(\s*[日月火水木金土](?:曜日?)?(?:\s*[・･,、]?\s*(?:祝日|祝|休|振休))?\s*\))?`;
const DATE_KANJI_RE = new RegExp(
  String.raw`(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日${WEEKDAY_PAREN}(\s*まで)?`,
  "g",
);
const DATE_SLASH_RE = new RegExp(
  String.raw`(?<![\d/.])(?:(\d{4})/)?(\d{1,2})/(\d{1,2})(?![\d/])${WEEKDAY_PAREN}(\s*まで)?`,
  "g",
);
const DATE_ONLY_LINE_RE = new RegExp(
  String.raw`^\s*${DECORATION}[【\[〔《]?\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日${WEEKDAY_PAREN}\s*[】\]〕》]?\s*:?\s*$`,
);

/** 時刻 1 つ分（6 グループ）: 午前/午後, H, MM, H(時), M(分), 半 */
const TIME = String.raw`(?:(午前|午後)\s*)?(?:(\d{1,2}):(\d{2})|(\d{1,2})時(?:\s*(\d{1,2})分|(半))?)`;
const RANGE_SEP = String.raw`\s*(?:〜|~|-|‐|–|—|―|ー|から)\s*`;
const TIME_RANGE_RE = new RegExp(`${TIME}${RANGE_SEP}${TIME}(?:\\s*まで)?`, "g");
const TIME_START_RE = new RegExp(String.raw`${TIME}\s*(?:〜|~|から|より|放送開始|配信開始)(?!\s*\d)`, "g");

const WATCH_URL_RE =
  /(?:視聴|配信)用?(?:ページ|URL|サイト|先|はこちら)\s*(?:は\s*こちら)?\s*[:は]?\s*(https?:\/\/[^\s\u0001"'<>()「」『』、。]+)/g;
const ANY_URL_RE = /https?:\/\/[^\s\u0001"'<>「」『』、。]+/g;

const BRACKET_RE = /[【\[〔《]\s*([^【】\[\]〔〕《》\u0001]{1,20}?)\s*[】\]〕》]/g;
const BARE_MEDIUM_START_RE = new RegExp(
  String.raw`^\s*${DECORATION}(地上波(?:放送)?|BS(?:放送)?|CS(?:放送)?|(?:インターネット|ネット)配信|ラジオ(?:放送)?)(?=[\s:|/、・]|$)\s*[:|/]?`,
  "g",
);
const MEDIUM_HEADING_LINE_RE = new RegExp(
  String.raw`^\s*${DECORATION}[【\[〔《]?\s*([^【】\[\]〔〕《》:\u0001]{1,12}?)\s*[】\]〕》]?\s*:?\s*$`,
);
const LABEL_RE =
  /(?:放送局|配信サービス|サービス|チャンネル|放送日時|配信日時|放送日|配信日|日時|時間|放送|配信|中継|料金|視聴料|放送地域|視聴地域|地域|備考)\s*:/g;
const TOUJITSU_RE = /(?:大会)?当日/g;
const YOTEI_PAREN_RE = /\(\s*予定\s*\)/g;

const LIVE_RE = /生中継|生放送|生配信|ライブ配信|ライブ中継|ライブ|(?<![A-Za-z])(?:LIVE|Live)(?![A-Za-z])/g;
const DELAYED_RE = /録画中継|録画放送|録画|ディレイ放送|ディレイ|時差放送|ダイジェスト放送|ダイジェスト/g;
const ON_DEMAND_RE = /見逃し配信|見逃し|アーカイブ配信|アーカイブ|オンデマンド配信|オンデマンド|(?<![A-Za-z])VOD(?![A-Za-z])/g;
const FREE_RE = /無料|無償/g;
const PAID_RE = /有料|ペイパービュー|(?<![A-Za-z])PPV(?![A-Za-z])|月額|会員限定|プレミアム会員/g;
const NATIONWIDE_RE = /日本全国|全国(?:放送|ネット|配信|中継)?(?:\s*で\s*視聴\s*(?:可能|可|できます)?)?/g;
const REGIONAL_RE =
  /一部地域(?:を除く|のみ|限定)?|地域限定|ローカル(?:放送|局|ネット)?|[^\s\u0001、。,・:()]{1,10}?(?:地区|地方|エリア|県内|都内|府内|道内)(?:のみ|限定|向け)?/g;

const INFER_MEDIUM: ReadonlyArray<readonly [RegExp, BroadcastMedium]> = [
  [/地上波|地上デジタル|地デジ/, "TERRESTRIAL"],
  [/(?<![A-Za-z])BS(?![A-Za-z])/, "BS"],
  [/(?<![A-Za-z])CS(?![A-Za-z])/, "CS"],
  [/(?:インターネット|ネット|ライブ|生|動画|オンライン|見逃し|アーカイブ)配信|ストリーミング|(?:インターネット|ネット)中継/, "INTERNET"],
  [/ラジオ/, "RADIO"],
];

const GENERIC_PROVIDER_RE =
  /^(?:テレビ|TV|放送|配信|中継|生中継|ネット|インターネット|地上波|BS|CS|ラジオ|放送局|配信サービス|未定|調整中|なし|あり|予定|詳細|こちら|視聴方法|お知らせ|その他)$/i;
const NON_PROVIDER_PHRASE_RE = /未定|調整中|決まり次第|お知らせします|ありません|ございません|行いません|しません/;

// 大会全体の状態（空白を除いた半角化済みの文に適用する）
// 「放送・配信」のようにテレビと配信の両方を指す語の直後に否定が続く場合のみ「放送・配信なし」とする
const NEGATION = String.raw`(?:ございません|ありません|行いません|行ないません|おこないません|いたしません|致しません|しません|しておりません|予定しておりません|予定していません|行っておりません|行わない予定です|しない予定です|実施しません|実施いたしません|なし)`;
const CONNECTOR = String.raw`(?:・|、|,|/|&|及び|および|ならびに|や|と)*`;
const TV_NOUN = String.raw`(?:テレビ|TV)?(?:放送|中継)(?:予定)?`;
const NET_NOUN = String.raw`(?:インターネット|ネット|ライブ|オンライン)?配信(?:予定)?`;
const NEG_TAIL = String.raw`(?:等|など)?(?:の)?(?:予定)?(?:は|も)?(?:ともに|共に|いずれも)?(?:一切)?(?:の予定は|は)?${NEGATION}`;
const NO_BROADCAST_RE = new RegExp(
  String.raw`(?:${TV_NOUN}${CONNECTOR}${NET_NOUN}|${NET_NOUN}${CONNECTOR}${TV_NOUN})${NEG_TAIL}`,
);
const NO_BROADCAST_QUALIFIER_RE = /見逃し|アーカイブ|録画|ダイジェスト|有料|海外|一部|再放送|地上波|BS|CS|ラジオ|ハイライト/;
const PENDING_RE =
  /未定|決まり次第|決定次第|確定次第|分かり次第|わかり次第|発表され次第|判明次第|追って(?:お知らせ|ご案内|発表)|後日(?:お知らせ|発表|掲載|ご案内)|改めて(?:お知らせ|ご案内)|調整中|検討中|未発表/;
const BROADCAST_SUBJECT_RE = /放送(?!局)|配信(?!サービス|事業者)|中継|テレビ|TV|地上波|BS|CS|ラジオ/;
const PENDING_QUALIFIER_RE = /見逃し|アーカイブ|ダイジェスト|再放送|ハイライト/;

// ---------------------------------------------------------------------------
// 補助関数
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dayNumber(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 月日（年は任意）を、大会の開催日に最も近い実在の日付にする */
export function resolveMonthDay(
  year: number | null,
  month: number,
  day: number,
  eventStartDate: LocalDate,
): LocalDate | null {
  const make = (y: number) => `${y}-${pad2(month)}-${pad2(day)}`;
  if (year !== null) {
    const d = make(year);
    return isValidLocalDate(d) ? d : null;
  }
  const base = Number(eventStartDate.slice(0, 4));
  let best: LocalDate | null = null;
  let bestDiff = Infinity;
  for (const y of [base - 1, base, base + 1]) {
    const d = make(y);
    if (!isValidLocalDate(d)) continue;
    const diff = Math.abs(dayNumber(d) - dayNumber(eventStartDate));
    if (diff < bestDiff) {
      best = d;
      bestDiff = diff;
    }
  }
  return best;
}

function dateFromMatch(m: RegExpExecArray, eventStartDate: LocalDate): LocalDate | null {
  const year = m[1] ? Number(m[1]) : null;
  return resolveMonthDay(year, Number(m[2]), Number(m[3]), eventStartDate);
}

type ClockTime = { hour: number; minute: number };

/** TIME の 6 グループ（offset から）を時刻にする。24〜29 時の表記も受け付ける */
function timeFromGroups(m: RegExpExecArray, offset: number): ClockTime | null {
  const ampm = m[offset];
  const hourText = m[offset + 1] ?? m[offset + 3];
  const minuteText = m[offset + 2] ?? m[offset + 4] ?? (m[offset + 5] ? "30" : "0");
  if (hourText === undefined) return null;
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (ampm === "午後" && hour < 12) hour += 12;
  if (ampm === "午前" && hour === 12) hour = 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 29 || minute > 59) return null;
  return { hour, minute };
}

function formatClock(t: ClockTime): string {
  return `${pad2(t.hour % 24)}:${pad2(t.minute)}`;
}

/** 媒体を表す見出し語か */
export function classifyMediumLabel(label: string): BroadcastMedium | null {
  const s = toHalfWidth(label).replace(/\s+/g, "");
  if (/^(?:地上波|地上波放送|地上デジタル|地デジ)$/.test(s)) return "TERRESTRIAL";
  if (/^BS(?:放送|デジタル)?$/i.test(s)) return "BS";
  if (/^CS(?:放送)?$/i.test(s)) return "CS";
  if (/^(?:(?:インターネット|ネット|動画|オンライン|ライブ)?配信|(?:インターネット|ネット)(?:中継)?)$/.test(s)) {
    return "INTERNET";
  }
  if (/^ラジオ(?:放送|中継)?$/.test(s)) return "RADIO";
  return null;
}

function inferMedia(text: string): Set<BroadcastMedium> {
  const found = new Set<BroadcastMedium>();
  for (const [re, medium] of INFER_MEDIUM) if (re.test(text)) found.add(medium);
  return found;
}

function cleanProviderCandidate(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t
    .replace(/^[\s・･/／|｜:：、，,\-－–—~〜～※*＊■□◆◇●○▼▽▶►]+/, "")
    .replace(/[\s・･/／|｜:：、，,\-－–—~〜～※*＊]+$/, "");
  t = t.replace(/(?:にて|で)(?:放送|配信|中継)(?:します|いたします|致します|予定)?$/, "");
  t = t.replace(/(?:にて|で|より)$/, "");
  t = t.replace(/[(（]\s*予定\s*[)）]$/, "");
  return t.trim();
}

function isPlausibleProviderName(name: string): boolean {
  if (!name || name.length > MAX_PROVIDER_NAME_LENGTH) return false;
  if (!/\p{L}/u.test(name)) return false;
  if (/^[(（][^)）]*[)）]$/.test(name)) return false;
  if (/[。]/.test(name) || /https?:/i.test(name)) return false;
  if (GENERIC_PROVIDER_RE.test(toHalfWidth(name))) return false;
  if (NON_PROVIDER_PHRASE_RE.test(name)) return false;
  return true;
}

function quote(text: string): string {
  const t = text.trim();
  return `「${t.length > MAX_QUOTE_LENGTH ? `${truncateSafely(t, MAX_QUOTE_LENGTH - 1)}…` : t}」`;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// 行の解析
// ---------------------------------------------------------------------------

export type RuleBasedSlot = {
  medium: BroadcastMedium;
  providerName: string;
  date: LocalDate | null;
  startTime: string | null;
  endTime: string | null;
  cost: CostType;
  viewingType: ViewingType;
  region: RegionAvailability;
  regionNote: string | null;
  note: null;
  watchUrl: string | null;
  infoUrl: string | null;
  evidence: string;
};

type LineContext = { medium: BroadcastMedium | null; date: LocalDate | null };

type LineResult =
  | { kind: "medium-heading"; medium: BroadcastMedium }
  | { kind: "date-heading"; date: LocalDate }
  | { kind: "slot"; slot: RuleBasedSlot; warning: string | null }
  | { kind: "other" };

function parseLine(line: string, ctx: LineContext, input: ExtractionInput): LineResult {
  if (line.length > MAX_SLOT_LINE_LENGTH) return { kind: "other" };
  const sc = new LineScanner(line);
  const eventStart = input.event.startDate;

  // 見出し行（媒体のみ・日付のみ）
  const heading = MEDIUM_HEADING_LINE_RE.exec(sc.normalized);
  if (heading) {
    const medium = classifyMediumLabel(heading[1]);
    if (medium) return { kind: "medium-heading", medium };
  }
  const dateHeading = DATE_ONLY_LINE_RE.exec(sc.normalized);
  if (dateHeading) {
    const date = resolveMonthDay(
      dateHeading[1] ? Number(dateHeading[1]) : null,
      Number(dateHeading[2]),
      Number(dateHeading[3]),
      eventStart,
    );
    if (date) return { kind: "date-heading", date };
  }

  // URL（「視聴ページ: URL」のように明示されたものだけを視聴 URL にする）
  const watchUrls = uniqueBy(
    sc
      .take(WATCH_URL_RE)
      .map((m) => parseHttpUrl(m[1].replace(/[.,;:!?]+$/, ""))?.href ?? null)
      .filter((u): u is string => u !== null),
    (u) => u,
  );
  sc.take(ANY_URL_RE);

  const inferred = inferMedia(sc.current);
  const markerMedia = uniqueBy(
    sc
      .take(BRACKET_RE)
      .map((m) => classifyMediumLabel(m[1]))
      .filter((m): m is BroadcastMedium => m !== null),
    (m) => m,
  );
  const bareMedium = sc.take(BARE_MEDIUM_START_RE).map((m) => classifyMediumLabel(m[1]))[0] ?? null;
  sc.take(LABEL_RE);
  const dateMatches = [...sc.take(DATE_KANJI_RE), ...sc.take(DATE_SLASH_RE)];
  const toujitsu = sc.take(TOUJITSU_RE).length > 0;
  const ranges = sc.take(TIME_RANGE_RE);
  const starts = sc.take(TIME_START_RE);
  const live = sc.take(LIVE_RE).length > 0;
  const delayed = sc.take(DELAYED_RE).length > 0;
  const onDemand = sc.take(ON_DEMAND_RE).length > 0;
  const free = sc.take(FREE_RE).length > 0;
  const paid = sc.take(PAID_RE).length > 0;
  const nationwide = sc.take(NATIONWIDE_RE).length > 0;
  const regionalMatches = sc.take(REGIONAL_RE);
  sc.take(YOTEI_PAREN_RE);

  // --- 媒体 ---
  if (markerMedia.length > 1) return { kind: "other" };
  let medium: BroadcastMedium | null = markerMedia[0] ?? bareMedium;
  if (!medium && ctx.medium && (inferred.size === 0 || inferred.has(ctx.medium))) medium = ctx.medium;
  if (!medium && !ctx.medium && inferred.size === 1) medium = [...inferred][0];
  if (!medium) return { kind: "other" };

  // --- 放送局・サービス名（認識した部分を除いた最初の意味のある部分） ---
  const providerName = sc.gaps().map(cleanProviderCandidate).find(isPlausibleProviderName) ?? null;
  if (!providerName) return { kind: "other" };

  // --- 日付 ---
  const airDates = uniqueBy(
    dateMatches
      .filter((m) => !m[m.length - 1]) // 「〜まで」の日付は放送日ではない
      .map((m) => dateFromMatch(m, eventStart))
      .filter((d): d is LocalDate => d !== null),
    (d) => d,
  );
  if (airDates.length > 1) return { kind: "other" }; // 複数の日付があり、どれが放送日か判断できない
  let date: LocalDate | null = airDates[0] ?? null;
  if (!date && toujitsu && input.event.startDate === input.event.endDate) date = input.event.startDate;
  if (!date && ctx.date) date = ctx.date;

  // --- 時刻（日本時間） ---
  const rangeTimes = uniqueBy(
    ranges
      .map((m) => ({ start: timeFromGroups(m, 1), end: timeFromGroups(m, 7) }))
      .filter((r): r is { start: ClockTime; end: ClockTime } => r.start !== null && r.end !== null),
    (r) => `${r.start.hour}:${r.start.minute}-${r.end.hour}:${r.end.minute}`,
  );
  if (rangeTimes.length > 1) return { kind: "other" }; // 複数の時間帯があり、1 枠として扱えない
  let start: ClockTime | null = rangeTimes[0]?.start ?? null;
  let end: ClockTime | null = rangeTimes[0]?.end ?? null;
  if (!start) {
    const startTimes = uniqueBy(
      starts.map((m) => timeFromGroups(m, 1)).filter((t): t is ClockTime => t !== null),
      (t) => `${t.hour}:${t.minute}`,
    );
    if (startTimes.length > 1) return { kind: "other" };
    start = startTimes[0] ?? null;
  }
  if (start && end && start.hour * 60 + start.minute === end.hour * 60 + end.minute) end = null;
  if (start && end && end.hour >= 24 && end.hour * 60 + end.minute - (start.hour * 60 + start.minute) > 24 * 60) {
    end = null;
  }

  const viewingType: ViewingType = live ? "LIVE" : delayed ? "DELAYED" : onDemand ? "ON_DEMAND" : "UNKNOWN";
  if (!date && !start && viewingType === "UNKNOWN") return { kind: "other" };

  let warning: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (start && date) {
    // 24 時以降の表記（25:30 など）は翌日に繰り越す
    if (start.hour >= 24) date = addDays(date, 1);
    startTime = formatClock(start);
    endTime = end ? formatClock(end) : null;
  } else if (start) {
    warning = `放送日を特定できない時刻の記載があります（時刻は取り込んでいません）: ${quote(line)}`;
  }

  const cost: CostType = free && !paid ? "FREE" : paid && !free ? "PAID" : "UNKNOWN";
  const regional = regionalMatches.length > 0;
  const region: RegionAvailability = nationwide && !regional ? "NATIONWIDE" : regional && !nationwide ? "REGIONAL" : "UNKNOWN";
  const regionNote =
    region === "REGIONAL" ? regionalMatches.map((m) => sc.originalOf(m).trim()).join("、").slice(0, 200) || null : null;

  return {
    kind: "slot",
    warning,
    slot: {
      medium,
      providerName,
      date,
      startTime,
      endTime,
      cost,
      viewingType,
      region,
      regionNote,
      note: null,
      watchUrl: watchUrls.length === 1 ? watchUrls[0] : null,
      infoUrl: isHttpUrl(input.sourceUrl) ? parseHttpUrl(input.sourceUrl)!.href : null,
      evidence: truncateSafely(line.trim(), 300),
    },
  };
}

function splitSentences(line: string): string[] {
  return line
    .split(/(?<=[。！？!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= MAX_SLOT_LINE_LENGTH);
}

/** 「放送・配信の予定はありません」のように、テレビと配信の両方がないと明記された文か */
export function isNoBroadcastSentence(sentence: string): boolean {
  const s = toHalfWidth(sentence).replace(/\s+/g, "");
  const m = NO_BROADCAST_RE.exec(s);
  if (!m) return false;
  // 「見逃し配信・再放送はありません」「地上波での放送・配信はありません」など限定付きの否定は対象外
  const before = s.slice(Math.max(0, m.index - 12), m.index);
  return !NO_BROADCAST_QUALIFIER_RE.test(before) && !NO_BROADCAST_QUALIFIER_RE.test(m[0]);
}

/** 「放送・配信の詳細は決まり次第お知らせします」のように、放送・配信が未定と明記された文か */
export function isPendingSentence(sentence: string): boolean {
  const s = toHalfWidth(sentence).replace(/\s+/g, "");
  const m = PENDING_RE.exec(s);
  if (!m) return false;
  // 放送・配信が主題として未定の語より前に書かれている場合のみ
  const subject = s.slice(0, m.index);
  return BROADCAST_SUBJECT_RE.test(subject) && !PENDING_QUALIFIER_RE.test(s);
}

// ---------------------------------------------------------------------------
// 抽出
// ---------------------------------------------------------------------------

export type RuleBasedExtraction = {
  broadcastStatus: ExtractedBroadcastStatus;
  event: { startDate: null; endDate: null; startTime: null; venueName: null };
  broadcasts: RuleBasedSlot[];
  notes: string | null;
};

export function extractByRules(input: ExtractionInput): RuleBasedExtraction {
  const lines = input.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const slots: RuleBasedSlot[] = [];
  const warnings: string[] = [];
  const noBroadcastSentences: string[] = [];
  const pendingSentences: string[] = [];
  let ctx: LineContext = { medium: null, date: null };

  for (const line of lines) {
    const result = parseLine(line, ctx, input);
    switch (result.kind) {
      case "medium-heading":
        ctx = { ...ctx, medium: result.medium };
        break;
      case "date-heading":
        ctx = { ...ctx, date: result.date };
        break;
      case "slot":
        slots.push(result.slot);
        if (result.warning) warnings.push(result.warning);
        break;
      case "other":
        // 見出しの直後に続く枠の行だけに見出しを適用する（間に別の行があれば見出しの効力を切る）
        ctx = { medium: null, date: null };
        break;
    }
    for (const sentence of splitSentences(line)) {
      if (isNoBroadcastSentence(sentence)) noBroadcastSentences.push(sentence);
      else if (isPendingSentence(sentence)) pendingSentences.push(sentence);
    }
  }

  const unique = uniqueBy(slots, (s) =>
    [s.medium, normalizeProviderName(s.providerName), s.date ?? "-", s.startTime ?? "-", s.endTime ?? "-", s.viewingType].join(
      "|",
    ),
  );
  const broadcasts = unique.slice(0, MAX_EXTRACTED_BROADCASTS);

  const notes: string[] = [];
  let broadcastStatus: ExtractedBroadcastStatus;
  const quotes = (sentences: string[]) => uniqueBy(sentences, (s) => s).slice(0, 3).map(quote).join(" ");
  if (broadcasts.length > 0) {
    broadcastStatus = "CONFIRMED";
    if (noBroadcastSentences.length > 0) {
      notes.push(`放送・配信を行わない旨の記述もあります（要確認）: ${quotes(noBroadcastSentences)}`);
    }
    if (pendingSentences.length > 0) {
      notes.push(`未定・調整中などの記述があります: ${quotes(pendingSentences)}`);
    }
  } else if (noBroadcastSentences.length > 0 && pendingSentences.length === 0) {
    broadcastStatus = "NO_BROADCAST";
    notes.push(`根拠: ${quotes(noBroadcastSentences)}`);
  } else if (pendingSentences.length > 0 && noBroadcastSentences.length === 0) {
    broadcastStatus = "NOT_ANNOUNCED";
    notes.push(`根拠: ${quotes(pendingSentences)}`);
  } else if (noBroadcastSentences.length > 0 && pendingSentences.length > 0) {
    broadcastStatus = "UNKNOWN";
    notes.push(
      `放送・配信なしと未定の両方の記述があるため判断していません: ${quotes([...noBroadcastSentences, ...pendingSentences])}`,
    );
  } else {
    broadcastStatus = "UNKNOWN";
  }
  notes.push(...uniqueBy(warnings, (w) => w).slice(0, 3));
  if (unique.length > MAX_EXTRACTED_BROADCASTS) {
    notes.push(`放送・配信枠が ${MAX_EXTRACTED_BROADCASTS} 件を超えたため、先頭の ${MAX_EXTRACTED_BROADCASTS} 件のみ出力しています`);
  }

  const joined = notes.join("\n").trim();
  return {
    broadcastStatus,
    event: { startDate: null, endDate: null, startTime: null, venueName: null },
    broadcasts,
    notes: joined ? truncateSafely(joined, MAX_NOTES_LENGTH) : null,
  };
}

export function createRuleBasedProvider(): ExtractionProvider {
  return {
    id: RULE_BASED_PROVIDER_ID,
    kind: "RULE_BASED",
    description: "ルールベース抽出（API キー不要）",
    fixtureOnly: false,
    async extract(input) {
      return extractByRules(input);
    },
  };
}
