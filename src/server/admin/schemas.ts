/**
 * 管理画面フォームのサーバー側入力検証（Zod）と、DB に保存する値への変換。
 *
 * - 入力は FormData を formDataToRecord() で「name → 文字列」にしたもの。未送信の項目は undefined。
 * - 画面の入力欄（required など）は補助にすぎず、ここでの検証が正。
 * - 日時の解釈: 大会・セッションは開催地の現地時刻（Event.timezone）、放送・配信枠は日本時間。
 */
import { z } from "zod";

import {
  JST,
  addDaysToLocalDate,
  isValidLocalDate,
  isValidLocalTime,
  isValidTimeZone,
  localDateToDbDate,
  zonedToUtc,
} from "@/domain/datetime";
import {
  BROADCAST_INFO_STATUSES,
  BROADCAST_MEDIA,
  CATEGORIES,
  COST_TYPES,
  PUBLICATION_STATUSES,
  REGION_AVAILABILITIES,
  SLOT_VERIFICATION_STATUSES,
  SOURCE_KINDS,
  VIEWING_TYPES,
} from "@/domain/enums";
import { httpUrlSchema } from "@/domain/url";

// ---------------------------------------------------------------------------
// 部品
// ---------------------------------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 100;

/** cuid や seed の固定 ID（英数字・ハイフン・アンダースコア） */
export const adminIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, { error: "ID が不正です" });

/** 未送信（undefined）は空文字として扱い、前後の空白を除く */
const text = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim());

function requiredText(label: string, max: number) {
  return text.pipe(
    z
      .string()
      .min(1, { error: `${label}を入力してください` })
      .max(max, { error: `${label}は ${max} 文字以内で入力してください` }),
  );
}

function optionalText(label: string, max: number) {
  return text
    .pipe(z.string().max(max, { error: `${label}は ${max} 文字以内で入力してください` }))
    .transform((v) => (v === "" ? null : v));
}

function enumField<const T extends readonly [string, ...string[]]>(values: T, message: string) {
  return text.pipe(z.enum(values, { error: message }));
}

/** チェックボックス（チェックなしでは項目自体が送信されない） */
const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

const slugField = (label: string) =>
  requiredText(label, SLUG_MAX_LENGTH).pipe(
    z.string().regex(SLUG_PATTERN, {
      error: `${label}は半角英小文字・数字と、単語の区切りのハイフンだけで入力してください（例: city-marathon-2026）`,
    }),
  );

const localDateField = (label: string) =>
  text
    .pipe(z.string().min(1, { error: `${label}を入力してください` }))
    .pipe(z.string().refine(isValidLocalDate, { error: `${label}は YYYY-MM-DD 形式の実在する日付で入力してください` }));

const optionalLocalDateField = (label: string) =>
  text
    .pipe(
      z
        .string()
        .refine((v) => v === "" || isValidLocalDate(v), {
          error: `${label}は YYYY-MM-DD 形式の実在する日付で入力してください`,
        }),
    )
    .transform((v) => (v === "" ? null : v));

const optionalLocalTimeField = (label: string) =>
  text
    .pipe(
      z.string().refine((v) => v === "" || isValidLocalTime(v), {
        error: `${label}は HH:MM（24 時間表記、例: 07:50）で入力してください`,
      }),
    )
    .transform((v) => (v === "" ? null : v));

/** 任意の http(s) URL。空欄は null。javascript: や data: などは拒否する（src/domain/url.ts） */
const optionalUrlField = text.transform((v) => (v === "" ? null : v)).pipe(httpUrlSchema.nullable());

/**
 * 「地域/都市」形式（例: Asia/Tokyo、America/Argentina/Buenos_Aires）または UTC。
 * ICU は "JST" や "+09:00" も受け付けるが、IANA 名ではなく Asia/Tokyo との比較もできないため拒否する。
 */
const TIME_ZONE_NAME = /^(?:UTC|[A-Za-z][A-Za-z_-]*(?:\/[A-Za-z0-9_+-]+)+)$/i;

/** ICU が解釈できる名前なら正式な表記（例: "asia/tokyo" → "Asia/Tokyo"）に揃える。解釈できなければそのまま */
function canonicalTimeZone(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return value;
  }
}

/**
 * IANA タイムゾーン名。大文字小文字の揺れは正式な表記に揃えてから、
 * ドメイン層の isValidTimeZone（Asia/Tokyo との比較に使える正式表記か）で検証する。
 */
export const timeZoneField = requiredText("タイムゾーン", 64).pipe(
  z
    .string()
    .refine((v) => TIME_ZONE_NAME.test(v), {
      error: "タイムゾーンは IANA の名前（例: Asia/Tokyo、Europe/Berlin）で入力してください",
    })
    .transform(canonicalTimeZone)
    .refine((v) => isValidTimeZone(v), {
      error: "タイムゾーンは IANA の名前（例: Asia/Tokyo、Europe/Berlin）で入力してください",
    }),
);

