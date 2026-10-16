/**
 * 公開ページ（トップ・大会詳細）用の読み取りクエリ。
 *
 * - 公開してよいのは「大会が PUBLISHED」かつ「放送枠が PUBLISHED」のものだけ。
 *   下書きの大会・放送枠は、ここで DB の条件として除外する（画面側のフィルタに頼らない）。
 * - select で公開に必要な列だけを読み、src/domain/types.ts のプレーンな型に詰め替える。
 *   内部向けの列（情報源のメモ、収集設定、抽出候補など）は返さない。
 * - DB の @db.Date 列は dbDateToLocalDate で "YYYY-MM-DD" に変換する。
 * - "use cache" は付けない（常に最新を表示し、ビルド時に DB へ接続しないため）。
 *
 * テストからテスト用 DB のクライアントを渡せるよう、実装は db を受け取る関数に分けている。
 */
import "server-only";

import { addDaysToLocalDate, dbDateToLocalDate, jstDateOf, localDateToDbDate } from "@/domain/datetime";
import type {
  PublicBroadcast,
  PublicEventDetail,
  PublicEventSummary,
  PublicSession,
  PublicSource,
} from "@/domain/types";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";

/** 公開クエリが使う最小限のクライアント（PrismaClient またはトランザクションクライアント） */
export type PublicQueryDb = Pick<PrismaClient | Prisma.TransactionClient, "event">;

/**
 * 一覧の取得対象に含める過去日数。
 * 大会の endDate は開催地の現地日付なので、日本より時差が遅れている地域の大会は
 * 日本時間の「今日」より前の日付になり得る。余裕を持って 2 日前まで DB から読み、
 * 実際に終わったかどうかは filterAndSortEvents（日本時間の区間判定）に任せる。
 */
export const LIST_LOOKBACK_DAYS = 2;

/** slug として受け付ける最大長（不正に長い URL で DB を引かない） */
const MAX_SLUG_LENGTH = 200;

const broadcastSelect = {
  id: true,
  medium: true,
  providerName: true,
  airDate: true,
  startAt: true,
  endAt: true,
  cost: true,
  viewingType: true,
  region: true,
  regionNote: true,
  note: true,
  watchUrl: true,
  infoUrl: true,
  verificationStatus: true,
  verifiedAt: true,
  // 出典として公開するのは URL とタイトルだけ（メモ・収集設定は返さない）
  source: { select: { url: true, title: true } },
} satisfies Prisma.BroadcastSlotSelect;

/** 公開済みの放送枠のみ。表示順（sortOrder → 開始時刻 → 作成順） */
const publishedBroadcasts = {
  where: { status: "PUBLISHED" },
  orderBy: [
    { sortOrder: "asc" },
    { startAt: { sort: "asc", nulls: "last" } },
    { createdAt: "asc" },
    { id: "asc" },
  ],
  select: broadcastSelect,
} satisfies Prisma.Event$broadcastsArgs;

const eventSummarySelect = {
  id: true,
  slug: true,
  name: true,
  editionLabel: true,
  category: true,
  isDemo: true,
  venueName: true,
  venueRegion: true,
  countryCode: true,
  timezone: true,
  startDate: true,
  endDate: true,
  startAt: true,
  officialUrl: true,
  broadcastInfoStatus: true,
  broadcastNote: true,
  broadcastCheckedAt: true,
  series: { select: { name: true } },
  broadcasts: publishedBroadcasts,
} satisfies Prisma.EventSelect;

const eventDetailSelect = {
  ...eventSummarySelect,
  description: true,
  sessions: {
    orderBy: [
      { sortOrder: "asc" },
      { date: "asc" },
      { startAt: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ],
    select: { id: true, name: true, date: true, startAt: true, note: true },
  },
  sources: {
    // enum の宣言順（大会公式 → 放送・配信案内 → その他）
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, kind: true, url: true, title: true },
  },
} satisfies Prisma.EventSelect;

type BroadcastRow = Prisma.BroadcastSlotGetPayload<{ select: typeof broadcastSelect }>;
type EventSummaryRow = Prisma.EventGetPayload<{ select: typeof eventSummarySelect }>;
type EventDetailRow = Prisma.EventGetPayload<{ select: typeof eventDetailSelect }>;

