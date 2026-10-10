/**
 * 読み込み中の表示（Suspense の fallback / loading.tsx）。
 * スクリーンリーダーには role="status" で「読み込み中」を伝える。
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <Skeleton className={cn("motion-reduce:animate-none", className)} />;
}

export function LoadingStatus({ label = "読み込み中" }: { label?: string }) {
  return <span className="sr-only">{label}</span>;
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5" aria-hidden="true">
      <Bar className="h-5 w-16" />
      <Bar className="h-6 w-2/3" />
      <Bar className="h-4 w-1/2" />
      <Bar className="h-16 w-full" />
    </div>
  );
}

export function EventListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" className="flex flex-col gap-4" data-testid="event-list-loading">
      <LoadingStatus label="大会情報を読み込み中" />
      <p className="text-sm text-muted-foreground" aria-hidden="true">
        読み込み中…
      </p>
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function FilterFormSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <LoadingStatus label="絞り込み条件を読み込み中" />
      <Bar className="h-4 w-24" />
      <Bar className="h-10 w-full" />
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        <Bar className="h-9" />
        <Bar className="h-9" />
        <Bar className="h-9" />
      </div>
      <Bar className="h-9 w-3/4" />
    </div>
  );
}

export function EventDetailSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4" data-testid="event-detail-loading">
      <LoadingStatus label="大会情報を読み込み中" />
      <p className="text-sm text-muted-foreground" aria-hidden="true">
        読み込み中…
      </p>
      <Bar className="h-8 w-2/3" />
      <Bar className="h-4 w-1/3" />
      <Bar className="h-32 w-full" />
      <Bar className="h-48 w-full" />
    </div>
  );
}
