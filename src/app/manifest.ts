import type { MetadataRoute } from "next";

import { SITE_DESCRIPTION, SITE_NAME } from "@/components/site/site-header";

/** 静的書き出しのため、ビルド時に生成する */
export const dynamic = "force-static";

/** Web App Manifest（ホーム画面に追加したときの名前・アイコン・色） */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "ja",
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: "#1f3f87",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
