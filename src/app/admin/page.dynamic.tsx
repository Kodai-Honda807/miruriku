import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { RunStatusBadge } from "@/components/admin/badges";
import { formatAdminInstant } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardSummary } from "@/server/admin/queries";
import { isAdminEnabled } from "@/server/admin-guard";

export const metadata: Metadata = { title: "ダッシュボード" };

export default function AdminDashboardPage() {
  if (!isAdminEnabled()) notFound();
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">ダッシュボード</h1>
        <Button asChild>
          <Link href="/admin/events/new">大会を追加</Link>
        </Button>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardSummary />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );
}

async function DashboardSummary() {
  await connection();
  const summary = await getDashboardSummary();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>大会</h2>
          </CardTitle>
          <CardDescription>下書きを含むすべての大会</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
            <dt>公開</dt>
            <dd className="font-semibold">{summary.published} 件</dd>
            <dt>下書き</dt>
            <dd className="font-semibold">{summary.draft} 件</dd>
          </dl>
          <Link href="/admin/events" className="text-sm underline underline-offset-4">
            大会の一覧・編集
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>未レビューの収集候補</h2>
          </CardTitle>
          <CardDescription>承認するまで公開データには反映されません</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-2xl font-semibold">{summary.pending} 件</p>
          <Link href="/admin/candidates" className="text-sm underline underline-offset-4">
            収集候補を確認する
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>収集実行履歴</h2>
          </CardTitle>
          <CardDescription>収集 CLI による取得（機械的な取得日時）</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {summary.latestRun ? (
            <p className="flex flex-wrap items-center gap-2">
              最新: <RunStatusBadge status={summary.latestRun.status} />
              <span>{formatAdminInstant(summary.latestRun.startedAt)}</span>
              <span className="text-muted-foreground">{summary.latestRun.source.event.name}</span>
            </p>
          ) : (
            <p>まだ収集は実行されていません。</p>
          )}
          <p>失敗した実行: {summary.failedRuns} 件</p>
          <Link href="/admin/runs" className="underline underline-offset-4">
            収集実行履歴を見る
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
