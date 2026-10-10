"use server";
/**
 * 出典・情報源（Source）の登録・更新・削除。
 * すべての Server Action は、入力の解析より前に assertAdminEnabled() を呼ぶ。
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertAdminEnabled } from "@/server/admin-guard";
import { getPrisma } from "@/server/db";

import { GENERIC_SAVE_ERROR, isUniqueViolation, logAdminError, revalidateAfterAdminWrite } from "../action-utils";
import { errorState, formDataToRecord, validationErrorState, type FormState } from "../form-state";
import { adminIdSchema, sourceFormSchema } from "../schemas";

const DUPLICATE_URL_ERROR = { url: ["この大会には同じ URL の情報源が既に登録されています"] };

export async function createSourceAction(eventId: string, prev: FormState, formData: FormData): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const id = adminIdSchema.safeParse(eventId);
  if (!id.success) return errorState(raw, prev, "大会が見つかりません。");
  const parsed = sourceFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);
  const v = parsed.data;

  const db = getPrisma();
  try {
    const event = await db.event.findUnique({ where: { id: id.data }, select: { id: true } });
    if (!event) return errorState(raw, prev, "大会が見つかりません（削除された可能性があります）。");
    const duplicate = await db.source.findUnique({
      where: { eventId_url: { eventId: id.data, url: v.url } },
      select: { id: true },
    });
    if (duplicate) return errorState(raw, prev, "入力内容を確認してください", DUPLICATE_URL_ERROR);

    await db.source.create({ data: { ...v, eventId: id.data } });
  } catch (error) {
    if (isUniqueViolation(error)) return errorState(raw, prev, "入力内容を確認してください", DUPLICATE_URL_ERROR);
    logAdminError("情報源の登録", error);
    return errorState(raw, prev, GENERIC_SAVE_ERROR);
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${id.data}?notice=source-created`);
}

const idsSchema = z.object({ eventId: adminIdSchema, sourceId: adminIdSchema });

export async function updateSourceAction(
  eventId: string,
  sourceId: string,
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const ids = idsSchema.safeParse({ eventId, sourceId });
  if (!ids.success) return errorState(raw, prev, "情報源が見つかりません。");
  const parsed = sourceFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);
  const v = parsed.data;

  const db = getPrisma();
  try {
    const duplicate = await db.source.findUnique({
      where: { eventId_url: { eventId: ids.data.eventId, url: v.url } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== ids.data.sourceId) {
      return errorState(raw, prev, "入力内容を確認してください", DUPLICATE_URL_ERROR);
    }
    const result = await db.source.updateMany({
      where: { id: ids.data.sourceId, eventId: ids.data.eventId },
      data: v,
    });
    if (result.count === 0) return errorState(raw, prev, "情報源が見つかりません（削除された可能性があります）。");
  } catch (error) {
    if (isUniqueViolation(error)) return errorState(raw, prev, "入力内容を確認してください", DUPLICATE_URL_ERROR);
    logAdminError("情報源の更新", error);
    return errorState(raw, prev, GENERIC_SAVE_ERROR);
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${ids.data.eventId}?notice=source-saved`);
}

/** 情報源を削除する。根拠として参照している放送枠・候補の紐づけは外れ、収集実行履歴は削除される */
export async function deleteSourceAction(eventId: string, sourceId: string): Promise<void> {
  assertAdminEnabled();
  const ids = idsSchema.parse({ eventId, sourceId });

  await getPrisma()
    .source.deleteMany({ where: { id: ids.sourceId, eventId: ids.eventId } })
    .catch((error: unknown) => {
      logAdminError("情報源の削除", error);
      throw new Error("情報源を削除できませんでした");
    });

  revalidateAfterAdminWrite();
  redirect(`/admin/events/${ids.eventId}?notice=source-deleted`);
}
