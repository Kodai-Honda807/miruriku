"use server";
/**
 * 大会の作成・更新・公開状態の切り替え。
 * すべての Server Action は、入力の解析より前に assertAdminEnabled() で管理機能の有効性を確認する
 * （Server Action は action ID を知っていればどのページからでも POST できるため、画面の制御だけに頼らない）。
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { PUBLICATION_STATUSES } from "@/domain/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { assertAdminEnabled } from "@/server/admin-guard";
import { getNow } from "@/server/clock";
import { getPrisma } from "@/server/db";

import { GENERIC_SAVE_ERROR, isUniqueViolation, logAdminError, revalidateAfterAdminWrite } from "../action-utils";
import { errorState, formDataToRecord, validationErrorState, type FieldErrors, type FormState } from "../form-state";
import { adminIdSchema, eventFormSchema, eventFormToData, type EventFormValues } from "../schemas";

/** DB と照合が必要な検証（slug の重複・シリーズの存在） */
async function findEventConflicts(
  db: PrismaClient,
  v: EventFormValues,
  currentEventId: string | null,
): Promise<FieldErrors | null> {
  const errors: FieldErrors = {};
  const sameSlug = await db.event.findUnique({ where: { slug: v.slug }, select: { id: true } });
  if (sameSlug && sameSlug.id !== currentEventId) {
    errors.slug = ["この slug は他の大会で使われています"];
  }
  if (v.seriesMode === "existing") {
    const series = await db.eventSeries.findUnique({ where: { id: v.seriesId }, select: { id: true } });
    if (!series) errors.seriesId = ["選択したシリーズが見つかりません"];
  } else {
    const series = await db.eventSeries.findUnique({ where: { slug: v.newSeriesSlug }, select: { id: true } });
    if (series) errors.newSeriesSlug = ["このシリーズ slug は既に使われています。既存のシリーズから選択してください"];
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

export async function createEventAction(prev: FormState, formData: FormData): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const parsed = eventFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);
  const v = parsed.data;

  const db = getPrisma();
  let eventId: string;
  try {
    const conflicts = await findEventConflicts(db, v, null);
    if (conflicts) return errorState(raw, prev, "入力内容を確認してください", conflicts);

    eventId = await db.$transaction(async (tx) => {
      const seriesId =
        v.seriesMode === "new"
          ? (await tx.eventSeries.create({ data: { name: v.newSeriesName, slug: v.newSeriesSlug }, select: { id: true } }))
              .id
          : v.seriesId;
      const event = await tx.event.create({
        data: {
          ...eventFormToData(v),
          seriesId,
          // 新規作成した大会は下書き。公開は編集画面で明示的に切り替える
          status: "DRAFT",
          broadcastCheckedAt: v.markBroadcastChecked ? getNow() : null,
        },
        select: { id: true },
      });
      return event.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorState(raw, prev, "slug が他のデータと重複しています。別の slug を入力してください。");
    }
    logAdminError("大会の作成", error);
    return errorState(raw, prev, GENERIC_SAVE_ERROR);
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${eventId}?notice=event-created`);
}

export async function updateEventAction(eventId: string, prev: FormState, formData: FormData): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const id = adminIdSchema.safeParse(eventId);
  if (!id.success) return errorState(raw, prev, "大会が見つかりません。");
  const parsed = eventFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);
  const v = parsed.data;

  const db = getPrisma();
  try {
    const existing = await db.event.findUnique({ where: { id: id.data }, select: { id: true } });
    if (!existing) return errorState(raw, prev, "大会が見つかりません（削除された可能性があります）。");

    const conflicts = await findEventConflicts(db, v, id.data);
    if (conflicts) return errorState(raw, prev, "入力内容を確認してください", conflicts);

    await db.$transaction(async (tx) => {
      const seriesId =
        v.seriesMode === "new"
          ? (await tx.eventSeries.create({ data: { name: v.newSeriesName, slug: v.newSeriesSlug }, select: { id: true } }))
              .id
          : v.seriesId;
      await tx.event.update({
        where: { id: id.data },
        data: {
          ...eventFormToData(v),
          seriesId,
          // 「放送情報を今確認した」にチェックした場合だけ、人の確認日時を更新する
          ...(v.markBroadcastChecked ? { broadcastCheckedAt: getNow() } : {}),
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return errorState(raw, prev, "slug が他のデータと重複しています。別の slug を入力してください。");
    }
    logAdminError("大会の更新", error);
    return errorState(raw, prev, GENERIC_SAVE_ERROR);
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${id.data}?notice=event-saved`);
}

const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);

/** 大会の下書き／公開の切り替え（フォームから bind して使う） */
export async function setEventStatusAction(eventId: string, status: string): Promise<void> {
  assertAdminEnabled();
  const id = adminIdSchema.parse(eventId);
  const nextStatus = publicationStatusSchema.parse(status);

  const result = await getPrisma()
    .event.updateMany({ where: { id }, data: { status: nextStatus } })
    .catch((error: unknown) => {
      logAdminError("大会の公開状態の変更", error);
      throw new Error("公開状態を変更できませんでした");
    });

  revalidateAfterAdminWrite();
  if (result.count === 0) redirect("/admin/events?notice=event-missing");
  redirect(`/admin/events/${id}?notice=${nextStatus === "PUBLISHED" ? "event-published" : "event-unpublished"}`);
}
