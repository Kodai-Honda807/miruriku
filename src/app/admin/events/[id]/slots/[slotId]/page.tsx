import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { EventBreadcrumb, sourceOptionLabel } from "@/components/admin/event-breadcrumb";
import { slotToFormDefaults } from "@/components/admin/form-defaults";
import { formatAdminInstant } from "@/components/admin/format";
import { SlotForm } from "@/components/admin/slot-form";
import { Skeleton } from "@/components/ui/skeleton";
import { SOURCE_KIND_LABELS } from "@/domain/labels";
import { updateSlotAction } from "@/server/admin/actions/slots";
import { getEventForSlotForm, getSlot } from "@/server/admin/queries";
import { adminIdSchema } from "@/server/admin/schemas";
import { isAdminEnabled } from "@/server/admin-guard";

export const metadata: Metadata = { title: "放送・配信枠の編集" };

export default function EditSlotPage({ params }: PageProps<"/admin/events/[id]/slots/[slotId]">) {
  if (!isAdminEnabled()) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <EditSlot params={params} />
    </Suspense>
  );
}

async function EditSlot({ params }: Pick<PageProps<"/admin/events/[id]/slots/[slotId]">, "params">) {
  const { id, slotId } = await params;
  await connection();
  if (!adminIdSchema.safeParse(id).success || !adminIdSchema.safeParse(slotId).success) notFound();
  const [event, slot] = await Promise.all([getEventForSlotForm(id), getSlot(id, slotId)]);
  if (!event || !slot) notFound();
  return (
    <div className="grid gap-6">
      <EventBreadcrumb eventId={event.id} eventName={event.name} current="放送・配信枠の編集" />
      <h1 className="text-2xl font-semibold">放送・配信枠の編集: {slot.providerName}</h1>
      <p className="text-sm text-muted-foreground">
        放送・配信の日時は日本時間で入力してください。
        {slot.originCandidateId ? "この枠は収集候補の承認によって作成されました。" : null}
      </p>
      <SlotForm
        action={updateSlotAction.bind(null, event.id, slot.id)}
        defaults={slotToFormDefaults(slot)}
        sourceOptions={event.sources.map((s) => ({ id: s.id, label: sourceOptionLabel(s, SOURCE_KIND_LABELS[s.kind]) }))}
        submitLabel="放送・配信枠を保存"
        lastVerifiedLabel={slot.verifiedAt ? formatAdminInstant(slot.verifiedAt) : null}
      />
    </div>
  );
}
