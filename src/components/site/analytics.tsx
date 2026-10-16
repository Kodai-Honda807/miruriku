import Script from "next/script";

/**
 * Google アナリティクス（GA4）。
 *
 * - 測定 ID は HTML に必ず現れる公開値なので、コードに置く（秘密情報ではない）。
 * - 本番ビルド（next build → NODE_ENV=production）のときだけ読み込む。
 *   開発サーバー・テスト・E2E（next dev）では読み込まず、計測データを汚さない。
 * - 本番ビルドでも計測したくない場合（手元での動作確認など）は、
 *   ビルド時に NEXT_PUBLIC_DISABLE_ANALYTICS=1 を指定する。
 * - 判定はビルド時に決まる（静的に書き出す構成に変えても同じように動く）。
 * - App Router のクライアント遷移（フィルタ変更の URL 更新、詳細ページへの移動）は、
 *   GA4 の拡張計測「ブラウザの履歴イベントに基づくページの変更」で page_view になる。
 */
export const GA_MEASUREMENT_ID = "G-E17SENSEG0";

type AnalyticsEnv = { NODE_ENV?: string; NEXT_PUBLIC_DISABLE_ANALYTICS?: string };

export function isAnalyticsEnabled(env: AnalyticsEnv = process.env): boolean {
  return env.NODE_ENV === "production" && env.NEXT_PUBLIC_DISABLE_ANALYTICS !== "1";
}

/** GA の公式スニペット（gtag.js）を、ページの操作を妨げないよう hydration 後に読み込む */
export function GoogleAnalytics({ enabled = isAnalyticsEnabled() }: { enabled?: boolean }) {
  if (!enabled) return null;
  return (
    <>
      <Script
        id="ga-gtag"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}

/** Google アナリティクス利用規約に沿った、利用者向けの告知（フッターに表示） */
export const ANALYTICS_POLICY_URL = "https://policies.google.com/technologies/partner-sites?hl=ja";
