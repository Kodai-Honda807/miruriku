"use client";

import "./globals.css";

/**
 * ルートレイアウト自体でエラーが起きた場合の表示（独自の html / body を持つ）。
 * 内部のエラー内容は画面に出さない。
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ja">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <title>エラーが発生しました | みる陸</title>
        <h1 className="text-xl font-bold">ページを表示できませんでした</h1>
        <p className="text-sm text-muted-foreground">時間をおいて、もう一度お試しください。</p>
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          再試行
        </button>
      </body>
    </html>
  );
}
