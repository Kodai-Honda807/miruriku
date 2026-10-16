import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { DemoBadge, PublicationBadge, RunStatusBadge } from "@/components/admin/badges";
import { CandidateDiffView } from "@/components/admin/candidate-diff";
import { formatAdminInstant } from "@/components/admin/format";
import { Notice, noticeMessage } from "@/components/admin/notice";
import { ReviewActions } from "@/components/admin/review-actions";
import { Skeleton } from "@/components/ui/skeleton";
import { parseStoredPayload, type NormalizedExtraction } from "@/domain/candidate";
import { computeCandidateDiff } from "@/domain/diff";
import {
  EXTRACTION_PROVIDER_KIND_LABELS,
  FETCH_MODE_LABELS,
  REVIEW_STATUS_LABELS,
  SOURCE_KIND_LABELS,
} from "@/domain/labels";
import { safeExternalHref } from "@/domain/url";
import { approveCandidateAction, rejectCandidateAction } from "@/server/admin/actions/candidates";
import { getCandidateDetail, getCurrentEventState } from "@/server/admin/queries";
import { adminIdSchema } from "@/server/admin/schemas";
import { isAdminEnabled } from "@/server/admin-guard";
import type { AdminPageProps } from "../../page-props";

export const metadata: Metadata = { title: "収集候補の確認" };

export default function CandidateDetailPage({ params, searchParams }: AdminPageProps<{ id: string }>) {
  if (!isAdminEnabled()) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <CandidateDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 承認直後の結果表示（件数は数字だけを受け付ける） */
function approvedMessage(sp: Record<string, string | string[] | undefined>): string | null {
  if (first(sp.notice) !== "approved") return null;
  const count = (key: string) => {
    const v = first(sp[key]);
    return v && /^\d{1,4}$/.test(v) ? Number(v) : 0;
  };
  return (
    `承認して DB に反映しました（放送・配信枠: 追加 ${count("added")} 件・更新 ${count("updated")} 件・` +
    `変更なし ${count("unchanged")} 件、大会の項目の変更: ${count("eventFields")} 件）。`
  );
}

function ExternalUrl({ url }: { url: string }) {
  const href = safeExternalHref(url);
  if (!href) return <span className="break-all">{url}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline underline-offset-2">
      {url}
    </a>
  );
}

