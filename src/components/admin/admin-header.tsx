import Link from "next/link";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/events", label: "大会" },
  { href: "/admin/candidates", label: "収集候補" },
  { href: "/admin/runs", label: "収集実行履歴" },
] as const;

/** 管理画面のヘッダー。ローカル開発専用であることを常に表示する */
export function AdminHeader() {
  return (
    <header className="border-b bg-muted/40">
      <div
        role="note"
        aria-label="管理画面についての注意"
        className="border-b border-amber-500/40 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
      >
        <p className="mx-auto max-w-6xl font-medium">
          ローカル開発用の管理画面です。本番モードでは無効。公開運用の前に管理者認証・認可の実装が必要です
        </p>
        <p className="mx-auto max-w-6xl text-xs">
          NODE_ENV が production のとき、または MIRURIKU_ADMIN_ENABLED が &quot;true&quot; でないときは、管理画面と管理用の書き込みはすべて拒否されます（404）。
        </p>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/admin" className="font-semibold">
          みる陸 管理画面
        </Link>
        <nav aria-label="管理画面">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="underline-offset-4 hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/" className="text-muted-foreground underline-offset-4 hover:underline">
                公開ページを見る
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