/**
 * クロスフィールド検証は、他の項目にエラーがあっても常に実行する（すべてのエラーを一度に表示するため）。
 * その場合、値は検証前の文字列や undefined のこともあるので、必ず str() で文字列として読む。
 */
const ALWAYS = { when: () => true };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** HH:MM 同士の比較（文字列比較で正しく順序づけられる） */
function isTimeOnOrBefore(a: string, b: string): boolean {
  return a <= b;
}

// ---------------------------------------------------------------------------
// 大会
// ---------------------------------------------------------------------------

export const eventFormSchema = z
  .object({
    seriesMode: z
      .string()
      .optional()
      .transform((v): "existing" | "new" => (v === "new" ? "new" : "existing")),
    seriesId: text,
    newSeriesName: text.pipe(z.string().max(200, { error: "シリーズ名は 200 文字以内で入力してください" })),
    newSeriesSlug: text,
    name: requiredText("大会名", 200),
    slug: slugField("slug"),
    editionLabel: optionalText("回", 50),
    seasonYear: text
      .pipe(z.string().regex(/^\d{4}$/, { error: "開催年は 4 桁の西暦で入力してください" }))
      .transform(Number)
      .pipe(
        z
          .number()
          .int()
          .min(1900, { error: "開催年は 1900〜2100 の範囲で入力してください" })
          .max(2100, { error: "開催年は 1900〜2100 の範囲で入力してください" }),
      ),
    category: enumField(CATEGORIES, "カテゴリを選択してください"),
    description: optionalText("説明", 2000),
    venueName: optionalText("会場", 200),
    venueRegion: optionalText("地域", 200),
    countryCode: text
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{2}$/, { error: "国コードは 2 文字の英字（例: JP）で入力してください" })),
    timezone: timeZoneField,
    startDate: localDateField("開始日"),
    endDate: localDateField("終了日"),
    startTime: optionalLocalTimeField("競技開始時刻"),
    officialUrl: optionalUrlField,
    broadcastInfoStatus: enumField(BROADCAST_INFO_STATUSES, "放送情報の状態を選択してください"),
    broadcastNote: optionalText("放送情報の補足", 1000),
    markBroadcastChecked: checkbox,
  })
  .superRefine((v, ctx) => {
    const startDate = str(v.startDate);
    const endDate = str(v.endDate);
    if (isValidLocalDate(startDate) && isValidLocalDate(endDate) && endDate < startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "終了日は開始日と同じか、それより後の日付にしてください" });
    }
    if (v.seriesMode !== "new") {
      const seriesId = str(v.seriesId);
      if (!seriesId) {
        ctx.addIssue({ code: "custom", path: ["seriesId"], message: "シリーズを選択してください" });
      } else if (!adminIdSchema.safeParse(seriesId).success) {
        ctx.addIssue({ code: "custom", path: ["seriesId"], message: "シリーズの指定が不正です" });
      }
    } else {
      const newSeriesSlug = str(v.newSeriesSlug);
      if (!str(v.newSeriesName)) {
        ctx.addIssue({ code: "custom", path: ["newSeriesName"], message: "新しいシリーズ名を入力してください" });
      }
      if (!newSeriesSlug) {
        ctx.addIssue({ code: "custom", path: ["newSeriesSlug"], message: "新しいシリーズの slug を入力してください" });
      } else if (newSeriesSlug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(newSeriesSlug)) {
        ctx.addIssue({
          code: "custom",
          path: ["newSeriesSlug"],
          message: "シリーズの slug は半角英小文字・数字と、単語の区切りのハイフンだけで入力してください",
        });
      }
    }
  }, ALWAYS);

export type EventFormValues = z.output<typeof eventFormSchema>;

/** 大会フォームの値 → Event に保存する値（シリーズ・公開状態・確認日時は呼び出し側で決める） */
export function eventFormToData(v: EventFormValues) {
  return {
    name: v.name,
    slug: v.slug,
    editionLabel: v.editionLabel,
    seasonYear: v.seasonYear,
    category: v.category,
    description: v.description,
    venueName: v.venueName,
    venueRegion: v.venueRegion,
    countryCode: v.countryCode,
    timezone: v.timezone,
    startDate: localDateToDbDate(v.startDate),
    endDate: localDateToDbDate(v.endDate),
    // 競技開始時刻は開催地の現地時刻。空欄は「不明」（0:00 などの仮の時刻にしない）
    startAt: v.startTime ? zonedToUtc(v.startDate, v.startTime, v.timezone) : null,
    officialUrl: v.officialUrl,
    broadcastInfoStatus: v.broadcastInfoStatus,
    broadcastNote: v.broadcastNote,
  };
}

// ---------------------------------------------------------------------------
// 放送・配信枠（日時はすべて日本時間）
// ---------------------------------------------------------------------------

