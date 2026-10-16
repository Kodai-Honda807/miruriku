import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { BroadcastInfoBadge, DemoBadge, PublicationBadge } from "@/components/admin/badges";
import { formatEventDates } from "@/components/admin/format";
import { Notice, noticeMessage } from "@/components/admin/notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABELS } from "@/domain/labels";
import { listAdminEvents } from "@/server/admin/queries";
import { isAdminEnabled } from "@/server/admin-guard";
import type { AdminPageProps } from "../page-props";

export const metadata: Metadata = { title: "大会" };

export default function AdminEventsPage({ searchParams }: AdminPageProps) {
  if (!isAdminEnabled()) notFound();
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">大会</h1>
        <Button asChild>
          <Link href="/admin/events/new">大会を追加</Link>
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <EventsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function EventsTable({ searchParams }: Pick<AdminPageProps, "searchParams">) {
  const { notice } = await searchParams;
  await connection();
  const events = await listAdminEvents();
  return (
    <>
      <Notice message={noticeMessage(notice)} />
      {events.length === 0 ? (
        <p className="text-sm">大会はまだ登録されていません。</p>
      ) : (
        <Table>
          <caption className="sr-only">下書きを含む大会の一覧（開催日順）</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">大会名</TableHead>
              <TableHead scope="col">開催日（現地）</TableHead>
              <TableHead scope="col">公開状態</TableHead>
              <TableHead scope="col">放送情報</TableHead>
              <TableHead scope="col">放送枠（公開 / 全体）</TableHead>
              <TableHead scope="col">未レビュー候補</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const publishedSlots = event.broadcasts.filter((b) => b.status === "PUBLISHED").length;
              return (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-normal">
                    <div className="grid gap-1">
                      <Link href={`/admin/events/${event.id}`} className="font-medium underline underline-offset-4">
                        {event.name}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {CATEGORY_LABELS[event.category]} / {event.series.name}
                        {event.editionLabel ? ` / ${event.editionLabel}` : ""}
                        {event.isDemo ? <DemoBadge /> : null}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {formatEventDates(event.startDate, event.endDate, event.timezone)}
                  </TableCell>
                  <TableCell>
                    <PublicationBadge status={event.status} />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <BroadcastInfoBadge status={event.broadcastInfoStatus} />
                  </TableCell>
                  <TableCell>
                    {publishedSlots} / {event.broadcasts.length}
                  </TableCell>
                  <TableCell>
                    {event._count.candidates > 0 ? (
                      <Link href="/admin/candidates" className="underline underline-offset-4">
                        {event._count.candidates} 件
                      </Link>
                    ) : (
                      "0 件"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
