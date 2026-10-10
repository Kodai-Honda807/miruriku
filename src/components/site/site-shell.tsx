import type { ReactNode } from "react";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * 公開ページの共通の枠（ヘッダー・本文・フッター）。
 * ルートレイアウトではなく各公開ページで使う（/admin など別系統の画面に公開用の枠を出さないため）。
 */
export function SiteShell({ home = false, children }: { home?: boolean; children: ReactNode }) {
  return (
    <>
      <SiteHeader home={home} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 focus:outline-none sm:py-8"
      >
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
