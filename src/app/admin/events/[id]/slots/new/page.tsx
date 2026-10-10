import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { EventBreadcrumb, sourceOptionLabel } from "@/components/admin/event-breadcrumb";
import { NEW_SLOT_DEFAULTS } from "@/components/admin/form-defaults";
import { SlotForm } from "@/components/admin/slot-form";
import { Skeleton } from "@/components/ui/skeleton";
import { SOURCE_KIND_LABELS } from "@/domain/labels";
import { createSlotAction } from "@/server/admin/actions/slots";
import { getEventForSlotForm } from "@/server/admin/queries";
import { adminIdSchema } from "@/server/admin/schemas";
import { isAdminEnabled } from "@/server/admin-guard";

export const metadata: Metadata = { title: "放送・配信枠を追加" };

export default function NewSlotPage({ params }: PageProps<"/admin/events/[id]/slots/new">) {
  if (!isAdminEnabled()) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NewSlot params={params} />
    </Suspense>
  );
}

async function NewSlot({ params }: Pick<PageProps<"/admin/events/[id]/slots/new">, "params">) {
  const { id } = await params;
  await connection();
  if (!adminIdSchema.safeParse(id).success) notFound();
  const event = await getEventForSlotForm(id);
  if (!event) notFound();
  return (
    <div className="grid gap-6">
      <EventBreadcrumb eventId={event.id} eventName={event.name} current="放送・配信枠を追加" />
      <h1 className="text-2xl font-semibold">放送・配信枠を追加</h1>
      <p className="text-sm text-muted-foreground">
        放送・配信の日時は日本時間で入力してください（大会の開催地のタイムゾーンとは別です）。
      </p>
      <SlotForm
        action={createSlotAction.bind(null, event.id)}
        defaults={NEW_SLOT_DEFAULTS}
        sourceOptions={event.sources.map((s) => ({ id: s.id, label: sourceOptionLabel(s, SOURCE_KIND_LABELS[s.kind]) }))}
        submitLabel="放送・配信枠を追加"
      />
    </div>
  );
}
