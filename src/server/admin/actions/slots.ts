"use server";
/**
 * 放送・配信枠の追加・更新・削除・公開状態の切り替え。
 * すべての Server Action は、入力の解析より前に assertAdminEnabled() を呼ぶ。
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { PUBLICATION_STATUSES } from "@/domain/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { assertAdminEnabled } from "@/server/admin-guard";
import { getNow } from "@/server/clock";
import { getPrisma } from "@/server/db";

import { GENERIC_SAVE_ERROR, logAdminError, revalidateAfterAdminWrite } from "../action-utils";
import { errorState, formDataToRecord, validationErrorState, type FormState } from "../form-state";
import { adminIdSchema, slotFormSchema, slotFormToData } from "../schemas";

/** 根拠の情報源は同じ大会の Source に限る */
async function isSourceOfEvent(db: PrismaClient, eventId: string, sourceId: string | null): Promise<boolean> {
  if (sourceId === null) return true;
  const source = await db.source.findFirst({ where: { id: sourceId, eventId }, select: { id: true } });
  return source !== null;
}

const SOURCE_ERROR = { sourceId: ["この大会に登録された情報源から選択してください"] };

export async function createSlotAction(eventId: string, prev: FormState, formData: FormData): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const id = adminIdSchema.safeParse(eventId);
  if (!id.success) return errorState(raw, prev, "大会が見つかりません。");
  const parsed = slotFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);
  const v = parsed.data;

  const db = getPrisma();
  try {
    const event = await db.event.findUnique({ where: { id: id.data }, select: { id: true } });
    if (!event) return errorState(raw, prev, "大会が見つかりません（削除された可能性があります）。");
    if (!(await isSourceOfEvent(db, id.data, v.sourceId))) {
      return errorState(raw, prev, "入力内容を確認してください", SOURCE_ERROR);
    }
    const max = await db.broadcastSlot.aggregate({ where: { eventId: id.data }, _max: { sortOrder: true } });
    await db.broadcastSlot.create({
      data: {
        ...slotFormToData(v),
        eventId: id.data,
        verifiedAt: v.markVerified ? getNow() : null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    logAdminError("放送枠の追加", error);
    return errorState(raw, prev, GENERIC_SAVE_ERROR);
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${id.data}?notice=slot-created`);
}

export async function updateSlotAction(
  eventId: string,
  slotId: string,
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const ids = z.object({ eventId: adminIdSchema, slotId: adminIdSchema }).safeParse({ eventId, slotId });
  if (!ids.success) return errorState(raw, prev, "放送枠が見つかりません。");
  const parsed = slotFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);
  const v = parsed.data;

  const db = getPrisma();
  try {
    if (!(await isSourceOfEvent(db, ids.data.eventId, v.sourceId))) {
      return errorState(raw, prev, "入力内容を確認してください", SOURCE_ERROR);
    }
    const result = await db.broadcastSlot.updateMany({
      where: { id: ids.data.slotId, eventId: ids.data.eventId },
      data: {
        ...slotFormToData(v),
        // 「確認日時を今に更新」にチェックした場合だけ、人の確認日時を更新する
        ...(v.markVerified ? { verifiedAt: getNow() } : {}),
      },
    });
    if (result.count === 0) return errorState(raw, prev, "放送枠が見つかりません（削除された可能性があります）。");
  } catch (error) {
    logAdminError("放送枠の更新", error);
    return errorState(raw, prev, GENERIC_SAVE_ERROR);
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${ids.data.eventId}?notice=slot-saved`);
}

const idsSchema = z.object({ eventId: adminIdSchema, slotId: adminIdSchema });

export async function deleteSlotAction(eventId: string, slotId: string): Promise<void> {
  assertAdminEnabled();
  const ids = idsSchema.parse({ eventId, slotId });

  await getPrisma()
    .broadcastSlot.deleteMany({ where: { id: ids.slotId, eventId: ids.eventId } })
    .catch((error: unknown) => {
      logAdminError("放送枠の削除", error);
      throw new Error("放送枠を削除できませんでした");
    });

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${ids.eventId}?notice=slot-deleted`);
}

const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);

export async function setSlotStatusAction(eventId: string, slotId: string, status: string): Promise<void> {
  assertAdminEnabled();
  const ids = idsSchema.parse({ eventId, slotId });
  const nextStatus = publicationStatusSchema.parse(status);

  await getPrisma()
    .broadcastSlot.updateMany({ where: { id: ids.slotId, eventId: ids.eventId }, data: { status: nextStatus } })
    .catch((error: unknown) => {
      logAdminError("放送枠の公開状態の変更", error);
      throw new Error("公開状態を変更できませんでした");
    });

  revalidateAfterAdminWrite();
  redirect(
    `/admin/events/${ids.eventId}?notice=${nextStatus === "PUBLISHED" ? "slot-published" : "slot-unpublished"}`,
  );
}
