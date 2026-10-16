import type { Metadata } from "next";

import { serializeJsonLd } from "@/components/events/event-seo";
import { HomeEvents } from "@/components/events/home-events";
import { BASE_OPEN_GRAPH, canonical } from "@/components/site/seo";
import { SITE_DESCRIPTION, SITE_NAME } from "@/components/site/site-header";
import { SiteShell } from "@/components/site/site-shell";
import { getNow } from "@/lib/clock";
import { getSiteUrl } from "@/lib/site-url";
import { listPublicEventSummaries } from "@/server/public-data";

/**
 * 絞り込み条件付きの URL（?period=week など）も canonical は「/」にまとめる
 * （同じ一覧の言い換えが別ページとして評価されないようにする）。
 */
export const metadata: Metadata = {
  ...canonical("/"),
  openGraph: { ...BASE_OPEN_GRAPH, url: "/" },
};

/** サイト名を検索エンジンに伝える構造化データ（schema.org WebSite） */
function WebSiteJsonLd() {
  const site = getSiteUrl();
  if (!site) return null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: site.toString(),
    description: SITE_DESCRIPTION,
    inLanguage: "ja",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }}
    />
  );
}

/**
 * トップページ: 駅伝・マラソン・トラックの大会を同じ時系列一覧で表示する（日本時間基準）。
 * ビルド時に公開中の大会を埋め込み、絞り込みはブラウザで行う（src/components/events/home-events.tsx）。
 */
export default function HomePage() {
  return (
    <SiteShell home>
      <WebSiteJsonLd />
      <HomeEvents events={listPublicEventSummaries()} initialNow={getNow().toISOString()} />
    </SiteShell>
  );
}
