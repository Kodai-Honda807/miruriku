/**
 * UI テスト用の固定データ（テストからのみ読み込む）。
 * 実行日・実行環境のタイムゾーンで結果が変わらないよう、日時はすべて固定値で作る。
 */
import { JST, zonedToUtc } from "@/domain/datetime";
import type { PublicBroadcast, PublicEventDetail, PublicEventSummary } from "@/domain/types";

/** 基準時刻: 2026-10-10（土）12:00 日本時間 */
export const FIXED_NOW = zonedToUtc("2026-10-10", "12:00", JST);

export function makeBroadcast(overrides: Partial<PublicBroadcast> = {}): PublicBroadcast {
  return {
    id: "slot-1",
    medium: "TERRESTRIAL",
    providerName: "テスト放送（架空）",
    airDate: "2026-10-12",
    startAt: zonedToUtc("2026-10-12", "09:00", JST),
    endAt: zonedToUtc("2026-10-12", "12:00", JST),
    cost: "FREE",
    viewingType: "LIVE",
    region: "NATIONWIDE",
    regionNote: null,
    note: null,
    watchUrl: null,
    infoUrl: null,
    verificationStatus: "CONFIRMED",
    verifiedAt: zonedToUtc("2026-10-08", "11:30", JST),
    source: null,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<PublicEventSummary> = {}): PublicEventSummary {
  return {
    id: "event-1",
    slug: "test-marathon",
    name: "テストマラソン",
    editionLabel: null,
    seriesName: "テストマラソン",
    category: "MARATHON",
    isDemo: false,
    venueName: "テスト競技場",
    venueRegion: "東京都",
    countryCode: "JP",
    timezone: JST,
    startDate: "2026-10-12",
    endDate: "2026-10-12",
    startAt: zonedToUtc("2026-10-12", "09:10", JST),
    officialUrl: "https://example.org/official",
    broadcastInfoStatus: "CONFIRMED",
    broadcastNote: null,
    broadcastCheckedAt: zonedToUtc("2026-10-08", "11:30", JST),
    broadcasts: [],
    ...overrides,
  };
}

export function makeEventDetail(overrides: Partial<PublicEventDetail> = {}): PublicEventDetail {
  return {
    ...makeEvent(),
    description: "テスト用の大会です。",
    sessions: [],
    sources: [],
    ...overrides,
  };
}
