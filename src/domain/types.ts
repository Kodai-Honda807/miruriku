/**
 * 公開ページで扱う大会・放送枠の型（DB 型から独立したプレーンな型）。
 * 公開用クエリ（src/server/queries/public-events.ts）は、
 * status=PUBLISHED の大会と、status=PUBLISHED の放送枠だけをこの型に詰めて返す。
 */
import type { LocalDate } from "./datetime";
import type {
  BroadcastInfoStatus,
  BroadcastMedium,
  Category,
  CostType,
  RegionAvailability,
  SlotVerificationStatus,
  SourceKind,
  ViewingType,
} from "./enums";

export type PublicBroadcast = {
  id: string;
  medium: BroadcastMedium;
  providerName: string;
  /** 日本時間の放送日（時刻不明でも日付が分かる場合） */
  airDate: LocalDate | null;
  startAt: Date | null;
  endAt: Date | null;
  cost: CostType;
  viewingType: ViewingType;
  region: RegionAvailability;
  regionNote: string | null;
  note: string | null;
  /** 実際に視聴するページ */
  watchUrl: string | null;
  /** 放送・配信の案内ページ */
  infoUrl: string | null;
  verificationStatus: SlotVerificationStatus;
  /** 人が確認した日時 */
  verifiedAt: Date | null;
};

export type PublicEventSummary = {
  id: string;
  slug: string;
  name: string;
  editionLabel: string | null;
  seriesName: string;
  category: Category;
  isDemo: boolean;
  venueName: string | null;
  venueRegion: string | null;
  countryCode: string;
  timezone: string;
  /** 開催地の現地日付 */
  startDate: LocalDate;
  endDate: LocalDate;
  /** 競技開始の瞬間（不明なら null） */
  startAt: Date | null;
  officialUrl: string | null;
  broadcastInfoStatus: BroadcastInfoStatus;
  broadcastNote: string | null;
  /** 人が放送情報を最後に確認した日時 */
  broadcastCheckedAt: Date | null;
  /** 公開済みの放送枠のみ。並び順は表示順 */
  broadcasts: PublicBroadcast[];
};

export type PublicSession = {
  id: string;
  name: string;
  /** 開催地の現地日付 */
  date: LocalDate;
  startAt: Date | null;
  note: string | null;
};

export type PublicSource = {
  id: string;
  kind: SourceKind;
  url: string;
  title: string | null;
};

export type PublicEventDetail = PublicEventSummary & {
  description: string | null;
  sessions: PublicSession[];
  sources: PublicSource[];
};
