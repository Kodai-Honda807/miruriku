import Link from "next/link";

import { SiteShell } from "@/components/site/site-shell";

export default function NotFound() {
  return (
    <SiteShell>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6" data-testid="not-found">
        <h1 className="text-2xl font-bold">ページが見つかりません</h1>
        <p className="text-sm text-muted-foreground">
          お探しの大会は見つからないか、まだ公開されていません。URL をご確認ください。
        </p>
        <p>
          <Link
            href="/"
            className="rounded-sm text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            大会一覧へ戻る
          </Link>
        </p>
      </div>
    </SiteShell>
  );
}
