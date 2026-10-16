import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site-url";

/** 静的書き出しのため、ビルド時に生成する */
export const dynamic = "force-static";

/**
 * robots.txt。公開ページはすべてクロール可。管理画面と API は対象外にする
 * （本番には存在しないが、念のため明示する）。
 * サイト URL が未設定のときは Sitemap 行を出さない。
 */
export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl("/sitemap.xml");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    ...(sitemap ? { sitemap } : {}),
  };
}
