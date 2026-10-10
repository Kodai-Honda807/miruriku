import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { EventBreadcrumb } from "@/components/admin/event-breadcrumb";
import { sourceToFormDefaults } from "@/components/admin/form-defaults";
import { formatAdminInstant } from "@/components/admin/format";
import { SourceForm } from "@/components/admin/source-form";
import { Skeleton } from "@/components/ui/skeleton";
import { updateSourceAction } from "@/server/admin/actions/sources";
import { getEventForSlotForm, getSource } from "@/server/admin/queries";
import { adminIdSchema } from "@/server/admin/schemas";
import { isAdminEnabled } from "@/server/admin-guard";

export const metadata: Metadata = { title: "情報源の編集" };

export default function EditSourcePage({ params }: PageProps<"/admin/events/[id]/sources/[sourceId]">) {
  if (!isAdminEnabled()) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <EditSource params={params} />
    </Suspense>
  );
}

async function EditSource({ params }: Pick<PageProps<"/admin/events/[id]/sources/[sourceId]">, "params">) {
  const { id, sourceId } = await params;
  await connection();
  if (!adminIdSchema.safeParse(id).success || !adminIdSchema.safeParse(sourceId).success) notFound();
  const [event, source] = await Promise.all([getEventForSlotForm(id), getSource(id, sourceId)]);
  if (!event || !source) notFound();
  return (
    <div className="grid gap-6">
      <EventBreadcrumb eventId={event.id} eventName={event.name} current="情報源の編集" />
      <h1 className="text-2xl font-semibold">出典・情報源の編集</h1>
      <p className="text-sm text-muted-foreground">
        最終取得（機械による取得日時）: {formatAdminInstant(source.lastFetchedAt)}
      </p>
      <SourceForm
        action={updateSourceAction.bind(null, event.id, source.id)}
        defaults={sourceToFormDefaults(source)}
        submitLabel="情報源を保存"
      />
    </div>
  );
}
