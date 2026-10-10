import Link from "next/link";

/** 大会配下の画面のパンくずリスト */
export function EventBreadcrumb({ eventId, eventName, current }: { eventId: string; eventName: string; current: string }) {
  return (
    <nav aria-label="パンくずリスト" className="text-sm">
      <Link href="/admin/events" className="underline underline-offset-4">
        大会
      </Link>
      <span aria-hidden="true"> / </span>
      <Link href={`/admin/events/${eventId}`} className="underline underline-offset-4">
        {eventName}
      </Link>
      <span aria-hidden="true"> / </span>
      <span>{current}</span>
    </nav>
  );
}

/** 情報源の選択肢の表示名 */
export function sourceOptionLabel(source: { kind: string; url: string; title: string | null }, kindLabel: string): string {
  return `${kindLabel}: ${source.title ?? source.url}`;
}
