import { Skeleton } from "@/components/ui/skeleton";

/**
 * 管理画面の読み込み中表示（DB を読む画面への遷移時など）。
 * 公開ページには置かない（静的書き出しの HTML が読み込み中表示になり、JavaScript なしで本文が見えなくなるため）。
 */
export default function Loading() {
  return (
    <div role="status" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-8">
      <p className="text-sm text-muted-foreground">読み込み中…</p>
      <Skeleton aria-hidden="true" className="h-8 w-1/2 motion-reduce:animate-none" />
      <Skeleton aria-hidden="true" className="h-32 w-full motion-reduce:animate-none" />
      <Skeleton aria-hidden="true" className="h-32 w-full motion-reduce:animate-none" />
    </div>
  );
}
