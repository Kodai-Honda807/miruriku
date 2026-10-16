import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { eventPath } from "@/components/events/event-seo";
import { getSiteUrl } from "@/lib/site-url";
import { listSitemapEventSlugs } from "@/server/queries/public-events";

/**
 * sitemap.xml。トップと、公開中の大会の詳細ページ（デモ大会は除く）。
 * DB を読むのでリクエスト時に生成する（ビルド時に DB へ接続しない）。
 * サイト URL が未設定のときは空にする（誤った絶対 URL を出さない）。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const site = getSiteUrl();
  if (!site) return [];
  const slugs = await listSitemapEventSlugs();
  return [
    { url: new URL("/", site).toString(), changeFrequency: "daily", priority: 1 },
    ...slugs.map((slug) => ({
      url: new URL(eventPath(slug), site).toString(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
