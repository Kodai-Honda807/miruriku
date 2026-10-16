/**
 * 公開ページ用データの JSON 形式（ファイルの読み書きはしない）。
 *
 * 用途: E2E では、デモデータを入れた DB から公開用クエリで読み出した結果を JSON に保存し
 * （scripts/export-public-data.ts）、それを MIRURIKU_PUBLIC_DATA_FILE で指定して静的ビルドする。
 * 本番のビルドは data/real-events.ts から直接作るため、この形式を経由しない。
 *
 * 日時は ISO 8601 文字列で保存し、読み込み時に Date に戻す。形式は Zod で検証する。
 */
import { z } from "zod";

import { isValidLocalDate, type LocalDate } from "@/domain/datetime";
import {
  BROADCAST_INFO_STATUSES,
  BROADCAST_MEDIA,
  CATEGORIES,
  COST_TYPES,
  REGION_AVAILABILITIES,
  SLOT_VERIFICATION_STATUSES,
  SOURCE_KINDS,
  VIEWING_TYPES,
} from "@/domain/enums";
import type { PublicEventDetail } from "@/domain/types";

export const PUBLIC_DATA_SCHEMA_VERSION = 1;

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const localDate = z
  .string()
  .refine(isValidLocalDate, "YYYY-MM-DD 形式の日付ではありません")
  .transform((value) => value as LocalDate);
const text = z.string();

const broadcastSchema = z.strictObject({
  id: text,
  medium: z.enum(BROADCAST_MEDIA),
  providerName: text,
  airDate: localDate.nullable(),
  startAt: instant.nullable(),
  endAt: instant.nullable(),
  cost: z.enum(COST_TYPES),
  viewingType: z.enum(VIEWING_TYPES),
  region: z.enum(REGION_AVAILABILITIES),
  regionNote: text.nullable(),
  note: text.nullable(),
  watchUrl: text.nullable(),
  infoUrl: text.nullable(),
  verificationStatus: z.enum(SLOT_VERIFICATION_STATUSES),
  verifiedAt: instant.nullable(),
  source: z.strictObject({ url: text, title: text.nullable() }).nullable(),
});

const eventSchema = z.strictObject({
  id: text,
  slug: text,
  name: text,
  editionLabel: text.nullable(),
  seriesName: text,
  category: z.enum(CATEGORIES),
  isDemo: z.boolean(),
  venueName: text.nullable(),
  venueRegion: text.nullable(),
  countryCode: text,
  timezone: text,
  startDate: localDate,
  endDate: localDate,
  startAt: instant.nullable(),
  officialUrl: text.nullable(),
  broadcastInfoStatus: z.enum(BROADCAST_INFO_STATUSES),
  broadcastNote: text.nullable(),
  broadcastCheckedAt: instant.nullable(),
  broadcasts: z.array(broadcastSchema),
  description: text.nullable(),
  sessions: z.array(
    z.strictObject({ id: text, name: text, date: localDate, startAt: instant.nullable(), note: text.nullable() }),
  ),
  sources: z.array(z.strictObject({ id: text, kind: z.enum(SOURCE_KINDS), url: text, title: text.nullable() })),
});

const fileSchema = z.strictObject({
  schemaVersion: z.literal(PUBLIC_DATA_SCHEMA_VERSION),
  events: z.array(eventSchema),
});

export function serializePublicData(events: readonly PublicEventDetail[]): string {
  // Date は JSON.stringify で ISO 8601（UTC）になる
  return `${JSON.stringify({ schemaVersion: PUBLIC_DATA_SCHEMA_VERSION, events }, null, 2)}\n`;
}

export function parsePublicData(json: string): PublicEventDetail[] {
  const result = fileSchema.safeParse(JSON.parse(json));
  if (!result.success) {
    throw new Error(`公開データの形式が正しくありません: ${z.prettifyError(result.error)}`);
  }
  return result.data.events;
}
