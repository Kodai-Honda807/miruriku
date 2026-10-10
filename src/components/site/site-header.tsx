import Link from "next/link";

export const SITE_NAME = "みる陸";
export const SITE_CATCHPHRASE = "次のレース、いつ・どこで見られる？";
export const SITE_DESCRIPTION =
  "駅伝・マラソン・トラック競技の開催日程と、日本から視聴できるテレビ放送・ネット配信の情報をまとめています。";

/**
 * サイト共通のヘッダー。トップページ（home）ではサイト名とキャッチコピーを h1 にする。
 * それ以外のページではサイト名をトップページへのリンクにし、h1 は各ページの見出しに譲る。
 */
export function SiteHeader({ home = false }: { home?: boolean }) {
  return (
    <header className="border-b border-border bg-card">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        本文へスキップ
      </a>
      <div aria-hidden="true" className="h-1 bg-primary" />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1.5 px-4 py-4 sm:py-5">
        {home ? (
          <h1 className="flex flex-col gap-0.5">
            <span className="text-2xl font-black tracking-tight text-primary sm:text-3xl">{SITE_NAME}</span>{" "}
            <span className="text-lg leading-snug font-bold sm:text-xl">{SITE_CATCHPHRASE}</span>
          </h1>
        ) : (
          <p className="flex flex-col gap-0.5">
            <Link
              href="/"
              className="w-fit rounded-sm text-xl font-black tracking-tight text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-2xl"
            >
              {SITE_NAME}
            </Link>{" "}
            <span className="text-sm font-semibold">{SITE_CATCHPHRASE}</span>
          </p>
        )}
        <p className="text-sm text-muted-foreground">{SITE_DESCRIPTION}</p>
      </div>
    </header>
  );
}
