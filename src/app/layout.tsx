import type { Metadata, Viewport } from "next";

import { SITE_CATCHPHRASE, SITE_DESCRIPTION, SITE_NAME } from "@/components/site/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} | ${SITE_CATCHPHRASE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
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
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
