import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { RunStatusBadge } from "@/components/admin/badges";
import { formatAdminInstant } from "@/components/admin/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EXTRACTION_PROVIDER_KIND_LABELS, FETCH_MODE_LABELS } from "@/domain/labels";
import { listCollectionRuns } from "@/server/admin/queries";
import { isAdminEnabled } from "@/server/admin-guard";

export const metadata: Metadata = { title: "収集実行履歴" };

export default function RunsPage() {
  if (!isAdminEnabled()) notFound();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">収集実行履歴</h1>
      <p className="text-sm text-muted-foreground">
        収集 CLI の実行記録（最新 100 件）。日時は機械的な取得の日時です。エラーの詳細は管理画面にだけ表示します。
      </p>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <RunsTable />
      </Suspense>
    </div>
  );
}

async function RunsTable() {
  await connection();
  const runs = await listCollectionRuns();
  if (runs.length === 0) {
    return <p className="text-sm">まだ収集は実行されていません（pnpm collect で実行します）。</p>;
  }
  return (
    <Table>
      <caption className="sr-only">収集実行履歴</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">開始日時</TableHead>
          <TableHead scope="col">大会・情報源</TableHead>
          <TableHead scope="col">状態</TableHead>
          <TableHead scope="col">取得・抽出方法</TableHead>
          <TableHead scope="col">エラー</TableHead>
          <TableHead scope="col">候補</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id} className="align-top">
            <TableCell className="text-xs whitespace-normal">
              {formatAdminInstant(run.startedAt)}
              {run.finishedAt ? <div className="text-muted-foreground">終了 {formatAdminInstant(run.finishedAt)}</div> : null}
            </TableCell>
            <TableCell className="max-w-xs whitespace-normal">
              <Link href={`/admin/events/${run.source.event.id}`} className="underline underline-offset-4">
                {run.source.event.name}
              </Link>
              <div className="text-xs break-all text-muted-foreground">{run.source.url}</div>
            </TableCell>
            <TableCell>
              <div className="grid gap-1">
                <RunStatusBadge status={run.status} />
                {run.httpStatus !== null ? <span className="text-xs">HTTP {run.httpStatus}</span> : null}
              </div>
            </TableCell>
            <TableCell className="max-w-xs text-xs whitespace-normal">
              <div>{FETCH_MODE_LABELS[run.fetchMode]}</div>
              <div>
                {EXTRACTION_PROVIDER_KIND_LABELS[run.providerKind]}（{run.providerId}）
              </div>
            </TableCell>
            <TableCell className="max-w-xs text-xs whitespace-pre-wrap break-words">
              {run.errorCode ? <div className="font-medium text-destructive">{run.errorCode}</div> : null}
              {run.errorMessage ? <div>{run.errorMessage}</div> : null}
              {!run.errorCode && !run.errorMessage ? "—" : null}
            </TableCell>
            <TableCell className="text-xs">{run._count.candidates} 件</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
