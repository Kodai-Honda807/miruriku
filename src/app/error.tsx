"use client";

import { RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { SiteShell } from "@/components/site/site-shell";
import { Button } from "@/components/ui/button";

/**
 * 予期しないエラーの表示。内部のエラー内容（message・スタックなど）は画面に出さない。
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // 詳細はブラウザのコンソールにのみ出す（サーバー側のログは digest で照合できる）
    console.error(error);
  }, [error]);

  return (
    <SiteShell>
      <div role="alert" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-bold">大会情報を読み込めませんでした</h1>
        <p className="text-sm text-muted-foreground">
          一時的な問題の可能性があります。時間をおいて、もう一度お試しください。
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="button" onClick={() => retry()} className="h-10 px-4">
            <RotateCw aria-hidden="true" />
            再試行
          </Button>
          <Link
            href="/"
            className="rounded-sm text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            トップページへ戻る
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
