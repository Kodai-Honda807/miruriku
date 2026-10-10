/**
 * 列挙値の日本語ラベル。色だけで状態を伝えないよう、画面では必ずこのテキストを併記する。
 */
import type {
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
} from "./enums";

export const CATEGORY_LABELS: Record<Category, string> = {
  EKIDEN: "駅伝",
  MARATHON: "マラソン",
  TRACK: "トラック",
};

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  DRAFT: "下書き",
  PUBLISHED: "公開",
};

export const BROADCAST_INFO_STATUS_LABELS: Record<BroadcastInfoStatus, string> = {
  CONFIRMED: "公式発表を確認済み",
  NOT_ANNOUNCED: "放送・配信は未発表",
  UNVERIFIED: "放送・配信情報は未確認",
  NO_BROADCAST: "放送・配信なし（公式案内）",
  PAST_REFERENCE: "過去大会の参考情報のみ",
};

/** 大会全体の放送情報状態の補足説明（一覧・詳細の注意書きに使う） */
export const BROADCAST_INFO_STATUS_DESCRIPTIONS: Record<BroadcastInfoStatus, string> = {
  CONFIRMED: "主催者・放送局などの公式発表で放送・配信予定を確認しています。",
  NOT_ANNOUNCED: "公式の放送・配信情報がまだ発表されていないことを確認しています。",
  UNVERIFIED:
    "放送・配信情報を確認できていません。放送・配信がないという意味ではありません。",
  NO_BROADCAST: "主催者などから、テレビ放送・ネット配信は行わないと案内されています。",
  PAST_REFERENCE:
    "今年の放送・配信情報は確認できていません。掲載しているのは過去大会の参考情報で、今年も同じとは限りません。",
};

export const SLOT_VERIFICATION_STATUS_LABELS: Record<SlotVerificationStatus, string> = {
  CONFIRMED: "確認済み",
  UNVERIFIED: "未確認",
  PAST_REFERENCE: "過去大会の参考情報",
};

export const BROADCAST_MEDIUM_LABELS: Record<BroadcastMedium, string> = {
  TERRESTRIAL: "地上波",
  BS: "BS",
  CS: "CS",
  INTERNET: "ネット配信",
  RADIO: "ラジオ",
};

export const COST_TYPE_LABELS: Record<CostType, string> = {
  FREE: "無料",
  PAID: "有料",
  UNKNOWN: "料金不明",
};

export const VIEWING_TYPE_LABELS: Record<ViewingType, string> = {
  LIVE: "ライブ",
  DELAYED: "録画",
  ON_DEMAND: "見逃し",
  UNKNOWN: "形態不明",
};

export const REGION_AVAILABILITY_LABELS: Record<RegionAvailability, string> = {
  NATIONWIDE: "全国",
  REGIONAL: "地域限定",
  JAPAN_UNKNOWN: "日本での視聴可否不明",
  UNKNOWN: "視聴地域不明",
};

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  OFFICIAL_SITE: "大会公式",
  BROADCAST_INFO: "放送・配信案内",
  OTHER: "その他の情報源",
};

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: "未レビュー",
  APPROVED: "承認済み",
  REJECTED: "却下",
};

export const COLLECTION_RUN_STATUS_LABELS: Record<CollectionRunStatus, string> = {
  RUNNING: "実行中",
  SUCCEEDED: "成功",
  FAILED: "失敗",
  SKIPPED: "取得せず",
};

export const FETCH_MODE_LABELS: Record<FetchMode, string> = {
  HTTP: "HTTP 取得",
  FIXTURE: "固定ファイル（デモ・テスト用）",
};

/** 抽出方法。固定データによる抽出を「AI による実収集」と誤認させない表記にする。 */
export const EXTRACTION_PROVIDER_KIND_LABELS: Record<ExtractionProviderKind, string> = {
  FIXTURE: "固定データ（デモ・テスト用。実際の収集ではありません）",
  RULE_BASED: "ルールベース抽出",
  LLM: "LLM による抽出",
};