export const slotFormSchema = z
  .object({
    medium: enumField(BROADCAST_MEDIA, "媒体を選択してください"),
    providerName: requiredText("局・サービス名", 100),
    airDate: optionalLocalDateField("放送日"),
    startTime: optionalLocalTimeField("開始時刻"),
    endTime: optionalLocalTimeField("終了時刻"),
    cost: enumField(COST_TYPES, "料金を選択してください"),
    viewingType: enumField(VIEWING_TYPES, "視聴形態を選択してください"),
    region: enumField(REGION_AVAILABILITIES, "視聴地域を選択してください"),
    regionNote: optionalText("視聴地域の補足", 200),
    note: optionalText("補足説明", 500),
    watchUrl: optionalUrlField,
    infoUrl: optionalUrlField,
    verificationStatus: enumField(SLOT_VERIFICATION_STATUSES, "検証状態を選択してください"),
    status: enumField(PUBLICATION_STATUSES, "公開状態を選択してください"),
    sourceId: text.transform((v) => (v === "" ? null : v)),
    markVerified: checkbox,
  })
  .superRefine((v, ctx) => {
    const airDate = str(v.airDate);
    const startTime = str(v.startTime);
    const endTime = str(v.endTime);
    if ((startTime || endTime) && !airDate) {
      ctx.addIssue({
        code: "custom",
        path: ["airDate"],
        message: "時刻を入力する場合は放送日（日本時間）も入力してください",
      });
    }
    if (endTime && !startTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "終了時刻を入力する場合は開始時刻も入力してください" });
    }
    const sourceId = str(v.sourceId);
    if (sourceId && !adminIdSchema.safeParse(sourceId).success) {
      ctx.addIssue({ code: "custom", path: ["sourceId"], message: "根拠の情報源の指定が不正です" });
    }
  }, ALWAYS);

export type SlotFormValues = z.output<typeof slotFormSchema>;

/**
 * 放送日と時刻（日本時間）→ 瞬間。終了時刻が開始時刻以前なら翌日の時刻とみなす（深夜をまたぐ放送）。
 */
export function slotTimesToInstants(airDate: string | null, startTime: string | null, endTime: string | null) {
  if (!airDate || !startTime) return { startAt: null, endAt: null };
  const startAt = zonedToUtc(airDate, startTime, JST);
  let endAt: Date | null = null;
  if (endTime) {
    const endDate = isTimeOnOrBefore(endTime, startTime) ? addDaysToLocalDate(airDate, 1) : airDate;
    endAt = zonedToUtc(endDate, endTime, JST);
  }
  return { startAt, endAt };
}

/** 放送枠フォームの値 → BroadcastSlot に保存する値（確認日時・並び順は呼び出し側で決める） */
export function slotFormToData(v: SlotFormValues) {
  const { startAt, endAt } = slotTimesToInstants(v.airDate, v.startTime, v.endTime);
  return {
    medium: v.medium,
    providerName: v.providerName,
    airDate: v.airDate ? localDateToDbDate(v.airDate) : null,
    startAt,
    endAt,
    cost: v.cost,
    viewingType: v.viewingType,
    region: v.region,
    regionNote: v.regionNote,
    note: v.note,
    watchUrl: v.watchUrl,
    infoUrl: v.infoUrl,
    verificationStatus: v.verificationStatus,
    status: v.status,
    sourceId: v.sourceId,
  };
}

// ---------------------------------------------------------------------------
// 出典・情報源
// ---------------------------------------------------------------------------

export const sourceFormSchema = z.object({
  kind: enumField(SOURCE_KINDS, "種類を選択してください"),
  url: text.pipe(z.string().min(1, { error: "URL を入力してください" })).pipe(httpUrlSchema),
  title: optionalText("タイトル", 200),
  note: optionalText("メモ", 1000),
  collectEnabled: checkbox,
});

export type SourceFormValues = z.output<typeof sourceFormSchema>;

// ---------------------------------------------------------------------------
// セッション（開催地の現地日付・時刻）
// ---------------------------------------------------------------------------

export const sessionFormSchema = z.object({
  name: requiredText("セッション名", 100),
  date: localDateField("日付"),
  startTime: optionalLocalTimeField("開始時刻"),
  note: optionalText("補足", 500),
});

export type SessionFormValues = z.output<typeof sessionFormSchema>;

export function sessionFormToData(v: SessionFormValues, eventTimezone: string) {
  return {
    name: v.name,
    date: localDateToDbDate(v.date),
    startAt: v.startTime ? zonedToUtc(v.date, v.startTime, eventTimezone) : null,
    note: v.note,
  };
}

// ---------------------------------------------------------------------------
// 候補のレビュー
// ---------------------------------------------------------------------------

export const reviewFormSchema = z.object({
  note: optionalText("メモ", 1000),
});

export const CANDIDATE_LIST_FILTERS = ["pending", "approved", "rejected", "all"] as const;
export type CandidateListFilter = (typeof CANDIDATE_LIST_FILTERS)[number];

export function parseCandidateListFilter(value: string | string[] | undefined): CandidateListFilter {
  const v = Array.isArray(value) ? value[0] : value;
  return CANDIDATE_LIST_FILTERS.find((f) => f === v) ?? "pending";
}