async function CandidateDetail({ params, searchParams }: AdminPageProps<{ id: string }>) {
  const { id } = await params;
  const sp = await searchParams;
  await connection();
  if (!adminIdSchema.safeParse(id).success) notFound();
  const candidate = await getCandidateDetail(id);
  if (!candidate) notFound();

  // 差分は保存時のスナップショットではなく、現在のデータに対して再計算する
  let payload: NormalizedExtraction | null = null;
  try {
    payload = parseStoredPayload(candidate.payload);
  } catch {
    payload = null;
  }
  const current = payload ? await getCurrentEventState(candidate.eventId) : null;
  const diff = payload && current ? computeCandidateDiff(current, payload) : null;
  const isPending = candidate.reviewStatus === "PENDING";
  const run = candidate.run;

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <nav aria-label="パンくずリスト" className="text-sm">
          <Link href="/admin/candidates" className="underline underline-offset-4">
            収集候補
          </Link>
          <span aria-hidden="true"> / </span>
          <span>候補の詳細</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">収集候補: {candidate.event.name}</h1>
          <PublicationBadge status={candidate.event.status} />
          {candidate.event.isDemo ? <DemoBadge /> : null}
        </div>
        <p className="text-sm">
          <Link href={`/admin/events/${candidate.event.id}`} className="underline underline-offset-4">
            大会の編集画面を開く
          </Link>
          {candidate.event.status === "DRAFT" ? (
            <span className="text-muted-foreground">（この大会は下書きです。承認しても大会は下書きのままです）</span>
          ) : null}
        </p>
        <Notice message={approvedMessage(sp) ?? noticeMessage(sp.notice)} />
      </div>

      <section aria-labelledby="review-status-heading" className="grid gap-2 rounded-lg border p-4">
        <h2 id="review-status-heading" className="text-lg font-semibold">
          レビュー状態
        </h2>
        <p className="text-sm">
          状態: <strong>{REVIEW_STATUS_LABELS[candidate.reviewStatus]}</strong>
          {candidate.reviewedAt ? `（${formatAdminInstant(candidate.reviewedAt)}）` : null}
        </p>
        {candidate.reviewNote ? (
          <p className="text-sm whitespace-pre-wrap break-words">メモ: {candidate.reviewNote}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">候補の作成日時: {formatAdminInstant(candidate.createdAt)}</p>
      </section>

      <section aria-labelledby="origin-heading" className="grid gap-3">
        <h2 id="origin-heading" className="text-lg font-semibold">
          出所
        </h2>
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">情報源 URL</dt>
          <dd>{candidate.source ? <ExternalUrl url={candidate.source.url} /> : "（情報源の登録が削除されています）"}</dd>
          {candidate.source ? (
            <>
              <dt className="text-muted-foreground">情報源の種類</dt>
              <dd>
                {SOURCE_KIND_LABELS[candidate.source.kind]}
                {candidate.source.title ? ` / ${candidate.source.title}` : ""}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">取得方法</dt>
          <dd>{FETCH_MODE_LABELS[candidate.fetchMode]}</dd>
          <dt className="text-muted-foreground">抽出方法</dt>
          <dd>
            {EXTRACTION_PROVIDER_KIND_LABELS[candidate.providerKind]}（{candidate.providerId}）
          </dd>
          <dt className="text-muted-foreground">収集実行の状態</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {run ? (
              <>
                <RunStatusBadge status={run.status} />
                {run.httpStatus !== null ? <span>HTTP {run.httpStatus}</span> : null}
                {run.errorCode ? <span className="text-destructive">{run.errorCode}</span> : null}
              </>
            ) : (
              "（収集実行の記録がありません）"
            )}
          </dd>
          <dt className="text-muted-foreground">取得日時（機械）</dt>
          <dd>{run ? formatAdminInstant(run.startedAt) : "—"}</dd>
          {run?.finalUrl && run.finalUrl !== candidate.source?.url ? (
            <>
              <dt className="text-muted-foreground">最終 URL（リダイレクト後）</dt>
              <dd>
                <ExternalUrl url={run.finalUrl} />
              </dd>
            </>
          ) : null}
          {candidate.contentHash ? (
            <>
              <dt className="text-muted-foreground">取得内容のハッシュ</dt>
              <dd className="font-mono text-xs break-all">{candidate.contentHash}</dd>
            </>
          ) : null}
        </dl>
        <p className="text-xs text-muted-foreground">
          取得日時は収集 CLI による機械的な取得の日時で、人が確認した日時ではありません。
        </p>
      </section>

      <section aria-labelledby="diff-heading" className="grid gap-3">
        <h2 id="diff-heading" className="text-lg font-semibold">
          差分
        </h2>
        {!isPending ? (
          <p className="text-sm text-muted-foreground">
            この候補はレビュー済みです。下の差分は現在のデータとの比較で、承認によって反映済みの項目は「変更なし」と表示されます。
          </p>
        ) : null}
        {diff && payload ? (
          <CandidateDiffView diff={diff} payload={payload} eventTimezone={current!.timezone} />
        ) : (
          <p role="alert" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">
            保存されている候補データを現在の形式で読み込めないため、差分を表示できません。この候補は承認できません（却下はできます）。
          </p>
        )}
      </section>

      {isPending ? (
        <section aria-labelledby="review-heading" className="grid gap-3">
          <h2 id="review-heading" className="text-lg font-semibold">
            レビュー
          </h2>
          <ReviewActions
            approveAction={approveCandidateAction.bind(null, candidate.id)}
            rejectAction={rejectCandidateAction.bind(null, candidate.id)}
            canApprove={diff !== null}
          />
        </section>
      ) : null}
    </div>
  );
}
