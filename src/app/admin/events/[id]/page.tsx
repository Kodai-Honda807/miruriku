import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import {
  DemoBadge,
  PublicationBadge,
  ReviewStatusBadge,
  VerificationBadge,
} from "@/components/admin/badges";
import { EventForm } from "@/components/admin/event-form";
import { eventToFormDefaults } from "@/components/admin/form-defaults";
import { formatAdminInstant, formatEventDates } from "@/components/admin/format";
import { Notice, noticeMessage } from "@/components/admin/notice";
import { SessionForm } from "@/components/admin/session-form";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JST, dbDateToLocalDate, formatLocalDateJa, toZonedParts } from "@/domain/datetime";
import { formatBroadcastTiming } from "@/domain/event-timing";
import {
  BROADCAST_MEDIUM_LABELS,
  COST_TYPE_LABELS,
  EXTRACTION_PROVIDER_KIND_LABELS,
  REGION_AVAILABILITY_LABELS,
  SOURCE_KIND_LABELS,
  VIEWING_TYPE_LABELS,
} from "@/domain/labels";
import { safeExternalHref } from "@/domain/url";
import { setEventStatusAction, updateEventAction } from "@/server/admin/actions/events";
import { createSessionAction, deleteSessionAction } from "@/server/admin/actions/sessions";
import { deleteSlotAction, setSlotStatusAction } from "@/server/admin/actions/slots";
import { deleteSourceAction } from "@/server/admin/actions/sources";
import { getAdminEvent, listSeriesOptions, type AdminEvent } from "@/server/admin/queries";
import { adminIdSchema } from "@/server/admin/schemas";
import { isAdminEnabled } from "@/server/admin-guard";

export const metadata: Metadata = { title: "大会の編集" };

export default function EditEventPage({ params, searchParams }: PageProps<"/admin/events/[id]">) {
  if (!isAdminEnabled()) notFound();
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EventEditor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function EditorSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="読み込み中">
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-96" />
    </div>
  );
}

