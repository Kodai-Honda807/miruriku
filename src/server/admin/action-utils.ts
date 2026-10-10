/**
 * Server Actions の共通処理（サーバー専用）。
 */
import "server-only";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";

/** 一意制約違反（slug・URL の重複など。事前チェック後の競合で起こり得る） */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** 対象レコードが存在しない（更新・削除の競合など） */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** 内部エラーの詳細はサーバーのログにだけ出し、利用者には返さない */
export function logAdminError(context: string, error: unknown): void {
  console.error(`[admin] ${context} に失敗しました`, error);
}

/** 管理画面の書き込みは公開ページにも影響するため、全ページの表示を更新する */
export function revalidateAfterAdminWrite(): void {
  revalidatePath("/", "layout");
}

export const GENERIC_SAVE_ERROR = "保存に失敗しました。時間をおいて再度お試しください。";
