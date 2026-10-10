import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { EventBreadcrumb } from "@/components/admin/event-breadcrumb";
import { NEW_SOURCE_DEFAULTS } from "@/components/admin/form-defaults";
import { SourceForm } from "@/components/admin/source-form";
import { Skeleton } from "@/components/ui/skeleton";
import { createSourceAction } from "@/server/admin/actions/sources";
import { getEventForSlotForm } from "@/server/admin/queries";
import { adminIdSchema } from "@/server/admin/schemas";
import { isAdminEnabled } from "@/server/admin-guard";

export const metadata: Metadata = { title: "情報源を登録" };

export default function NewSourcePage({ params }: PageProps<"/admin/events/[id]/sources/new">) {
  if (!isAdminEnabled()) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <NewSource params={params} />
    </Suspense>
  );
}

async function NewSource({ params }: Pick<PageProps<"/admin/events/[id]/sources/new">, "params">) {
  const { id } = await params;
  await connection();
  if (!adminIdSchema.safeParse(id).success) notFound();
  const event = await getEventForSlotForm(id);
  if (!event) notFound();
  return (
    <div className="grid gap-6">
      <EventBreadcrumb eventId={event.id} eventName={event.name} current="情報源を登録" />
      <h1 className="text-2xl font-semibold">出典・情報源を登録</h1>
      <SourceForm action={createSourceAction.bind(null, event.id)} defaults={NEW_SOURCE_DEFAULTS} submitLabel="情報源を登録" />
    </div>
  );
}