function toPublicBroadcast(row: BroadcastRow): PublicBroadcast {
  return {
    id: row.id,
    medium: row.medium,
    providerName: row.providerName,
    airDate: row.airDate ? dbDateToLocalDate(row.airDate) : null,
    startAt: row.startAt,
    endAt: row.endAt,
    cost: row.cost,
    viewingType: row.viewingType,
    region: row.region,
    regionNote: row.regionNote,
    note: row.note,
    watchUrl: row.watchUrl,
    infoUrl: row.infoUrl,
    verificationStatus: row.verificationStatus,
    verifiedAt: row.verifiedAt,
    source: row.source ? { url: row.source.url, title: row.source.title } : null,
  };
}

function toPublicEventSummary(row: EventSummaryRow): PublicEventSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    editionLabel: row.editionLabel,
    seriesName: row.series.name,
    category: row.category,
    isDemo: row.isDemo,
    venueName: row.venueName,
    venueRegion: row.venueRegion,
    countryCode: row.countryCode,
    timezone: row.timezone,
    startDate: dbDateToLocalDate(row.startDate),
    endDate: dbDateToLocalDate(row.endDate),
    startAt: row.startAt,
    officialUrl: row.officialUrl,
    broadcastInfoStatus: row.broadcastInfoStatus,
    broadcastNote: row.broadcastNote,
    broadcastCheckedAt: row.broadcastCheckedAt,
    broadcasts: row.broadcasts.map(toPublicBroadcast),
  };
}

function toPublicSession(row: EventDetailRow["sessions"][number]): PublicSession {
  return {
    id: row.id,
    name: row.name,
    date: dbDateToLocalDate(row.date),
    startAt: row.startAt,
    note: row.note,
  };
}

function toPublicSource(row: EventDetailRow["sources"][number]): PublicSource {
  return { id: row.id, kind: row.kind, url: row.url, title: row.title };
}

/**
 * 一覧用: 公開中で、終了日が「日本時間の今日 − LIST_LOOKBACK_DAYS 日」以降の大会。
 *
 * 設計上の割り切り: 期間・競技・視聴方法・検索語による絞り込みと並び替えは、
 * 呼び出し側で filterAndSortEvents（src/domain/filters.ts）を使ってアプリ側で行う。
 * 掲載大会は数十〜数百件程度の小規模データを前提としており、日本時間の区間判定や
 * 「過去大会の参考情報の枠は数えない」といったドメインの規則を 1 か所（ドメイン層）に
 * 集約することを優先した。件数が増えた場合は DB 側での絞り込み・ページングを検討する。
 */
export async function listPublicEventsFrom(db: PublicQueryDb, now: Date): Promise<PublicEventSummary[]> {
  const fromDate = addDaysToLocalDate(jstDateOf(now), -LIST_LOOKBACK_DAYS);
  const rows = await db.event.findMany({
    where: {
      status: "PUBLISHED",
      endDate: { gte: localDateToDbDate(fromDate) },
    },
    orderBy: [{ startDate: "asc" }, { startAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    select: eventSummarySelect,
  });
  return rows.map(toPublicEventSummary);
}

/** 詳細用: 公開中の大会のみ。下書き・存在しない slug は null */
export async function getPublicEventDetailFrom(db: PublicQueryDb, slug: string): Promise<PublicEventDetail | null> {
  if (!slug || slug.length > MAX_SLUG_LENGTH) return null;
  const row = await db.event.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: eventDetailSelect,
  });
  if (!row) return null;
  return {
    ...toPublicEventSummary(row),
    description: row.description,
    sessions: row.sessions.map(toPublicSession),
    sources: row.sources.map(toPublicSource),
  };
}

/** 公開中の大会一覧（絞り込み・並び替えは呼び出し側で filterAndSortEvents を使う） */
export function listPublicEvents(now: Date): Promise<PublicEventSummary[]> {
  return listPublicEventsFrom(getPrisma(), now);
}

/** 公開中の大会の詳細。下書き・存在しない slug は null */
export function getPublicEventDetail(slug: string): Promise<PublicEventDetail | null> {
  return getPublicEventDetailFrom(getPrisma(), slug);
}
