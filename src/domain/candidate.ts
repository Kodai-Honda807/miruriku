/**
 * 抽出結果のスキーマ（収集基盤と管理画面の共通契約）。
 *
 * 流れ:
 *   抽出プロバイダ → RawExtraction（unknown を extractionResultSchema で検証）
 *   → normalizeExtraction() → NormalizedExtraction（ExtractionCandidate.payload に保存）
 *
 * 外部ページ由来のデータは信頼しない。ここで型・長さ・URL スキームを検証し、
 * 想定外のキーは拒否する（strictObject）。抽出結果を命令として解釈・実行しない。
 *
 * 時刻の解釈:
 * - 大会（event）の日付・時刻は開催地の現地時刻
 * - 放送・配信（broadcasts）の日付・時刻は日本時間
 */
import { z } from "zod";

import {
  JST,
  addDaysToLocalDate,
  isValidLocalDate,
  isValidLocalTime,
  toZonedParts,
  zonedToUtc,
  type LocalDate,
} from "./datetime";
import {
  BROADCAST_MEDIA,
  COST_TYPES,
  REGION_AVAILABILITIES,
  VIEWING_TYPES,
  type BroadcastMedium,
  type CostType,
  type RegionAvailability,
  type ViewingType,
} from "./enums";
import { httpUrlSchema } from "./url";

export const CANDIDATE_SCHEMA_VERSION = 1;

export const MAX_EXTRACTED_BROADCASTS = 30;

const localDateSchema = z
  .string()
  .refine(isValidLocalDate, { error: "日付は YYYY-MM-DD 形式で指定してください" });

const localTimeSchema = z
  .string()
  .refine(isValidLocalTime, { error: "時刻は HH:MM（24 時間表記）で指定してください" });

const shortText = (max: number) => z.string().trim().min(1).max(max);

/** 抽出結果で、ページが放送・配信について述べている状態 */
export const EXTRACTED_BROADCAST_STATUSES = [
  "CONFIRMED", // 放送・配信予定が発表されている
  "NOT_ANNOUNCED", // 未発表と明記されている
  "NO_BROADCAST", // 放送・配信を行わないと明記されている
  "UNKNOWN", // ページから判断できない（「なし」と同義ではない）
] as const;
export type ExtractedBroadcastStatus = (typeof EXTRACTED_BROADCAST_STATUSES)[number];

export const extractedBroadcastSchema = z.strictObject({
  medium: z.enum(BROADCAST_MEDIA),
  providerName: shortText(100),
  /** 日本時間の放送日 */
  date: localDateSchema.nullable().default(null),
  /** 日本時間の開始時刻 */
  startTime: localTimeSchema.nullable().default(null),
  /** 日本時間の終了時刻（開始より前なら翌日とみなす） */
  endTime: localTimeSchema.nullable().default(null),
  cost: z.enum(COST_TYPES).default("UNKNOWN"),
  viewingType: z.enum(VIEWING_TYPES).default("UNKNOWN"),
  region: z.enum(REGION_AVAILABILITIES).default("UNKNOWN"),
  regionNote: shortText(200).nullable().default(null),
  note: shortText(500).nullable().default(null),
  watchUrl: httpUrlSchema.nullable().default(null),
  infoUrl: httpUrlSchema.nullable().default(null),
  /** 根拠となるページ内の短い引用 */
  evidence: shortText(300).nullable().default(null),
});

export const extractionResultSchema = z
  .strictObject({
    broadcastStatus: z.enum(EXTRACTED_BROADCAST_STATUSES).default("UNKNOWN"),
    event: z
      .strictObject({
        /** 開催地の現地日付 */
        startDate: localDateSchema.nullable().default(null),
        endDate: localDateSchema.nullable().default(null),
        /** 開催地の現地時刻 */
        startTime: localTimeSchema.nullable().default(null),
        venueName: shortText(200).nullable().default(null),
      })
      .default({ startDate: null, endDate: null, startTime: null, venueName: null }),
    broadcasts: z.array(extractedBroadcastSchema).max(MAX_EXTRACTED_BROADCASTS).default([]),
    notes: shortText(1000).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    const { startDate, endDate, startTime } = value.event;
    if (startDate && endDate && endDate < startDate) {
      ctx.addIssue({ code: "custom", path: ["event", "endDate"], message: "終了日が開始日より前です" });
    }
    if (startTime && !startDate) {
      ctx.addIssue({ code: "custom", path: ["event", "startTime"], message: "開始時刻には開始日が必要です" });
    }
    if (value.broadcastStatus === "NO_BROADCAST" && value.broadcasts.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["broadcastStatus"],
        message: "放送・配信なしと放送・配信枠が同時に指定されています",
      });
    }
    value.broadcasts.forEach((b, i) => {
      if ((b.startTime || b.endTime) && !b.date) {
        ctx.addIssue({ code: "custom", path: ["broadcasts", i, "date"], message: "時刻には放送日が必要です" });
      }
      if (b.endTime && !b.startTime) {
        ctx.addIssue({
          code: "custom",
          path: ["broadcasts", i, "endTime"],
          message: "終了時刻には開始時刻が必要です",
        });
      }
    });
  });

export type ExtractionResultInput = z.input<typeof extractionResultSchema>;
export type ExtractionResult = z.output<typeof extractionResultSchema>;
export type ExtractedBroadcast = z.output<typeof extractedBroadcastSchema>;

