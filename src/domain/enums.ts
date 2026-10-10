/**
 * ドメイン全体で使う列挙値。Prisma スキーマの enum を唯一の定義元とし、
 * ブラウザでも読み込める生成ファイル（enums.ts）から再エクスポートする。
 */
import {
  BroadcastInfoStatus,
  BroadcastMedium,
  Category,
  CollectionRunStatus,
  CostType,
  ExtractionProviderKind,
  FetchMode,
  PublicationStatus,
  RegionAvailability,
  ReviewStatus,
  SlotVerificationStatus,
  SourceKind,
  ViewingType,
} from "@/generated/prisma/enums";

export {
  BroadcastInfoStatus,
  BroadcastMedium,
  Category,
  CollectionRunStatus,
  CostType,
  ExtractionProviderKind,
  FetchMode,
  PublicationStatus,
  RegionAvailability,
  ReviewStatus,
  SlotVerificationStatus,
  SourceKind,
  ViewingType,
};

function valuesOf<T extends Record<string, string>>(obj: T): [T[keyof T], ...T[keyof T][]] {
  return Object.values(obj) as [T[keyof T], ...T[keyof T][]];
}

/** 宣言順（= 画面での表示順） */
export const CATEGORIES = valuesOf(Category);
export const PUBLICATION_STATUSES = valuesOf(PublicationStatus);
export const BROADCAST_INFO_STATUSES = valuesOf(BroadcastInfoStatus);
export const SLOT_VERIFICATION_STATUSES = valuesOf(SlotVerificationStatus);
export const BROADCAST_MEDIA = valuesOf(BroadcastMedium);
export const COST_TYPES = valuesOf(CostType);
export const VIEWING_TYPES = valuesOf(ViewingType);
export const REGION_AVAILABILITIES = valuesOf(RegionAvailability);
export const SOURCE_KINDS = valuesOf(SourceKind);
export const REVIEW_STATUSES = valuesOf(ReviewStatus);
