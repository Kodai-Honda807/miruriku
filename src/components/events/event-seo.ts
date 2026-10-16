/**
 * 大会詳細ページの検索エンジン向け情報（meta description と構造化データ）。
 *
 * - 画面に表示している公開情報だけから作る。推測で日時や放送局を補わない。
 * - 過去大会の参考情報の枠は「今年の放送予定」として扱わない（説明文に局名を出さない）。
 * - 構造化データは schema.org の SportsEvent。開始時刻が分からない大会は日付だけにする。
 */
import { formatLocalDateRangeJa } from "@/domain/datetime";
import { BROADCAST_INFO_STATUS_LABELS, CATEGORY_LABELS } from "@/domain/labels";
import type { PublicEventDetail } from "@/domain/types";
import { safeExternalHref } from "@/domain/url";

import { countryNameJa, isOverseas, splitSlots } from "./event-format";

/** 説明文に並べる放送・配信先の最大数（超えたら「ほか」） */
const MAX_PROVIDERS_IN_DESCRIPTION = 3;

export function eventPath(slug: string): string {
  return `/events/${slug}`;
}

/** 今年の放送・配信先（重複を除いた表示順） */
function currentProviders(event: PublicEventDetail): string[] {
  const { current } = splitSlots(event.broadcasts);
  return [...new Set(current.map((slot) => slot.providerName.trim()).filter(Boolean))];
}

/** meta description / og:description（検索結果に出る説明文） */
export function buildEventDescription(event: PublicEventDetail): string {
  const overseas = isOverseas(event);
  const date = formatLocalDateRangeJa(event.startDate, event.endDate, { withYear: true });
  const where = event.venueRegion ?? (overseas ? countryNameJa(event.countryCode) : null);
  const head = `${date}${overseas ? "（現地日付）" : ""}開催の${event.name}${where ? `（${where}）` : ""}。`;

  const providers = currentProviders(event);
  let body: string;
  if (event.broadcastInfoStatus !== "PAST_REFERENCE" && providers.length > 0) {
    const shown = providers.slice(0, MAX_PROVIDERS_IN_DESCRIPTION).join("・");
    const more = providers.length > MAX_PROVIDERS_IN_DESCRIPTION ? "ほか" : "";
    body = `${shown}${more}のテレビ放送・ネット配信の予定と開始時刻を、出典付きでまとめています。`;
  } else {
    body = `${BROADCAST_INFO_STATUS_LABELS[event.broadcastInfoStatus]}。開催日程と視聴方法の確認状況を、出典付きでまとめています。`;
  }
  return head + body;
}

export type JsonLd = Record<string, unknown>;

/** schema.org SportsEvent（JSON-LD） */
export function buildEventJsonLd(event: PublicEventDetail, pageUrl: string | null): JsonLd {
  const ld: JsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: event.name,
    description: buildEventDescription(event),
    sport: event.category === "TRACK" ? "陸上競技" : CATEGORY_LABELS[event.category],
    startDate: event.startAt ? event.startAt.toISOString() : event.startDate,
    endDate: event.endDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
  };
  if (pageUrl) ld.url = pageUrl;

  const venue = event.venueName ?? event.venueRegion;
  if (venue) {
    ld.location = {
      "@type": "Place",
      name: venue,
      address: {
        "@type": "PostalAddress",
        ...(event.venueRegion ? { addressLocality: event.venueRegion } : {}),
        addressCountry: event.countryCode.toUpperCase(),
      },
    };
  }

  const official = safeExternalHref(event.officialUrl);
  if (official) ld.sameAs = official;
  return ld;
}

/**
 * <script type="application/ld+json"> に埋め込む文字列。
 * 文字列中の「<」をエスケープし、</script> などで HTML を壊されないようにする。
 */
export function serializeJsonLd(ld: JsonLd): string {
  return JSON.stringify(ld).replace(/</g, "\\u003c");
}
