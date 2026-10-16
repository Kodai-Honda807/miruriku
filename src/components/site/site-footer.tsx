import { ANALYTICS_POLICY_URL, isAnalyticsEnabled } from "./analytics";
import { SITE_NAME } from "./site-header";

/** サイト共通のフッター（掲載情報についての注意、アクセス解析の告知） */
export function SiteFooter({ analytics = isAnalyticsEnabled() }: { analytics?: boolean }) {
  return (
    <footer className="mt-auto border-t border-border bg-muted/60">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-1.5 px-4 py-6 text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">
          掲載情報は変更される場合があります。視聴前に必ず大会・放送局・配信サービスの公式情報をご確認ください。
        </p>
        <p>日付・時刻は、特に記載がない限り日本時間（JST）です。</p>
        <p>{SITE_NAME}は、大会主催者・放送局・配信サービスの公式サイトではありません。</p>
        {analytics ? (
          <p data-testid="analytics-notice">
            利用状況を把握するため、Google アナリティクスを使っています。Cookie を使って閲覧ページなどの情報を収集しますが、
            氏名など個人を特定する情報は含みません。データの扱いは
            <a
              href={ANALYTICS_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-0.5 underline underline-offset-2 hover:text-foreground"
            >
              Google のポリシー
              <span className="sr-only">（外部サイト・新しいタブで開きます）</span>
            </a>
            をご覧ください。
          </p>
        ) : null}
      </div>
    </footer>
  );
}
