import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { EventForm } from "@/components/admin/event-form";
import { newEventDefaults } from "@/components/admin/form-defaults";
import { Skeleton } from "@/components/ui/skeleton";
import { createEventAction } from "@/server/admin/actions/events";
import { listSeriesOptions } from "@/server/admin/queries";
import { isAdminEnabled } from "@/server/admin-guard";
import { getNow } from "@/server/clock";

export const metadata: Metadata = { title: "大会を追加" };

export default function NewEventPage() {
  if (!isAdminEnabled()) notFound();
  return (
    <div className="grid gap-6">
      <nav aria-label="パンくずリスト" className="text-sm">
        <Link href="/admin/events" className="underline underline-offset-4">
          大会
        </Link>
        <span aria-hidden="true"> / </span>
        <span>新規作成</span>
      </nav>
      <h1 className="text-2xl font-semibold">大会を追加</h1>
      <p className="text-sm text-muted-foreground">
        作成した大会は下書きになります。放送・配信枠や情報源は、作成後の編集画面で追加できます。
      </p>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NewEventForm />
      </Suspense>
    </div>
  );
}

async function NewEventForm() {
  await connection();
  const series = await listSeriesOptions();
  return (
    <EventForm
      action={createEventAction}
      defaults={newEventDefaults(getNow(), series.length > 0)}
      seriesOptions={series}
      submitLabel="大会を作成"
    />
  );
}
