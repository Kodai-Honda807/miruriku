"use server";
/**
 * 収集候補の承認・却下。承認・却下の本体は src/server/review/review-service.ts。
 * すべての Server Action は、入力の解析より前に assertAdminEnabled() を呼ぶ。
 */
import { redirect } from "next/navigation";

import { assertAdminEnabled } from "@/server/admin-guard";
import { getNow } from "@/server/clock";
import { getPrisma } from "@/server/db";
import { CandidateReviewError, approveCandidate, rejectCandidate, type ApproveResult } from "@/server/review/review-service";

import { logAdminError, revalidateAfterAdminWrite } from "../action-utils";
import { errorState, formDataToRecord, validationErrorState, type FormState } from "../form-state";
import { adminIdSchema, reviewFormSchema } from "../schemas";

export async function approveCandidateAction(
  candidateId: string,
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const id = adminIdSchema.safeParse(candidateId);
  if (!id.success) return errorState(raw, prev, "候補が見つかりません。");
  const parsed = reviewFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);

  let result: ApproveResult;
  try {
    result = await approveCandidate(getPrisma(), id.data, { now: getNow(), note: parsed.data.note });
  } catch (error) {
    if (error instanceof CandidateReviewError) {
      if (error.code === "NOT_PENDING") {
        // 別の画面などで先にレビューされた。最新の状態を表示する
        revalidateAfterAdminWrite();
        redirect(`/admin/candidates/${id.data}?notice=already-reviewed`);
      }
      return errorState(raw, prev, error.message);
    }
    logAdminError("候補の承認", error);
    return errorState(raw, prev, "承認に失敗しました。公開データは変更されていません。時間をおいて再度お試しください。");
  }

  revalidateAfterAdminWrite();
  const query = new URLSearchParams({
    notice: "approved",
    added: String(result.added),
    updated: String(result.updated),
    unchanged: String(result.unchanged),
    eventFields: String(result.eventFieldsChanged),
  });
  redirect(`/admin/candidates/${id.data}?${query.toString()}`);
}

export async function rejectCandidateAction(
  candidateId: string,
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  assertAdminEnabled();
  const raw = formDataToRecord(formData);
  const id = adminIdSchema.safeParse(candidateId);
  if (!id.success) return errorState(raw, prev, "候補が見つかりません。");
  const parsed = reviewFormSchema.safeParse(raw);
  if (!parsed.success) return validationErrorState(parsed.error, raw, prev);

  try {
    await rejectCandidate(getPrisma(), id.data, { now: getNow(), note: parsed.data.note });
  } catch (error) {
    if (error instanceof CandidateReviewError) {
      if (error.code === "NOT_PENDING") {
        revalidateAfterAdminWrite();
        redirect(`/admin/candidates/${id.data}?notice=already-reviewed`);
      }
      return errorState(raw, prev, error.message);
    }
    logAdminError("候補の却下", error);
    return errorState(raw, prev, "却下に失敗しました。時間をおいて再度お試しください。");
  }

  revalidateAfterAdminWrite();
  redirect(`/admin/candidates/${id.data}?notice=rejected`);
}