async function EventEditor({ params, searchParams }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  const { notice } = await searchParams;
  await connection();
  if (!adminIdSchema.safeParse(id).success) notFound();
  const [event, series] = await Promise.all([getAdminEvent(id), listSeriesOptions()]);
  if (!event) notFound();

  const nextStatus = event.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";

  return (
    <div className="grid gap-8">
      <div className="grid gap-3">
        <nav aria-label="パンくずリスト" className="text-sm">
          <Link href="/admin/events" className="underline underline-offset-4">
            大会
          </Link>
          <span aria-hidden="true"> / </span>
          <span>編集</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <PublicationBadge status={event.status} />
          {event.isDemo ? <DemoBadge /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatEventDates(event.startDate, event.endDate, event.timezone)} / シリーズ: {event.series.name}
        </p>
        <Notice message={noticeMessage(notice)} />
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <p className="text-sm">
            公開状態: <strong>{event.status === "PUBLISHED" ? "公開中" : "下書き（公開ページに表示されません）"}</strong>
          </p>
          <form action={setEventStatusAction.bind(null, event.id, nextStatus)}>
            <SubmitButton variant={nextStatus === "PUBLISHED" ? "default" : "outline"} size="sm">
              {nextStatus === "PUBLISHED" ? "大会を公開する" : "大会を下書きに戻す"}
            </SubmitButton>
          </form>
          {event.status === "PUBLISHED" ? (
            <Link href={`/events/${event.slug}`} className="text-sm underline underline-offset-4">
              公開ページを見る
            </Link>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="event-info-heading" className="grid gap-4">
        <h2 id="event-info-heading" className="text-xl font-semibold">
          大会情報
        </h2>
        <EventForm
          action={updateEventAction.bind(null, event.id)}
          defaults={eventToFormDefaults(event)}
          seriesOptions={series}
          submitLabel="大会情報を保存"
          lastCheckedLabel={event.broadcastCheckedAt ? formatAdminInstant(event.broadcastCheckedAt) : null}
        />
      </section>

      <BroadcastsSection event={event} />
      <SourcesSection event={event} />
      <SessionsSection event={event} />
      <CandidatesSection event={event} />
    </div>
  );
}

function BroadcastsSection({ event }: { event: AdminEvent }) {
  return (
    <section aria-labelledby="broadcasts-heading" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="broadcasts-heading" className="text-xl font-semibold">
          放送・配信枠
        </h2>
        <Button asChild variant="outline">
          <Link href={`/admin/events/${event.id}/slots/new`}>放送・配信枠を追加</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        日時はすべて日本時間です。公開ページには「公開」の枠だけが表示されます（大会が下書きの場合は大会ごと非公開）。
      </p>
      {event.broadcasts.length === 0 ? (
        <p className="text-sm">放送・配信枠はまだありません。</p>
      ) : (
        <Table>
          <caption className="sr-only">放送・配信枠の一覧</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">媒体・局</TableHead>
              <TableHead scope="col">日時（日本時間）</TableHead>
              <TableHead scope="col">視聴条件</TableHead>
              <TableHead scope="col">検証・公開</TableHead>
              <TableHead scope="col">根拠・確認</TableHead>
              <TableHead scope="col">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {event.broadcasts.map((slot) => {
              const name = `${BROADCAST_MEDIUM_LABELS[slot.medium]} ${slot.providerName}`;
              const next = slot.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
              return (
                <TableRow key={slot.id} className="align-top">
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{slot.providerName}</div>
                    <div className="text-xs text-muted-foreground">{BROADCAST_MEDIUM_LABELS[slot.medium]}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {formatBroadcastTiming(
                      {
                        airDate: slot.airDate ? dbDateToLocalDate(slot.airDate) : null,
                        startAt: slot.startAt,
                        endAt: slot.endAt,
                      },
                      { withYear: true },
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs">
                    {COST_TYPE_LABELS[slot.cost]} / {VIEWING_TYPE_LABELS[slot.viewingType]} /{" "}
                    {REGION_AVAILABILITY_LABELS[slot.region]}
                    {slot.regionNote ? `（${slot.regionNote}）` : ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <VerificationBadge status={slot.verificationStatus} />
                      <PublicationBadge status={slot.status} />
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs">
                    <div>
                      {slot.source ? (slot.source.title ?? SOURCE_KIND_LABELS[slot.source.kind]) : "根拠なし"}
                    </div>
                    <div className="text-muted-foreground">確認: {formatAdminInstant(slot.verifiedAt)}</div>
                    {slot.originCandidateId ? (
                      <Link href={`/admin/candidates/${slot.originCandidateId}`} className="underline underline-offset-4">
                        承認した候補
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/events/${event.id}/slots/${slot.id}`}>
                          編集<span className="sr-only">（{name}）</span>
                        </Link>
                      </Button>
                      <form action={setSlotStatusAction.bind(null, event.id, slot.id, next)}>
                        <SubmitButton size="sm" variant="outline">
                          {next === "PUBLISHED" ? "公開する" : "下書きに戻す"}
                          <span className="sr-only">（{name}）</span>
                        </SubmitButton>
                      </form>
                      <form action={deleteSlotAction.bind(null, event.id, slot.id)}>
                        <SubmitButton
                          size="sm"
                          variant="destructive"
                          confirmMessage={`放送・配信枠「${slot.providerName}」を削除します。よろしいですか？`}
                        >
                          削除<span className="sr-only">（{name}）</span>
                        </SubmitButton>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function SourcesSection({ event }: { event: AdminEvent }) {
  return (
    <section aria-labelledby="sources-heading" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sources-heading" className="text-xl font-semibold">
          出典・情報源
        </h2>
        <Button asChild variant="outline">
          <Link href={`/admin/events/${event.id}/sources/new`}>情報源を登録</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        「収集」が許可された情報源だけが収集 CLI の取得対象です。最終取得は機械による取得日時で、人の確認日時とは別です。
      </p>
      {event.sources.length === 0 ? (
        <p className="text-sm">情報源はまだ登録されていません。</p>
      ) : (
        <Table>
          <caption className="sr-only">出典・情報源の一覧</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">種類・タイトル</TableHead>
              <TableHead scope="col">URL</TableHead>
              <TableHead scope="col">収集</TableHead>
              <TableHead scope="col">最終取得（機械）</TableHead>
              <TableHead scope="col">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {event.sources.map((source) => {
              const href = safeExternalHref(source.url);
              const name = source.title ?? source.url;
              return (
                <TableRow key={source.id} className="align-top">
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{SOURCE_KIND_LABELS[source.kind]}</div>
                    {source.title ? <div className="text-xs">{source.title}</div> : null}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-xs break-all">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                        {source.url}
                      </a>
                    ) : (
                      source.url
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{source.collectEnabled ? "許可" : "対象外"}</TableCell>
                  <TableCell className="text-xs whitespace-normal">{formatAdminInstant(source.lastFetchedAt)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/events/${event.id}/sources/${source.id}`}>
                          編集<span className="sr-only">（{name}）</span>
                        </Link>
                      </Button>
                      <form action={deleteSourceAction.bind(null, event.id, source.id)}>
                        <SubmitButton
                          size="sm"
                          variant="destructive"
                          confirmMessage="この情報源を削除します。根拠としての紐づけは外れ、収集実行履歴も削除されます。よろしいですか？"
                        >
                          削除<span className="sr-only">（{name}）</span>
                        </SubmitButton>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function SessionsSection({ event }: { event: AdminEvent }) {
  return (
    <section aria-labelledby="sessions-heading" className="grid gap-4">
      <h2 id="sessions-heading" className="text-xl font-semibold">
        セッション（競技日程）
      </h2>
      <p className="text-sm text-muted-foreground">
        複数日開催や種目別の開始時刻。日付・時刻は開催地（{event.timezone}）の現地時刻です。
      </p>
      {event.sessions.length === 0 ? (
        <p className="text-sm">セッションは登録されていません。</p>
      ) : (
        <ul className="grid gap-2">
          {event.sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{session.name}</span>
              <span>
                {formatLocalDateJa(dbDateToLocalDate(session.date), { withYear: true })}
                {session.startAt ? ` ${toZonedParts(session.startAt, event.timezone).time} 開始（現地）` : " 開始時刻不明"}
                {session.startAt && event.timezone !== JST
                  ? `（日本時間 ${formatAdminInstant(session.startAt)}）`
                  : ""}
              </span>
              {session.note ? <span className="text-muted-foreground">{session.note}</span> : null}
              <form action={deleteSessionAction.bind(null, event.id, session.id)} className="ml-auto">
                <SubmitButton
                  size="sm"
                  variant="destructive"
                  confirmMessage={`セッション「${session.name}」を削除します。よろしいですか？`}
                >
                  削除<span className="sr-only">（{session.name}）</span>
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-medium">セッションを追加</h3>
        <SessionForm
          action={createSessionAction.bind(null, event.id)}
          defaultDate={dbDateToLocalDate(event.startDate)}
          timezone={event.timezone}
        />
      </div>
    </section>
  );
}

function CandidatesSection({ event }: { event: AdminEvent }) {
  return (
    <section aria-labelledby="candidates-heading" className="grid gap-3">
      <h2 id="candidates-heading" className="text-xl font-semibold">
        この大会の収集候補（最新 10 件）
      </h2>
      {event.candidates.length === 0 ? (
        <p className="text-sm">収集候補はありません。</p>
      ) : (
        <ul className="grid gap-2 text-sm">
          {event.candidates.map((candidate) => (
            <li key={candidate.id} className="flex flex-wrap items-center gap-2">
              <ReviewStatusBadge status={candidate.reviewStatus} />
              <span>{formatAdminInstant(candidate.createdAt)}</span>
              <span className="text-muted-foreground">{EXTRACTION_PROVIDER_KIND_LABELS[candidate.providerKind]}</span>
              <Link href={`/admin/candidates/${candidate.id}`} className="underline underline-offset-4">
                詳細<span className="sr-only">（{formatAdminInstant(candidate.createdAt)} の候補）</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
