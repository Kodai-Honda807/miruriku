import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { DemoBadge, PublicationBadge, ReviewStatusBadge } from "@/components/admin/badges";
import { formatAdminInstant, snapshotHasChanges } from "@/components/admin/format";
import { Skeleton } from "@/components/ui/skeleton";
import { EXTRACTION_PROVIDER_KIND_LABELS, FETCH_MODE_LABELS } from "@/domain/labels";
import { countCandidatesByStatus, listCandidates } from "@/server/admin/queries";
import { parseCandidateListFilter, type CandidateListFilter } from "@/server/admin/schemas";
import { isAdminEnabled } from "@/server/admin-guard";
import type { AdminPageProps } from "../page-props";

export const metadata: Metadata = { title: "収集候補" };

const FILTER_LABELS: Record<CandidateListFilter, string> = {
  pending: "未レビュー",
  approved: "承認済み",
  rejected: "却下",
  all: "すべて",
};

export default function CandidatesPage({ searchParams }: AdminPageProps) {
  if (!isAdminEnabled()) notFound();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">収集候補</h1>
      <p className="text-sm text-muted-foreground">
        収集 CLI が情報源から抽出した候補です。人が内容を確認して承認するまで、公開データには反映されません。
      </p>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <CandidateList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CandidateList({ searchParams }: Pick<AdminPageProps, "searchParams">) {
  const { status } = await searchParams;
  await connection();
  const filter = parseCandidateListFilter(status);
  const [candidates, counts] = await Promise.all([listCandidates(filter), countCandidatesByStatus()]);
  const countFor: Record<CandidateListFilter, number> = {
    pending: counts.PENDING,
    approved: counts.APPROVED,
    rejected: counts.REJECTED,
    all: counts.PENDING + counts.APPROVED + counts.REJECTED,
  };

  return (
    <div className="grid gap-4">
      <nav aria-label="レビュー状態で絞り込み">
        <ul className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(FILTER_LABELS) as CandidateListFilter[]).map((f) => (
            <li key={f}>
              <Link
                href={f === "pending" ? "/admin/candidates" : `/admin/candidates?status=${f}`}
                aria-current={f === filter ? "page" : undefined}
                className="inline-flex rounded-lg border px-3 py-1 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
              >
                {FILTER_LABELS[f]}（{countFor[f]}）
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {candidates.length === 0 ? (
        <p className="text-sm">
          {filter === "pending" ? "未レビューの候補はありません。" : "該当する候補はありません。"}
        </p>
      ) : (
        <ul className="grid gap-3" aria-label={`${FILTER_LABELS[filter]}の収集候補`}>
          {candidates.map((c) => {
            const hasChanges = snapshotHasChanges(c.diff);
            return (
              <li key={c.id} className="grid gap-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <ReviewStatusBadge status={c.reviewStatus} />
                  <span className="font-medium">{c.event.name}</span>
                  <PublicationBadge status={c.event.status} />
                  {c.event.isDemo ? <DemoBadge /> : null}
                </div>
                <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">情報源 URL</dt>
                  <dd className="break-all">{c.source?.url ?? "（情報源の登録が削除されています）"}</dd>
                  <dt className="text-muted-foreground">抽出方法</dt>
                  <dd>
                    {EXTRACTION_PROVIDER_KIND_LABELS[c.providerKind]}（{c.providerId}）
                  </dd>
                  <dt className="text-muted-foreground">取得方法</dt>
                  <dd>{FETCH_MODE_LABELS[c.fetchMode]}</dd>
                  <dt className="text-muted-foreground">作成日時</dt>
                  <dd>{formatAdminInstant(c.createdAt)}</dd>
                  <dt className="text-muted-foreground">変更の有無</dt>
                  <dd>
                    {hasChanges === null
                      ? "不明"
                      : hasChanges
                        ? "変更あり（作成時点の差分）"
                        : "変更なし（作成時点の差分）"}
                  </dd>
                  {c.reviewedAt ? (
                    <>
                      <dt className="text-muted-foreground">レビュー日時</dt>
                      <dd>{formatAdminInstant(c.reviewedAt)}</dd>
                    </>
                  ) : null}
                </dl>
                <div>
                  <Link href={`/admin/candidates/${c.id}`} className="text-sm font-medium underline underline-offset-4">
                    {c.event.name} の候補を確認
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
