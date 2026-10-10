import { describe, expect, it } from "vitest";

import {
  BROADCAST_INFO_STATUSES,
  BROADCAST_MEDIA,
  CATEGORIES,
  COST_TYPES,
  CollectionRunStatus,
  ExtractionProviderKind,
  FetchMode,
  PUBLICATION_STATUSES,
  REGION_AVAILABILITIES,
  REVIEW_STATUSES,
  SLOT_VERIFICATION_STATUSES,
  SOURCE_KINDS,
  VIEWING_TYPES,
} from "./enums";
import { PERIODS, PERIOD_LABELS } from "./filters";
import {
  BROADCAST_INFO_STATUS_DESCRIPTIONS,
  BROADCAST_INFO_STATUS_LABELS,
  BROADCAST_MEDIUM_LABELS,
  CATEGORY_LABELS,
  COLLECTION_RUN_STATUS_LABELS,
  COST_TYPE_LABELS,
  EXTRACTION_PROVIDER_KIND_LABELS,
  FETCH_MODE_LABELS,
  PUBLICATION_STATUS_LABELS,
  REGION_AVAILABILITY_LABELS,
  REVIEW_STATUS_LABELS,
  SLOT_VERIFICATION_STATUS_LABELS,
  SOURCE_KIND_LABELS,
  VIEWING_TYPE_LABELS,
} from "./labels";

const cases: Array<[string, readonly string[], Record<string, string>]> = [
  ["Category", CATEGORIES, CATEGORY_LABELS],
  ["PublicationStatus", PUBLICATION_STATUSES, PUBLICATION_STATUS_LABELS],
  ["BroadcastInfoStatus", BROADCAST_INFO_STATUSES, BROADCAST_INFO_STATUS_LABELS],
  ["BroadcastInfoStatus（説明）", BROADCAST_INFO_STATUSES, BROADCAST_INFO_STATUS_DESCRIPTIONS],
  ["SlotVerificationStatus", SLOT_VERIFICATION_STATUSES, SLOT_VERIFICATION_STATUS_LABELS],
  ["BroadcastMedium", BROADCAST_MEDIA, BROADCAST_MEDIUM_LABELS],
  ["CostType", COST_TYPES, COST_TYPE_LABELS],
  ["ViewingType", VIEWING_TYPES, VIEWING_TYPE_LABELS],
  ["RegionAvailability", REGION_AVAILABILITIES, REGION_AVAILABILITY_LABELS],
  ["SourceKind", SOURCE_KINDS, SOURCE_KIND_LABELS],
  ["ReviewStatus", REVIEW_STATUSES, REVIEW_STATUS_LABELS],
  ["CollectionRunStatus", Object.values(CollectionRunStatus), COLLECTION_RUN_STATUS_LABELS],
  ["FetchMode", Object.values(FetchMode), FETCH_MODE_LABELS],
  ["ExtractionProviderKind", Object.values(ExtractionProviderKind), EXTRACTION_PROVIDER_KIND_LABELS],
  ["Period", PERIODS, PERIOD_LABELS],
];

describe.each(cases)("%s のラベル", (_name, values, labels) => {
  it("列挙値が 1 つ以上ある", () => {
    expect(values.length).toBeGreaterThan(0);
  });

  it("すべての値に空でないラベルがあり、余分なキーがない", () => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const v of values) {
      expect(labels[v]?.trim()).toBeTruthy();
    }
  });

  it("ラベルが互いに異なる（色だけでなくテキストで区別できる）", () => {
    const texts = values.map((v) => labels[v]);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("放送情報状態の表現", () => {
  it("UNVERIFIED（未確認）と NO_BROADCAST（配信なし）はラベルも説明も異なる", () => {
    expect(BROADCAST_INFO_STATUS_LABELS.UNVERIFIED).not.toBe(BROADCAST_INFO_STATUS_LABELS.NO_BROADCAST);
    expect(BROADCAST_INFO_STATUS_DESCRIPTIONS.UNVERIFIED).not.toBe(BROADCAST_INFO_STATUS_DESCRIPTIONS.NO_BROADCAST);
    expect(BROADCAST_INFO_STATUS_LABELS.UNVERIFIED).toContain("未確認");
    expect(BROADCAST_INFO_STATUS_LABELS.UNVERIFIED).not.toContain("なし");
  });

  it("UNVERIFIED の説明は「配信なしではない」ことを伝える", () => {
    expect(BROADCAST_INFO_STATUS_DESCRIPTIONS.UNVERIFIED).toMatch(/(ない|なし)という意味ではありません/);
  });

  it("NO_BROADCAST は公式案内に基づくことを示す", () => {
    expect(BROADCAST_INFO_STATUS_LABELS.NO_BROADCAST).toContain("公式");
  });

  it("PAST_REFERENCE は今年の確定情報ではないことを伝える", () => {
    expect(BROADCAST_INFO_STATUS_LABELS.PAST_REFERENCE).toContain("過去大会");
    expect(BROADCAST_INFO_STATUS_DESCRIPTIONS.PAST_REFERENCE).toContain("今年も同じとは限りません");
    expect(SLOT_VERIFICATION_STATUS_LABELS.PAST_REFERENCE).toContain("過去大会");
  });
});

describe("抽出方法・取得方法の表現", () => {
  it("固定データによる抽出は実際の収集ではないと明示する", () => {
    expect(EXTRACTION_PROVIDER_KIND_LABELS.FIXTURE).toMatch(/実際の収集ではありません|実収集ではありません/);
    expect(EXTRACTION_PROVIDER_KIND_LABELS.FIXTURE).toMatch(/デモ|テスト/);
  });

  it("固定ファイル取得はデモ・テスト用と明示する", () => {
    expect(FETCH_MODE_LABELS.FIXTURE).toMatch(/デモ|テスト/);
  });
});
