/**
 * 実在の大会データ（data/real-events.ts の定義）から、公開ページ用のデータを作る（DB を使わない）。
 *
 * 静的配信では、ビルド時にこの関数の結果から HTML を書き出す。
 * 結果は「定義を pnpm data:load で DB に反映し、公開用クエリ（src/server/queries/public-events.ts）で
 * 読んだもの」と同じになるようにする（ID を除く。DB 版との一致は public-data.db.test.ts で確認している）。
 *
 * - 時刻の解釈は loadRealEvents（prisma/real-events.ts）と同じ: 大会・セッションは開催地の現地時刻、放送・配信は日本時間
 * - 並び順も公開用クエリと同じ: 放送枠・セッションは定義順、情報源は種別（大会公式 → 放送・配信案内 → その他）→ 定義順
 * - 情報源のメモ（note）・収集設定（collectEnabled）は公開しない
 */
import { zonedToUtc, type LocalDate } from "@/domain/datetime";
import type { SourceKind } from "@/domain/enums";
import type { PublicBroadcast, PublicEventDetail, PublicSession, PublicSource } from "@/domain/types";

import { parseRealEvents, realChildId, slotInstants, type ParsedEvent } from "../../../prisma/real-events";

/** DB の SourceKind の宣言順（公開用クエリの orderBy: kind asc と同じ並び） */
const SOURCE_KIND_ORDER: readonly SourceKind[] = ["OFFICIAL_SITE", "BROADCAST_INFO", "OTHER"];

function toPublicEvent(def: ParsedEvent): PublicEventDetail {
  const sourcesByKey = new Map(def.sources.map((s) => [s.key, s]));

  const broadcasts: PublicBroadcast[] = def.slots.map((slot) => {
    const source = slot.sourceKey ? sourcesByKey.get(slot.sourceKey) : undefined;
    return {
      id: realChildId(def.slug, "slot", slot.key),
      medium: slot.medium,
      providerName: slot.providerName,
      airDate: (slot.airDate as LocalDate | null) ?? null,
      ...slotInstants(slot),
      cost: slot.cost,
      viewingType: slot.viewingType,
      region: slot.region,
      regionNote: slot.regionNote,
      note: slot.note,
      watchUrl: slot.watchUrl,
      infoUrl: slot.infoUrl,
      verificationStatus: slot.verificationStatus,
      verifiedAt: slot.verifiedAt ? new Date(slot.verifiedAt) : null,
      source: source ? { url: source.url, title: source.title } : null,
    };
  });

  const sessions: PublicSession[] = (def.sessions ?? []).map((session) => ({
    id: realChildId(def.slug, "session", session.key),
    name: session.name,
    date: session.date as LocalDate,
    startAt: session.startTime ? zonedToUtc(session.date as LocalDate, session.startTime, def.timezone) : null,
    note: session.note,
  }));

  const sources: PublicSource[] = def.sources
    .map((source, index) => ({ source, index }))
    .sort(
      (a, b) =>
        SOURCE_KIND_ORDER.indexOf(a.source.kind) - SOURCE_KIND_ORDER.indexOf(b.source.kind) || a.index - b.index,
    )
    .map(({ source }) => ({
      id: `real:${def.slug}:source:${source.key}`,
      kind: source.kind,
      url: source.url,
      title: source.title,
    }));

  return {
    id: `real:${def.slug}`,
    slug: def.slug,
    name: def.name,
    editionLabel: def.editionLabel,
    seriesName: def.series.name,
    category: def.category,
    isDemo: false,
    venueName: def.venueName,
    venueRegion: def.venueRegion,
    countryCode: def.countryCode,
    timezone: def.timezone,
    startDate: def.startDate as LocalDate,
    endDate: def.endDate as LocalDate,
    startAt: def.startTime ? zonedToUtc(def.startDate as LocalDate, def.startTime, def.timezone) : null,
    officialUrl: def.officialUrl,
    broadcastInfoStatus: def.broadcastInfoStatus,
    broadcastNote: def.broadcastNote,
    broadcastCheckedAt: def.broadcastCheckedAt ? new Date(def.broadcastCheckedAt) : null,
    broadcasts,
    description: def.description,
    sessions,
    sources,
  };
}

/** 定義を検証し（問題があれば例外）、公開ページ用のデータに変換する。並び順は開始日 → 開始時刻（不明は後）→ slug */
export function publicEventsFromRealEvents(defs: unknown): PublicEventDetail[] {
  return parseRealEvents(defs).map(toPublicEvent).sort(compareEvents);
}

export function compareEvents(a: PublicEventDetail, b: PublicEventDetail): number {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  const at = a.startAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.startAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}
