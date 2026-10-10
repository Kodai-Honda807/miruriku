"use server";
/**
 * 競技・セッション（EventSession）の追加・削除。日時は開催地の現地日付・時刻。
 * すべての Server Action は、入力の解析より前に assertAdminEnabled() を呼ぶ。
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertAdminEnabled } from "@/server/admin-guard";
import { getPrisma } from "@/server/db";

import { GENERIC_SAVE_ERROR, logAdminError, revalidateAfterAdminWrite } from "../action-utils";
import { errorState, formDataToRecord, validationErrorState, type FormState } from "../form-state";
import { adminIdSchema, sessionFormSchema, sessionFormToData } from "../schemas";

export async function createSessionAction(eventId: string, prev: FormState, formData: FormData): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const id = adminIdSchema.safeParse(eventId);
  if (!id.success) return errorState(raw, prev, "大会が見つかりません。");
  const parsed = sessionFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);

  const db = getPrisma();
  try {
    const event = await db.event.findUnique({ where: { id: id.data }, select: { timezone: true } });
    if (!event) return errorState(raw, prev, "大会が見つかりません（削除された可能性があります）。");
    const max = await db.eventSession.aggregate({ where: { eventId: id.data }, _max: { sortOrder: true } });
    await db.eventSession.create({
      data: {
        ...sessionFormToData(parsed.data, event.timezone),
        eventId: id.data,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    logAdminError("セッションの追加", error);
    return errorState(raw, prev, GENERIC_SAVE_ERROR);
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${id.data}?notice=session-created`);
}

export async function deleteSessionAction(eventId: string, sessionId: string): Promise<void> {
  assertAdminEnabled();
  const ids = z.object({ eventId: adminIdSchema, sessionId: adminIdSchema }).parse({ eventId, sessionId });

  await getPrisma()
    .eventSession.deleteMany({ where: { id: ids.sessionId, eventId: ids.eventId } })
    .catch((error: unknown) => {
      logAdminError("セッションの削除", error);
      throw new Error("セッションを削除できませんでした");
    });

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${ids.eventId}?notice=session-deleted`);
}
