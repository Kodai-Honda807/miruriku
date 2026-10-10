import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 表示中の大会に架空のデモデータが含まれることのお知らせ */
export function DemoNotice({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div
      role="note"
      data-testid="demo-notice"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-dashed border-orange-400 bg-orange-50 px-3 py-2.5 text-sm text-orange-950",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        {children ?? (
          <>
            <strong className="font-semibold">表示中の大会は動作確認用の架空のデモデータです。</strong>
            実在の大会・放送局・配信サービスとは関係ありません。
          </>
        )}
      </p>
    </div>
  );
}
