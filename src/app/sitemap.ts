import type { MetadataRoute } from "next";

import { eventPath } from "@/components/events/event-seo";
import { getSiteUrl } from "@/lib/site-url";
import { listSitemapEventSlugs } from "@/server/public-data";

/** 静的書き出しのため、ビルド時に生成する */
export const dynamic = "force-static";

/**
 * sitemap.xml。トップと、公開中の大会の詳細ページ（デモ大会は除く）。
 * サイト URL が未設定のときは空にする（誤った絶対 URL を出さない）。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteUrl();
  if (!site) return [];
  return [
    { url: new URL("/", site).toString(), changeFrequency: "daily", priority: 1 },
    ...listSitemapEventSlugs().map((slug) => ({
      url: new URL(eventPath(slug), site).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
