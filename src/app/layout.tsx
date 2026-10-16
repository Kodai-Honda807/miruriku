import type { Metadata, Viewport } from "next";

import { GoogleAnalytics } from "@/components/site/analytics";
import { SITE_DESCRIPTION, SITE_NAME } from "@/components/site/site-header";
import { BASE_OPEN_GRAPH, BASE_TWITTER, SITE_TITLE } from "@/components/site/seo";
import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

const siteUrl = getSiteUrl();

/**
 * サイト全体のメタデータ。
 * - metadataBase はサイト URL（MIRURIKU_SITE_URL）。未設定なら付けない（誤った絶対 URL を出さない）。
 * - アイコンは app/ 直下のファイル（icon.svg、apple-icon.png、favicon.ico）。OGP 画像は public/opengraph-image.png（src/components/site/seo.ts）。
 */
export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: BASE_OPEN_GRAPH,
  twitter: BASE_TWITTER,
  // 日付や時刻の数字列が電話番号として自動リンクされないようにする
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#1f3f87",
};

/**
 * ルートレイアウト。公開ページのヘッダー・フッターは各ページの SiteShell で描画する
 * （/admin など別系統の画面に公開用の枠を出さないため）。
 * フォントは next/font を使わず、日本語のシステムフォント（globals.css）を使う。
 * Google アナリティクスは本番ビルドのときだけ読み込む（src/components/site/analytics.tsx）。
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