/** 正規化済みの放送・配信枠（保存用。瞬間は ISO 8601 の UTC 文字列） */
export type NormalizedBroadcast = {
  /** 候補内での識別キー（承認時の二重作成防止にも使う） */
  itemKey: string;
  medium: BroadcastMedium;
  providerName: string;
  airDate: LocalDate | null;
  startAt: string | null;
  endAt: string | null;
  cost: CostType;
  viewingType: ViewingType;
  region: RegionAvailability;
  regionNote: string | null;
  note: string | null;
  watchUrl: string | null;
  infoUrl: string | null;
  evidence: string | null;
};

export type NormalizedExtraction = {
  schemaVersion: typeof CANDIDATE_SCHEMA_VERSION;
  broadcastStatus: ExtractedBroadcastStatus;
  event: {
    startDate: LocalDate | null;
    endDate: LocalDate | null;
    startAt: string | null;
    venueName: string | null;
  };
  broadcasts: NormalizedBroadcast[];
  notes: string | null;
};

/** 放送局名などの比較用正規化（全角・半角、大小文字、空白の違いを無視） */
export function normalizeProviderName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 放送枠の照合キー: 媒体 + 局・サービス名 + 日本時間の放送日 + 視聴形態 */
export function broadcastMatchKey(input: {
  medium: BroadcastMedium;
  providerName: string;
  jstDate: LocalDate | null;
  viewingType: ViewingType;
}): string {
  return [input.medium, normalizeProviderName(input.providerName), input.jstDate ?? "-", input.viewingType].join(
    "|",
  );
}

function normalizeBroadcast(b: ExtractedBroadcast): Omit<NormalizedBroadcast, "itemKey"> {
  let startAt: Date | null = null;
  let endAt: Date | null = null;
  if (b.date && b.startTime) {
    startAt = zonedToUtc(b.date, b.startTime, JST);
    if (b.endTime) {
      const endDate = b.endTime <= b.startTime ? addDaysToLocalDate(b.date, 1) : b.date;
      endAt = zonedToUtc(endDate, b.endTime, JST);
    }
  }
  return {
    medium: b.medium,
    providerName: b.providerName,
    airDate: b.date,
    startAt: startAt?.toISOString() ?? null,
    endAt: endAt?.toISOString() ?? null,
    cost: b.cost,
    viewingType: b.viewingType,
    region: b.region,
    regionNote: b.regionNote,
    note: b.note,
    watchUrl: b.watchUrl,
    infoUrl: b.infoUrl,
    evidence: b.evidence,
  };
}

/**
 * 検証済みの抽出結果を保存用に正規化する。
 * @param eventTimezone 大会開催地の IANA タイムゾーン（大会の開始時刻の解釈に使う）
 */
export function normalizeExtraction(result: ExtractionResult, eventTimezone: string): NormalizedExtraction {
  const usedKeys = new Map<string, number>();
  const broadcasts = result.broadcasts.map((b) => {
    const normalized = normalizeBroadcast(b);
    const jstDate = normalized.startAt ? toZonedParts(new Date(normalized.startAt), JST).date : normalized.airDate;
    const baseKey = broadcastMatchKey({ ...normalized, jstDate });
    const seen = usedKeys.get(baseKey) ?? 0;
    usedKeys.set(baseKey, seen + 1);
    const itemKey = seen === 0 ? baseKey : `${baseKey}#${seen + 1}`;
    return { itemKey, ...normalized };
  });

  const { startDate, endDate, startTime, venueName } = result.event;
  return {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    broadcastStatus: result.broadcastStatus,
    event: {
      startDate,
      endDate,
      startAt: startDate && startTime ? zonedToUtc(startDate, startTime, eventTimezone).toISOString() : null,
      venueName,
    },
    broadcasts,
    notes: result.notes,
  };
}

/** unknown（プロバイダの出力）を検証して正規化する。失敗時は Zod のエラーを返す */
export function parseAndNormalizeExtraction(
  raw: unknown,
  eventTimezone: string,
): { success: true; data: NormalizedExtraction } | { success: false; error: z.ZodError } {
  const parsed = extractionResultSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: parsed.error };
  return { success: true, data: normalizeExtraction(parsed.data, eventTimezone) };
}

/** DB に保存済みの payload（Json）を読み戻す際の最小限の検証 */
const normalizedBroadcastSchema = z.strictObject({
  itemKey: z.string().min(1),
  medium: z.enum(BROADCAST_MEDIA),
  providerName: z.string().min(1),
  airDate: localDateSchema.nullable(),
  startAt: z.iso.datetime().nullable(),
  endAt: z.iso.datetime().nullable(),
  cost: z.enum(COST_TYPES),
  viewingType: z.enum(VIEWING_TYPES),
  region: z.enum(REGION_AVAILABILITIES),
  regionNote: z.string().nullable(),
  note: z.string().nullable(),
  watchUrl: httpUrlSchema.nullable(),
  infoUrl: httpUrlSchema.nullable(),
  evidence: z.string().nullable(),
});

export const normalizedExtractionSchema = z.strictObject({
  schemaVersion: z.literal(CANDIDATE_SCHEMA_VERSION),
  broadcastStatus: z.enum(EXTRACTED_BROADCAST_STATUSES),
  event: z.strictObject({
    startDate: localDateSchema.nullable(),
    endDate: localDateSchema.nullable(),
    startAt: z.iso.datetime().nullable(),
    venueName: z.string().nullable(),
  }),
  broadcasts: z.array(normalizedBroadcastSchema).max(MAX_EXTRACTED_BROADCASTS),
  notes: z.string().nullable(),
});

export function parseStoredPayload(json: unknown): NormalizedExtraction {
  return normalizedExtractionSchema.parse(json) as NormalizedExtraction;
}
